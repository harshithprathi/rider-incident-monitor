import { Types, QueryFilter } from 'mongoose';
import { Incident } from '../schemas/incident.model';
import { IdempotencyRecord } from '../schemas/idempotency-record.model';
import { IncidentUpdateService } from './incident-update.service';
import {
  IIncident,
  IncidentType,
  IncidentStatus,
  IncidentUpdateType,
  ApiResponse,
  ILocation,
  ICrashData,
  IUnfilteredData,
} from '../../core/types';
import { logger } from '../../core/utils/logger';

export class IncidentService {
  private updateService: IncidentUpdateService;

  constructor() {
    this.updateService = new IncidentUpdateService();
  }

  /**
   * Feature C: Idempotent incident creation under concurrency
   * - Uses unique constraint on idempotency key
   * - Atomic reservation pattern prevents duplicates
   * - Handles in-flight requests gracefully
   */
  async createIncidentIdempotent(
    idempotencyKey: string,
    data: {
      type: IncidentType;
      riderId: string;
      location: ILocation;
      organizationId: string;
      region: string;
      processedData?: ICrashData;
      unfilteredData?: IUnfilteredData;
      description?: string;
    },
    _retryCount = 0
  ): Promise<ApiResponse<{ incident: IIncident }>> {
    try {
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
      const STALE_THRESHOLD_MS = 60000; // 60 seconds

      let existingRecord: any = null;
      let isNewRecord = false;

      try {
        existingRecord = await IdempotencyRecord.findOneAndUpdate(
          { key: idempotencyKey },
          {
            $setOnInsert: {
              key: idempotencyKey,
              incidentId: new Types.ObjectId(),
              status: 'PROCESSING',
              response: {},
              expiresAt,
            },
          },
          { upsert: true, new: false }
        );
        isNewRecord = !existingRecord;
      } catch (error: any) {
        // If an extreme race condition causes a duplicate key error, we treat it as record already exists (lost race)
        if (error.code === 11000) {
          existingRecord = await IdempotencyRecord.findOne({ key: idempotencyKey });
          isNewRecord = false;
        } else {
          throw error;
        }
      }

      // Step 2a: We won the race — create the incident
      if (isNewRecord) {
        logger.info('Won idempotency race (atomic upsert)', { idempotencyKey });

        const incident = await Incident.create({
          type: data.type,
          status: IncidentStatus.LIVE,
          riderId: new Types.ObjectId(data.riderId),
          location: data.location,
          organizationId: new Types.ObjectId(data.organizationId),
          region: data.region,
          processedData: data.processedData,
          unfilteredData: data.unfilteredData,
          description: data.description,
        });

        logger.info('Incident created', {
          incidentId: incident._id,
          type: incident.type,
        });

        // Create first incident update (sequence 1)
        await this.updateService.createUpdate({
          incidentId: incident._id.toString(),
          type: IncidentUpdateType.CREATED,
          data: {
            type: incident.type,
            location: incident.location,
            createdAt: incident.createdAt,
          },
          createdBy: data.riderId,
          createdByModel: 'Rider',
        });

        const response: ApiResponse<{ incident: IIncident }> = {
          data: { incident },
          meta: {},
        };

        // Mark reservation as COMPLETED with the actual response
        await IdempotencyRecord.findOneAndUpdate(
          { key: idempotencyKey },
          {
            $set: {
              incidentId: incident._id,
              status: 'COMPLETED',
              response: response as any,
            },
          }
        );

        return response;
      }

      // Step 2b: Record already existed
      if (existingRecord) {
        if (existingRecord.status === 'COMPLETED' && existingRecord.response && Object.keys(existingRecord.response).length > 0) {
          logger.info('Returning existing incident from idempotency record', {
            idempotencyKey,
            incidentId: existingRecord.incidentId,
          });
          return existingRecord.response as ApiResponse<{ incident: IIncident }>;
        }

        // Step 2c: Record is PROCESSING — check if stale
        const recordAge = Date.now() - new Date(existingRecord.createdAt).getTime();

        if (recordAge > STALE_THRESHOLD_MS && _retryCount < 1) {
          logger.warn('Detected stale idempotency reservation, recovering', {
            idempotencyKey,
            ageMs: recordAge,
          });

          await IdempotencyRecord.deleteOne({ key: idempotencyKey });
          return this.createIncidentIdempotent(idempotencyKey, data, _retryCount + 1);
        }

        // Still in progress (another live instance is working on it)
        logger.warn('Concurrent request detected - in progress', { idempotencyKey });
        return {
          error: {
            code: 'REQUEST_IN_PROGRESS',
            message: 'Request is being processed by another instance',
          },
        };
      }

      throw new Error('Unexpected idempotency execution path');
    } catch (error) {
      logger.error('Failed to create incident', error);
      throw error;
    }
  }

