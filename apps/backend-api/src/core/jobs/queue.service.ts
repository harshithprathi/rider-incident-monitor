import Queue, { Job, JobOptions } from 'bull';
import { getRedisClient } from '../config/redis';
import { SafeReturnWarningJobData, SafeReturnDeadlineJobData } from '../types';
import { logger } from '../utils/logger';

/**
 * R4, R6: Queue Service with Bull
 * - Crash-safe scheduling (persisted in Redis)
 * - Retry strategy with exponential backoff
 * - Dead letter queue for failed jobs
 * - Correlation ID logging
 */
export class QueueService {
  private static instance: QueueService;
  private safeReturnWarningQueue: Queue.Queue<SafeReturnWarningJobData>;
  private safeReturnDeadlineQueue: Queue.Queue<SafeReturnDeadlineJobData>;
  private deadLetterQueue: Queue.Queue<any>;
  private isShuttingDown = false;

  private constructor() {
    const redis = getRedisClient();

    // Safe Return Warning Queue
    this.safeReturnWarningQueue = new Queue<SafeReturnWarningJobData>(
      'safe-return-warning',
      {
        redis: {
          host: redis.options.host,
          port: redis.options.port as number,
        },
        defaultJobOptions: this.getDefaultJobOptions(),
      }
    );

    // Safe Return Deadline Queue
    this.safeReturnDeadlineQueue = new Queue<SafeReturnDeadlineJobData>(
      'safe-return-deadline',
      {
        redis: {
          host: redis.options.host,
          port: redis.options.port as number,
        },
        defaultJobOptions: this.getDefaultJobOptions(),
      }
    );

    // Dead Letter Queue
    this.deadLetterQueue = new Queue('dead-letter', {
      redis: {
        host: redis.options.host,
        port: redis.options.port as number,
      },
    });

    this.setupEventHandlers();
    logger.info('Queue service initialized');
  }

  public static getInstance(): QueueService {
    if (!QueueService.instance) {
      QueueService.instance = new QueueService();
    }
    return QueueService.instance;
  }

  /**
   * R6: Default job options with retry strategy
   */
  private getDefaultJobOptions(): JobOptions {
    return {
      attempts: 3, // Bounded retries
      backoff: {
        type: 'exponential',
        delay: 2000, // Start with 2 seconds
      },
      removeOnComplete: {
        age: 24 * 3600, // Keep completed jobs for 24 hours
        count: 1000,
      },
      removeOnFail: false, // Keep failed jobs for debugging
    };
  }

  /**
   * R6: Setup event handlers for observability
   */
  private setupEventHandlers(): void {
    // Warning Queue Events
    this.safeReturnWarningQueue.on('completed', (job: Job) => {
      logger.info('Safe return warning job completed', {
        jobId: job.id,
        correlationId: job.data.sessionId,
      });
    });

    this.safeReturnWarningQueue.on('failed', (job: Job, error: Error) => {
      logger.error('Safe return warning job failed', {
        jobId: job.id,
        correlationId: job.data.sessionId,
        error: error.message,
        attempts: job.attemptsMade,
      });

      // Move to dead letter queue after max attempts
      if (job.attemptsMade >= (job.opts.attempts || 3)) {
        this.moveToDeadLetter(job, error);
      }
    });

    // Deadline Queue Events
    this.safeReturnDeadlineQueue.on('completed', (job: Job) => {
      logger.info('Safe return deadline job completed', {
        jobId: job.id,
        correlationId: job.data.sessionId,
      });
    });

    this.safeReturnDeadlineQueue.on('failed', (job: Job, error: Error) => {
      logger.error('Safe return deadline job failed', {
        jobId: job.id,
        correlationId: job.data.sessionId,
        error: error.message,
        attempts: job.attemptsMade,
      });

      if (job.attemptsMade >= (job.opts.attempts || 3)) {
        this.moveToDeadLetter(job, error);
      }
    });

    // Dead Letter Queue Events
    this.deadLetterQueue.on('completed', (job: Job) => {
      logger.info('Dead letter processed', { jobId: job.id });
    });
  }

  /**
   * R6: Move failed jobs to dead letter queue
   */
  private async moveToDeadLetter(job: Job, error: Error): Promise<void> {
    try {
      await this.deadLetterQueue.add({
        originalQueue: job.queue.name,
        originalJobId: job.id,
        data: job.data,
        error: {
          message: error.message,
          stack: error.stack,
        },
        failedAt: new Date(),
        attempts: job.attemptsMade,
      });

      logger.info('Job moved to dead letter queue', {
        jobId: job.id,
        queue: job.queue.name,
      });
    } catch (err) {
      logger.error('Failed to move job to dead letter queue', err);
    }
  }

