import { SafeReturnSession } from '../models/SafeReturnSession';
import { SafeReturnService } from '../services/SafeReturnService';
import { QueueService } from '../services/QueueService';
import { SafeReturnStatus } from '../types';
import { logger } from '../utils/logger';
import { asyncContext } from '../utils/async-context';

/**
 * R4: Restart Reconciliation
 * - Re-arm pending jobs for active sessions on startup
 * - Handle deadlines that elapsed while offline
 * - Exactly-once execution guarantee
 */
export class StartupReconciliation {
  private safeReturnService: SafeReturnService;
  private queueService: QueueService;

  constructor() {
    this.safeReturnService = new SafeReturnService();
    this.queueService = QueueService.getInstance();
  }

  /**
   * Reconcile all active safe return sessions
   * - Called on server startup
   * - Reschedules jobs for future deadlines
   * - Fires missed deadlines exactly once
   */
  public async reconcileActiveSessions(): Promise<void> {
    // Wrap reconciliation in AsyncLocalStorage context for correlation tracking
    return asyncContext.run({ correlationId: 'reconciliation' }, async () => {
    try {
      logger.info('Starting safe return session reconciliation...');

      // Find all active sessions
      const activeSessions = await SafeReturnSession.find({
        status: SafeReturnStatus.ACTIVE,
      }).sort({ deadline: 1 });

      logger.info('Found active sessions to reconcile', {
        count: activeSessions.length,
      });

      const now = new Date();
      let rescheduled = 0;
      let expired = 0;

      for (const session of activeSessions) {
        try {
          const deadline = new Date(session.deadline);

          if (deadline <= now) {
            // Deadline elapsed while server was offline
            logger.warn('Found expired session during reconciliation', {
              sessionId: session._id,
              deadline: session.deadline,
              elapsed: now.getTime() - deadline.getTime(),
            });

            // Fire deadline handler exactly once
            await this.safeReturnService.handleDeadlineExpired(session._id.toString());
            expired++;

          } else {
            // Future deadline - reschedule jobs
            logger.info('Rescheduling jobs for active session', {
              sessionId: session._id,
              deadline: session.deadline,
              remaining: deadline.getTime() - now.getTime(),
            });

            // Calculate delays
            const deadlineDelay = deadline.getTime() - now.getTime();
            const warningTime = new Date(deadline.getTime() - 10 * 60 * 1000);
            const warningDelay = warningTime.getTime() - now.getTime();

            // Schedule warning job if there's time
            if (warningDelay > 0) {
              await this.queueService.addSafeReturnWarningJob(
                {
                  sessionId: session._id.toString(),
                  riderId: session.riderId.toString(),
                  destination: session.destination,
                  deadline: session.deadline,
                },
                warningDelay
              );
            }

            // Schedule deadline job
            await this.queueService.addSafeReturnDeadlineJob(
              {
                sessionId: session._id.toString(),
                riderId: session.riderId.toString(),
                destination: session.destination,
                organizationId: session.organizationId.toString(),
                region: session.region,
              },
              deadlineDelay
            );

            rescheduled++;
          }

        } catch (error) {
          logger.error('Failed to reconcile session', {
            sessionId: session._id,
            error,
          });
          // Continue with next session
        }
      }

      logger.info('Safe return session reconciliation complete', {
        total: activeSessions.length,
        rescheduled,
        expired,
      });

    } catch (error) {
      logger.error('Reconciliation failed', error);
      throw error;
    }
    }); // end asyncContext.run
  }

  /**
   * Clean up stale jobs from previous runs
   */
  public async cleanupStaleJobs(): Promise<void> {
    try {
      logger.info('Cleaning up stale jobs...');

      const warningQueue = this.queueService.getWarningQueue();
      const deadlineQueue = this.queueService.getDeadlineQueue();

      // Get all jobs
      const [warningJobs, deadlineJobs] = await Promise.all([
        warningQueue.getJobs(['delayed', 'waiting']),
        deadlineQueue.getJobs(['delayed', 'waiting']),
      ]);

      logger.info('Found jobs to check', {
        warning: warningJobs.length,
        deadline: deadlineJobs.length,
      });

      // Remove jobs for sessions that no longer exist or are completed
      let removed = 0;

      for (const job of [...warningJobs, ...deadlineJobs]) {
        const sessionId = job.data.sessionId;
        
        const session = await SafeReturnSession.findById(sessionId);
        
        if (!session || session.status !== SafeReturnStatus.ACTIVE) {
          await job.remove();
          removed++;
          
          logger.debug('Removed stale job', {
            jobId: job.id,
            sessionId,
          });
        }
      }

      logger.info('Stale job cleanup complete', { removed });

    } catch (error) {
      logger.error('Failed to clean up stale jobs', error);
      // Non-critical - don't throw
    }
  }
}
