import { Types } from 'mongoose';
import { Incident } from '../models/Incident';
import { IdempotencyRecord } from '../models/IdempotencyRecord';
import { IncidentUpdateService } from './IncidentUpdateService';
import {
  IIncident,
  IncidentType,
  IncidentStatus,
  IncidentUpdateType,
  ApiResponse,
} from '../types';
import { logger } from '../utils/logger';

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
      location: any;
      organizationId: string;
      region: string;
      processedData?: any;
      unfilteredData?: any;
      description?: string;
    }
  ): Promise<ApiResponse<{ incident: IIncident }>> {

    
    try {
      // Step 1: Try to atomically reserve the idempotency key
      // This prevents race conditions through unique constraint
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
      
      let idempotencyRecord = await IdempotencyRecord.findOne({ key: idempotencyKey });
      
      if (idempotencyRecord) {
        // Key exists - return existing incident
        if (idempotencyRecord.response) {
          logger.info('Returning existing incident from idempotency record', {
            idempotencyKey,
            incidentId: idempotencyRecord.incidentId,
          });
          return idempotencyRecord.response as ApiResponse<{ incident: IIncident }>;
        } else {
          // In-flight request - inform client
          logger.warn('Concurrent request detected - in progress', {
            idempotencyKey,
          });
          return {
            error: {
              code: 'REQUEST_IN_PROGRESS',
              message: 'Request is being processed by another instance',
            },
          };
        }
      }

      // Step 2: Create placeholder idempotency record (wins the race)
      try {
        const createdRecord = await IdempotencyRecord.create({
          key: idempotencyKey,
          incidentId: new Types.ObjectId(), // Temporary placeholder
          response: {} as any, // Placeholder, will update after incident creation
          expiresAt,
        });
        idempotencyRecord = createdRecord;
        
        logger.info('Won idempotency race', { idempotencyKey });
      } catch (error: any) {
        // Duplicate key error - another request won the race
        if (error.code === 11000) {
          logger.info('Lost idempotency race - retrying lookup', {
            idempotencyKey,
          });
          
          // Wait briefly and retry lookup
          await new Promise((resolve) => setTimeout(resolve, 50));
          const existing = await IdempotencyRecord.findOne({ key: idempotencyKey });
          
          if (existing?.response) {
            return existing.response as ApiResponse<{ incident: IIncident }>;
          }
          
          return {
            error: {
              code: 'REQUEST_IN_PROGRESS',
              message: 'Request is being processed',
            },
          };
        }
        throw error;
      }

      // Step 3: Create the incident (we won the race)
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

      // Step 4: Create first incident update (sequence 1)
      await this.updateService.createUpdate({
        incidentId: incident._id.toString(),
        type: IncidentUpdateType.CREATED,
        data: {
          type: incident.type,
          location: incident.location,
          createdAt: incident.createdAt,
        },
      });

      // Step 5: Update idempotency record with actual incident and response
      const response: ApiResponse<{ incident: IIncident }> = {
        data: { incident },
        meta: {},
      };

      if (idempotencyRecord) {
        idempotencyRecord.incidentId = incident._id;
        idempotencyRecord.response = response as any;
        await idempotencyRecord.save();
      }

      return response;
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
      const filter: any = {
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
        filter.createdAt = {};
        if (dateFrom) filter.createdAt.$gte = dateFrom;
        if (dateTo) filter.createdAt.$lte = dateTo;
      }

      if (cursor) {
        // Cursor is base64 encoded createdAt timestamp
        const decodedCursor = Buffer.from(cursor, 'base64').toString('utf-8');
        const cursorDate = new Date(decodedCursor);
        filter.createdAt = { ...(filter.createdAt || {}), $lt: cursorDate };
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
