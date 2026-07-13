import { Types } from 'mongoose';
import { SafeReturnSession } from '../models/SafeReturnSession';
import { IncidentService } from './IncidentService';
import { QueueService } from './QueueService';
import {
  ISafeReturnSession,
  SafeReturnStatus,
  IncidentType,
  ApiResponse,
} from '../types';
import { logger } from '../utils/logger';

/**
 * Feature A: Safe Return Session Management
 * - Creates sessions with deadline tracking
 * - Schedules warning and deadline jobs
 * - Handles race between completion and expiry (R1)
 */
export class SafeReturnService {
  private incidentService: IncidentService;
  private queueService: QueueService;

  constructor() {
    this.incidentService = new IncidentService();
    this.queueService = QueueService.getInstance();
  }

  /**
   * Create new safe return session
   * - Schedules warning job (10 min before deadline)
   * - Schedules deadline job
   */
  async createSession(data: {
    riderId: string;
    destination: string;
    destinationCoords?: any;
    deadline: Date;
    organizationId: string;
    region: string;
  }): Promise<ApiResponse<{ session: ISafeReturnSession }>> {


    try {
      // Check if rider already has active session
      const existingSession = await SafeReturnSession.findOne({
        riderId: new Types.ObjectId(data.riderId),
        status: SafeReturnStatus.ACTIVE,
      });

      if (existingSession) {
        return {
          error: {
            code: 'ACTIVE_SESSION_EXISTS',
            message: 'Rider already has an active safe return session',
            details: { sessionId: existingSession._id },
          },
        };
      }

      // Create session
      const session = await SafeReturnSession.create({
        riderId: new Types.ObjectId(data.riderId),
        destination: data.destination,
        destinationCoords: data.destinationCoords,
        deadline: data.deadline,
        status: SafeReturnStatus.ACTIVE,
        organizationId: new Types.ObjectId(data.organizationId),
        region: data.region,
      });

      logger.info('Safe return session created', {
        sessionId: session._id,
        riderId: data.riderId,
        deadline: data.deadline,
      });

      // Schedule jobs
      await this.scheduleJobs(session, data.organizationId, data.region);

      return {
        data: { session },
        meta: {},
      };
    } catch (error) {
      logger.error('Failed to create safe return session', error);
      throw error;
    }
  }

  /**
   * Schedule warning and deadline jobs
   * - Warning: 10 minutes before deadline
   * - Deadline: at deadline time
   */
  private async scheduleJobs(
    session: ISafeReturnSession,
    organizationId: string,
    region: string
  ): Promise<void> {
    const now = new Date();
    const deadline = new Date(session.deadline);
    const warningTime = new Date(deadline.getTime() - 10 * 60 * 1000); // 10 min before

    let warningDelayValue: number | string = 'skipped';

    // Schedule warning job if there's time
    if (warningTime > now) {
      const warningDelay = warningTime.getTime() - now.getTime();
      warningDelayValue = warningDelay;
      const warningJob = await this.queueService.addSafeReturnWarningJob({
        sessionId: session._id.toString(),
        riderId: session.riderId.toString(),
        destination: session.destination,
        deadline: session.deadline,
      }, warningDelay);

      session.warningJobId = warningJob.id?.toString();
    }

    // Schedule deadline job
    const deadlineDelay = Math.max(0, deadline.getTime() - now.getTime());
    const deadlineJob = await this.queueService.addSafeReturnDeadlineJob({
      sessionId: session._id.toString(),
      riderId: session.riderId.toString(),
      destination: session.destination,
      organizationId,
      region,
    }, deadlineDelay);

    session.deadlineJobId = deadlineJob.id?.toString();
    await session.save();

    logger.info('Safe return jobs scheduled', {
      sessionId: session._id,
      warningJobId: session.warningJobId,
      deadlineJobId: session.deadlineJobId,
      warningDelay: warningDelayValue,
      deadlineDelay,
    });
  }

  /**
   * R1: Race-free session completion
   * - Atomic update with status condition
   * - Cancels scheduled jobs
   * - Handles race with deadline expiry
   */
  async completeSession(
    sessionId: string,
    riderId: string
  ): Promise<ApiResponse<{ session: ISafeReturnSession | null }>> {


    try {
      // Atomic update - only succeeds if status is ACTIVE
      const session = await SafeReturnSession.findOneAndUpdate(
        {
          _id: new Types.ObjectId(sessionId),
          riderId: new Types.ObjectId(riderId),
          status: SafeReturnStatus.ACTIVE, // Only update if ACTIVE
        },
        {
          $set: {
            status: SafeReturnStatus.COMPLETED,
            completedAt: new Date(),
          },
        },
        { new: true }
      );

      if (!session) {
        logger.warn('Session completion failed - not found or already completed', {
          sessionId,
          riderId,
        });

        return {
          data: { session: null },
          error: {
            code: 'SESSION_NOT_FOUND_OR_COMPLETED',
            message: 'Session not found or already completed',
          },
        };
      }

      logger.info('Safe return session completed', {
        sessionId: session._id,
        riderId,
      });

      // Cancel pending jobs
      await this.cancelJobs(session);

      return {
        data: { session },
        meta: {},
      };
    } catch (error) {
      logger.error('Failed to complete safe return session', error);
      throw error;
    }
  }

