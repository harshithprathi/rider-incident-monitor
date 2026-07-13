import { Job } from 'bull';
import { QueueService } from './queue.service';
import { SafeReturnService } from '../../safe-return/services/safe-return.service';
import { SafeReturnWarningJobData, SafeReturnDeadlineJobData } from '../types';
import { logger } from '../utils/logger';
import { asyncContext } from '../utils/async-context';

/**
 * R4, R6: Queue Processors
 * - Process safe return warning and deadline jobs
 * - Correlation ID tracking via AsyncLocalStorage
 * - Error handling with retry
 */
export class QueueProcessors {
  private safeReturnService: SafeReturnService;

  constructor() {
    this.safeReturnService = new SafeReturnService();
  }

  /**
   * Initialize all queue processors
   */
  public initialize(): void {
    const queueService = QueueService.getInstance();

    // Process warning jobs
    queueService.getWarningQueue().process(async (job: Job<SafeReturnWarningJobData>) => {
      return this.processWarningJob(job);
    });

    // Process deadline jobs
    queueService.getDeadlineQueue().process(async (job: Job<SafeReturnDeadlineJobData>) => {
      return this.processDeadlineJob(job);
    });

    logger.info('Queue processors initialized');
  }

  /**
   * Process safe return warning job
   * - Feature A: Send warning 10 minutes before deadline
   */
  private async processWarningJob(job: Job<SafeReturnWarningJobData>): Promise<void> {
    const correlationId = `job-warning-${job.id}`;

    // Wrap job execution in AsyncLocalStorage context for correlation tracking
    return asyncContext.run({ correlationId }, async () => {
      try {
        const { sessionId, riderId } = job.data;

        logger.info('Processing safe return warning job', {
          jobId: String(job.id),
          sessionId,
          riderId,
        });

        await this.safeReturnService.handleWarning(sessionId);

        logger.info('Safe return warning job completed', {
          jobId: String(job.id),
          sessionId,
        });

      } catch (error) {
        logger.error('Safe return warning job failed', error);
        throw error; // Bull will retry based on job options
      }
    });
  }

  /**
   * Process safe return deadline job
   * - Feature A: Create SAFE_RETURN_MISSED incident at deadline
   * - R1: Race-free execution
   */
  private async processDeadlineJob(job: Job<SafeReturnDeadlineJobData>): Promise<void> {
    const correlationId = `job-deadline-${job.id}`;

    // Wrap job execution in AsyncLocalStorage context for correlation tracking
    return asyncContext.run({ correlationId }, async () => {
      try {
        const { sessionId, riderId } = job.data;

        logger.info('Processing safe return deadline job', {
          jobId: String(job.id),
          sessionId,
          riderId,
        });

        await this.safeReturnService.handleDeadlineExpired(sessionId);

        logger.info('Safe return deadline job completed', {
          jobId: String(job.id),
          sessionId,
        });

      } catch (error) {
        logger.error('Safe return deadline job failed', error);
        throw error;
      }
    });
  }
}