  /**
   * R1: Race-free incident status transition
   * - Uses atomic findOneAndUpdate with status condition
   * - Only one responder can resolve an incident
   */
  async resolveIncident(
    incidentId: string,
    responderId: string,
    organizationId: string,
    region: string
  ): Promise<ApiResponse<{ incident: IIncident | null }>> {
    try {
      // Atomic update with conditions - only succeeds if status is LIVE
      // This prevents race conditions when multiple responders try to resolve
      const incident = await Incident.findOneAndUpdate(
        {
          _id: new Types.ObjectId(incidentId),
          status: IncidentStatus.LIVE, // Only update if currently LIVE
          organizationId: new Types.ObjectId(organizationId),
          region,
        },
        {
          $set: {
            status: IncidentStatus.RESOLVED,
            responderId: new Types.ObjectId(responderId),
          },
        },
        {
          new: true,
          runValidators: true,
        }
      );

      if (!incident) {
        logger.warn('Incident resolution failed - already resolved or not found', {
          incidentId,
          responderId,
        });
        
        return {
          data: { incident: null },
          error: {
            code: 'INCIDENT_NOT_FOUND_OR_RESOLVED',
            message: 'Incident not found or already resolved',
          },
        };
      }

      logger.info('Incident resolved', {
        incidentId: incident._id,
        responderId,
      });

      // Create status change update
      await this.updateService.createUpdate({
        incidentId: incident._id.toString(),
        type: IncidentUpdateType.STATUS_CHANGE,
        data: {
          oldStatus: IncidentStatus.LIVE,
          newStatus: IncidentStatus.RESOLVED,
          responderId,
          resolvedAt: new Date(),
        },
        createdBy: responderId,
        createdByModel: 'Responder',
      });

      return {
        data: { incident },
        meta: {},
      };
    } catch (error) {
      logger.error('Failed to resolve incident', error);
      throw error;
    }
  }

  /**
   * List incidents with filtering and cursor pagination
   * - Respects org/region authorization
   * - Supports type and date range filters
   * - Cursor-based pagination for efficiency
   */
  async listIncidents(params: {
    organizationId: string;
    region: string;
    type?: IncidentType;
    status?: IncidentStatus;
    dateFrom?: Date;
    dateTo?: Date;
    cursor?: string;
    limit?: number;
  }): Promise<ApiResponse<{ incidents: IIncident[] }>> {
    const { organizationId, region, type, status, dateFrom, dateTo, cursor, limit = 20 } = params;
    
    try {
      const filter: QueryFilter<IIncident> = {
        organizationId: new Types.ObjectId(organizationId),
        region,
      };

      if (type) {
        filter.type = type;
      }

      if (status) {
        filter.status = status;
      }

      if (dateFrom || dateTo) {
        const createdAtFilter: { $gte?: Date; $lte?: Date } = {};
        if (dateFrom) createdAtFilter.$gte = dateFrom;
        if (dateTo) createdAtFilter.$lte = dateTo;
        filter.createdAt = createdAtFilter;
      }

      if (cursor) {
        // Cursor is base64 encoded createdAt timestamp
        const decodedCursor = Buffer.from(cursor, 'base64').toString('utf-8');
        const cursorDate = new Date(decodedCursor);
        filter.createdAt = {
          ...(filter.createdAt as Record<string, unknown> || {}),
          $lt: cursorDate,
        };
      }

      const incidents = await Incident.find(filter)
        .sort({ createdAt: -1 })
        .limit(limit + 1) // Fetch one extra to check if there are more
        .populate('riderId', 'name email phone')
        .populate('responderId', 'name email')
        .lean();

      const hasMore = incidents.length > limit;
      const resultIncidents = hasMore ? incidents.slice(0, limit) : incidents;

      let nextCursor: string | undefined;
      if (hasMore) {
        const lastIncident = resultIncidents[resultIncidents.length - 1];
        nextCursor = Buffer.from(lastIncident.createdAt.toISOString()).toString('base64');
      }

      return {
        data: { incidents: resultIncidents as IIncident[] },
        meta: {
          limit,
          cursor,
          nextCursor,
          hasMore,
        },
      };
    } catch (error) {
      logger.error('Failed to list incidents', error);
      throw error;
    }
  }

  /**
   * Get single incident with authorization check
   */
  async getIncident(
    incidentId: string,
    organizationId: string,
    region: string
  ): Promise<ApiResponse<{ incident: IIncident | null }>> {
    try {
      const incident = await Incident.findOne({
        _id: new Types.ObjectId(incidentId),
        organizationId: new Types.ObjectId(organizationId),
        region,
      })
        .populate('riderId', 'name email phone')
        .populate('responderId', 'name email')
        .lean();

      if (!incident) {
        return {
          error: {
            code: 'INCIDENT_NOT_FOUND',
            message: 'Incident not found or access denied',
          },
        };
      }

      return {
        data: { incident: incident as IIncident },
        meta: {},
      };
    } catch (error) {
      logger.error('Failed to get incident', error);
      throw error;
    }
  }
}