  /**
   * Handle deadline expiry - Feature A
   * - Creates SAFE_RETURN_MISSED incident
   * - Only executes if session is still ACTIVE (race condition handling)
   */
  async handleDeadlineExpired(sessionId: string): Promise<void> {


    try {
      // Atomically mark session as handled
      // This prevents duplicate incident creation if job runs multiple times
      const session = await SafeReturnSession.findOneAndUpdate(
        {
          _id: new Types.ObjectId(sessionId),
          status: SafeReturnStatus.ACTIVE, // Only if still ACTIVE
        },
        {
          $set: { status: SafeReturnStatus.COMPLETED },
        },
        { new: true }
      ).populate('riderId', 'name email phone');

      if (!session) {
        logger.info('Deadline already handled or session completed', {
          sessionId,
        });
        return;
      }

      logger.warn('Safe return deadline expired - creating incident', {
        sessionId: session._id,
        riderId: session.riderId,
        deadline: session.deadline,
      });

      // Create SAFE_RETURN_MISSED incident
      await this.incidentService.createIncidentIdempotent(
        `safe-return-${sessionId}-${Date.now()}`, // Unique idempotency key
        {
          type: IncidentType.SAFE_RETURN_MISSED,
          riderId: session.riderId._id.toString(),
          location: session.destinationCoords || {
            latitude: 0,
            longitude: 0,
            address: session.destination,
            timestamp: new Date(),
          },
          organizationId: session.organizationId.toString(),
          region: session.region,
          description: `Safe return deadline missed. Expected at: ${session.destination}`,
        }
      );

      logger.info('SAFE_RETURN_MISSED incident created', {
        sessionId: session._id,
      });

    } catch (error) {
      logger.error('Failed to handle deadline expiry', error);
      throw error;
    }
  }

  /**
   * Handle warning notification - Feature A
   * - Logs warning (in production would send SMS/push notification)
   */
  async handleWarning(sessionId: string): Promise<void> {


    try {
      const session = await SafeReturnSession.findById(sessionId)
        .populate('riderId', 'name email phone');

      if (!session || session.status !== SafeReturnStatus.ACTIVE) {
        logger.info('Warning skipped - session completed or not found', {
          sessionId,
        });
        return;
      }

      const rider = session.riderId as any;

      // Console log as per requirement
      console.log('\n⚠️  SAFE RETURN WARNING ⚠️');
      console.log('================================');
      console.log(`Rider: ${rider.name}`);
      console.log(`Destination: ${session.destination}`);
      console.log(`Deadline: ${session.deadline.toISOString()}`);
      console.log(`Time remaining: 10 minutes`);
      console.log('================================\n');

      logger.warn('Safe return warning sent', {
        sessionId: session._id,
        riderId: rider._id,
        deadline: session.deadline,
      });

    } catch (error) {
      logger.error('Failed to handle warning', error);
      throw error;
    }
  }

  /**
   * Cancel pending jobs
   */
  private async cancelJobs(session: ISafeReturnSession): Promise<void> {
    if (session.warningJobId) {
      await this.queueService.removeJob(session.warningJobId);
      logger.info('Warning job cancelled', { jobId: session.warningJobId });
    }

    if (session.deadlineJobId) {
      await this.queueService.removeJob(session.deadlineJobId);
      logger.info('Deadline job cancelled', { jobId: session.deadlineJobId });
    }
  }

  /**
   * Get session details
   */
  async getSession(
    sessionId: string,
    riderId: string
  ): Promise<ApiResponse<{ session: ISafeReturnSession | null }>> {
    try {
      const session = await SafeReturnSession.findOne({
        _id: new Types.ObjectId(sessionId),
        riderId: new Types.ObjectId(riderId),
      }).lean();

      if (!session) {
        return {
          error: {
            code: 'SESSION_NOT_FOUND',
            message: 'Session not found',
          },
        };
      }

      return {
        data: { session: session as ISafeReturnSession },
        meta: {},
      };
    } catch (error) {
      logger.error('Failed to get session', error);
      throw error;
    }
  }

  /**
   * Get rider's active safe return session
   */
  async getActiveSession(riderId: string): Promise<ApiResponse<{ session: ISafeReturnSession | null }>> {
    try {
      const session = await SafeReturnSession.findOne({
        riderId: new Types.ObjectId(riderId),
        status: SafeReturnStatus.ACTIVE,
      });

      return {
        data: { session },
        meta: {},
      };
    } catch (error) {
      logger.error('Failed to get active safe return session', error);
      throw error;
    }
  }

  /**
   * Extend active safe return session deadline
   */
  async extendSession(
    sessionId: string,
    riderId: string,
    additionalMinutes: number
  ): Promise<ApiResponse<{ session: ISafeReturnSession | null }>> {


    try {
      const session = await SafeReturnSession.findOne({
        _id: new Types.ObjectId(sessionId),
        riderId: new Types.ObjectId(riderId),
        status: SafeReturnStatus.ACTIVE,
      });

      if (!session) {
        return {
          error: {
            code: 'SESSION_NOT_FOUND_OR_INACTIVE',
            message: 'Active session not found or already completed',
          },
        };
      }

      const currentDeadline = new Date(session.deadline);
      const newDeadline = new Date(currentDeadline.getTime() + additionalMinutes * 60 * 1000);
      session.deadline = newDeadline;

      // Cancel old jobs
      await this.cancelJobs(session);

      // Reset job IDs
      session.warningJobId = undefined;
      session.deadlineJobId = undefined;

      // Schedule new jobs
      await this.scheduleJobs(session, session.organizationId.toString(), session.region);

      logger.info('Safe return session extended', {
        sessionId: session._id,
        newDeadline,
      });

      return {
        data: { session },
        meta: {},
      };
    } catch (error) {
      logger.error('Failed to extend safe return session', error);
      throw error;
    }
  }
}
