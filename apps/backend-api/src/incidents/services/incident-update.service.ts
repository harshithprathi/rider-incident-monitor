import { Types } from 'mongoose';
import { IncidentUpdate } from '../schemas/incident-update.model';
import { IIncidentUpdate, IncidentUpdateType, ApiResponse } from '../../core/types';
import { logger } from '../../core/utils/logger';
import { eventBus } from '../../core/utils/events';

/**
 * R2: Causally-Ordered, Gap-Free Incident Update Stream
 * - Server-assigned monotonic sequence numbers
 * - Atomic sequence generation
 * - No duplicates, skips, or reordering
 */
export class IncidentUpdateService {
  /**
   * Create incident update with monotonic sequence number
   * - Atomically generates next sequence number
   * - Unique index prevents duplicates
   * - Bounded iterative retry (max 5 attempts) on duplicate key collision
   */
  async createUpdate(data: {
    incidentId: string;
    type: IncidentUpdateType;
    data: Record<string, unknown>;
    createdBy?: string;
  }): Promise<IIncidentUpdate> {
    const incidentId = new Types.ObjectId(data.incidentId);
    const maxRetries = 5;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Generate next sequence number atomically
        // This ensures no gaps or duplicates even under concurrency
        const lastUpdate = await IncidentUpdate.findOne({ incidentId })
          .sort({ sequenceNumber: -1 })
          .select('sequenceNumber')
          .lean();

        const sequenceNumber = (lastUpdate?.sequenceNumber || 0) + 1;

        // Create update with sequence number
        // Unique index on (incidentId, sequenceNumber) prevents duplicates
        const update = await IncidentUpdate.create({
          incidentId,
          sequenceNumber,
          type: data.type,
          data: data.data,
          createdBy: data.createdBy ? new Types.ObjectId(data.createdBy) : undefined,
        });

        logger.info('Incident update created', {
          incidentId: data.incidentId,
          sequenceNumber,
          type: data.type,
        });

        // Emit event for real-time Socket.IO broadcasting
        eventBus.emit('incident_update', {
          incidentId: data.incidentId,
          update,
        });

        return update;
      } catch (error: unknown) {
        const mongoError = error as { code?: number };
        // Handle duplicate sequence number (race condition)
        if (mongoError.code === 11000 && attempt < maxRetries) {
          logger.warn('Duplicate sequence number detected, retrying', {
            incidentId: data.incidentId,
            attempt: String(attempt),
            maxRetries: String(maxRetries),
          });
          continue; // Bounded iterative retry instead of unbounded recursion
        }

        logger.error('Failed to create incident update', error);
        throw error;
      }
    }

    // Should not reach here, but TypeScript requires a return
    throw new Error(`Failed to create incident update after ${maxRetries} attempts`);
  }

  /**
   * Feature B: Get last N updates for replay
   * - Used by Socket.IO to replay history
   * - Returns in correct sequence order
   */
  async getLastNUpdates(
    incidentId: string,
    count = 20
  ): Promise<IIncidentUpdate[]> {
    try {
      const updates = await IncidentUpdate.find({
        incidentId: new Types.ObjectId(incidentId),
      })
        .sort({ sequenceNumber: -1 })
        .limit(count)
        .lean();

      // Return in ascending order for replay
      return updates.reverse() as IIncidentUpdate[];
    } catch (error) {
      logger.error('Failed to get last N updates', error);
      throw error;
    }
  }

  /**
   * Get updates after a specific sequence number
   * - Used for gap detection and live streaming
   */
  async getUpdatesAfterSequence(
    incidentId: string,
    afterSequence: number
  ): Promise<IIncidentUpdate[]> {
    try {
      const updates = await IncidentUpdate.find({
        incidentId: new Types.ObjectId(incidentId),
        sequenceNumber: { $gt: afterSequence },
      })
        .sort({ sequenceNumber: 1 })
        .lean();

      return updates as IIncidentUpdate[];
    } catch (error) {
      logger.error('Failed to get updates after sequence', error);
      throw error;
    }
  }

  /**
   * Get all updates for an incident
   * - Used for full incident history
   */
  async getAllUpdates(incidentId: string): Promise<ApiResponse<{ updates: IIncidentUpdate[] }>> {
    try {
      const updates = await IncidentUpdate.find({
        incidentId: new Types.ObjectId(incidentId),
      })
        .sort({ sequenceNumber: 1 })
        .lean();

      return {
        data: { updates: updates as IIncidentUpdate[] },
        meta: { total: updates.length },
      };
    } catch (error) {
      logger.error('Failed to get all updates', error);
      throw error;
    }
  }

  /**
   * Detect gaps in sequence numbers
   * - Client-side validation helper
   */
  detectGaps(updates: IIncidentUpdate[]): number[] {
    if (updates.length === 0) return [];

    const gaps: number[] = [];
    for (let i = 0; i < updates.length - 1; i++) {
      const current = updates[i].sequenceNumber;
      const next = updates[i + 1].sequenceNumber;
      const expected = current + 1;

      if (next !== expected) {
        // Gap detected
        for (let missing = expected; missing < next; missing++) {
          gaps.push(missing);
        }
      }
    }

    return gaps;
  }
}