  /**
   * Add safe return warning job
   */
  async addSafeReturnWarningJob(
    data: SafeReturnWarningJobData,
    delay: number
  ): Promise<Job<SafeReturnWarningJobData>> {
    const job = await this.safeReturnWarningQueue.add(data, {
      delay,
      jobId: `warning-${data.sessionId}`, // Unique job ID prevents duplicates
    });

    logger.info('Safe return warning job scheduled', {
      jobId: job.id,
      sessionId: data.sessionId,
      delay,
    });

    return job;
  }

  /**
   * Add safe return deadline job
   */
  async addSafeReturnDeadlineJob(
    data: SafeReturnDeadlineJobData,
    delay: number
  ): Promise<Job<SafeReturnDeadlineJobData>> {
    const job = await this.safeReturnDeadlineQueue.add(data, {
      delay,
      jobId: `deadline-${data.sessionId}`, // Unique job ID prevents duplicates
    });

    logger.info('Safe return deadline job scheduled', {
      jobId: job.id,
      sessionId: data.sessionId,
      delay,
    });

    return job;
  }

  /**
   * Remove job by ID
   */
  async removeJob(jobId: string): Promise<void> {
    try {
      // Try warning queue
      const warningJob = await this.safeReturnWarningQueue.getJob(jobId);
      if (warningJob) {
        await warningJob.remove();
        logger.info('Job removed from warning queue', { jobId });
        return;
      }

      // Try deadline queue
      const deadlineJob = await this.safeReturnDeadlineQueue.getJob(jobId);
      if (deadlineJob) {
        await deadlineJob.remove();
        logger.info('Job removed from deadline queue', { jobId });
        return;
      }

      logger.warn('Job not found for removal', { jobId });
    } catch (error) {
      logger.error('Failed to remove job', { jobId, error });
    }
  }

  /**
   * Get queue references for processing
   */
  getWarningQueue(): Queue.Queue<SafeReturnWarningJobData> {
    return this.safeReturnWarningQueue;
  }

  getDeadlineQueue(): Queue.Queue<SafeReturnDeadlineJobData> {
    return this.safeReturnDeadlineQueue;
  }

  getDeadLetterQueue(): Queue.Queue<any> {
    return this.deadLetterQueue;
  }

  /**
   * R5: Graceful shutdown - drain in-flight jobs
   */
  async gracefulShutdown(): Promise<void> {
    if (this.isShuttingDown) {
      return;
    }

    this.isShuttingDown = true;
    logger.info('Starting graceful queue shutdown...');

    try {
      // Pause accepting new jobs
      await this.safeReturnWarningQueue.pause(true, true);
      await this.safeReturnDeadlineQueue.pause(true, true);
      await this.deadLetterQueue.pause(true, true);

      logger.info('Queues paused');

      // Wait for active jobs to complete (timeout: 30 seconds)
      await Promise.race([
        Promise.all([
          this.safeReturnWarningQueue.whenCurrentJobsFinished(),
          this.safeReturnDeadlineQueue.whenCurrentJobsFinished(),
          this.deadLetterQueue.whenCurrentJobsFinished(),
        ]),
        new Promise((resolve) => setTimeout(resolve, 30000)),
      ]);

      logger.info('Active jobs completed or timed out');

      // Close queues
      await this.safeReturnWarningQueue.close();
      await this.safeReturnDeadlineQueue.close();
      await this.deadLetterQueue.close();

      logger.info('Queue service shutdown complete');
    } catch (error) {
      logger.error('Error during queue shutdown', error);
      throw error;
    }
  }

  /**
   * Get queue health status
   */
  async getHealthStatus(): Promise<{
    warning: { waiting: number; active: number; failed: number };
    deadline: { waiting: number; active: number; failed: number };
    deadLetter: { waiting: number };
  }> {
    const [warningCounts, deadlineCounts, deadLetterCounts] = await Promise.all([
      this.safeReturnWarningQueue.getJobCounts(),
      this.safeReturnDeadlineQueue.getJobCounts(),
      this.deadLetterQueue.getJobCounts(),
    ]);

    return {
      warning: {
        warningCounts: warningCounts.waiting || 0,
        active: warningCounts.active || 0,
        failed: warningCounts.failed || 0,
      } as any,
      deadline: {
        waiting: deadlineCounts.waiting || 0,
        active: deadlineCounts.active || 0,
        failed: deadlineCounts.failed || 0,
      },
      deadLetter: {
        waiting: deadLetterCounts.waiting || 0,
      },
    };
  }
}
