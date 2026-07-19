import dotenv from 'dotenv';
import path from 'path';

// Load environment variables first
dotenv.config({ path: path.join(process.cwd(), '.env.local') });
dotenv.config({ path: path.join(process.cwd(), '.env') });

// Register Mongoose models to prevent MissingSchemaError during population
import './auth/schemas/organization.model';
import './auth/schemas/rider.model';
import './auth/schemas/responder.model';
import './incidents/schemas/incident.model';
import './incidents/schemas/incident-update.model';
import './safe-return/schemas/safe-return-session.model';
import './incidents/schemas/idempotency-record.model';

import express, { Express } from 'express';
import { createServer, Server as HTTPServer } from 'http';
import cors from 'cors';
import helmet from 'helmet';
import { connectDatabase, disconnectDatabase } from './core/config/database';
import { connectRedis, disconnectRedis } from './core/config/redis';
import { QueueService } from './core/jobs/queue.service';
import { SocketHandler } from './core/socket/socket-handler';
import { QueueProcessors } from './core/jobs/queue-processors';
import { StartupReconciliation } from './core/jobs/reconciliation';
import { correlationId } from './core/middlewares/correlation.middleware';
import { errorHandler, notFoundHandler } from './core/middlewares/error.middleware';
import { getAuthRouter } from './auth/auth.routes';
import { getIncidentRouter } from './incidents/incident.routes';
import { getSafeReturnRouter } from './safe-return/safe-return.routes';
import { logger } from './core/utils/logger';

class Application {
  private app: Express;
  private httpServer: HTTPServer;
  private socketHandler: SocketHandler | null = null;
  private queueService: QueueService | null = null;
  private isShuttingDown = false;

  constructor() {
    this.app = express();
    this.httpServer = createServer(this.app);
  }

  private setupMiddleware(): void {
    // Security
    this.app.use(helmet());
    
    const allowedOrigins = [
      process.env.FRONTEND_URL || 'http://localhost:4200',
      'http://localhost:4201',
      'http://localhost:5173',
      'http://127.0.0.1:4200',
      'http://127.0.0.1:4201',
    ];

    this.app.use(cors({
      origin: (origin, callback) => {
        if (!origin || allowedOrigins.indexOf(origin) !== -1 || origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
          callback(null, true);
        } else {
          callback(new Error('Not allowed by CORS'));
        }
      },
      credentials: true,
    }));

    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Correlation ID for request tracing
    this.app.use(correlationId);

    logger.info('Middleware configured');
  }

  private setupRoutes(): void {
    // Health check
    this.app.get('/health', (req, res) => {
      res.status(200).json({
        data: {
          status: 'healthy',
          timestamp: new Date().toISOString(),
        },
      });
    });

    // Mount feature routers
    this.app.use('/api/auth', getAuthRouter());
    this.app.use('/api/incidents', getIncidentRouter());
    this.app.use('/api/safe-return', getSafeReturnRouter());

    // 404 handler
    this.app.use(notFoundHandler);

    // Error handler (must be last)
    this.app.use(errorHandler);

    logger.info('Routes configured');
  }

  private async initializeServices(): Promise<void> {
    // Connect to databases
    await connectDatabase();
    connectRedis();

    // Initialize queue service
    this.queueService = QueueService.getInstance();

    // Initialize queue processors
    const queueProcessors = new QueueProcessors();
    queueProcessors.initialize();

    // R4: Startup reconciliation
    const reconciliation = new StartupReconciliation();
    await reconciliation.cleanupStaleJobs();
    await reconciliation.reconcileActiveSessions();

    logger.info('Services initialized');
  }

  private initializeSocketIO(): void {
    this.socketHandler = new SocketHandler(this.httpServer);
    logger.info('Socket.IO initialized');
  }

  /**
   * R5: Setup graceful shutdown handlers
   */
  private setupGracefulShutdown(): void {
    const shutdown = async (signal: string) => {
      if (this.isShuttingDown) {
        logger.warn('Shutdown already in progress');
        return;
      }

      this.isShuttingDown = true;
      logger.info(`${signal} received, starting graceful shutdown...`);

      try {
        // 1. Stop accepting new HTTP connections
        this.httpServer.close(() => {
          logger.info('HTTP server closed');
        });

        // 2. Close Socket.IO connections
        if (this.socketHandler) {
          await this.socketHandler.gracefulShutdown();
        }

        // 3. Close queue and drain in-flight jobs
        if (this.queueService) {
          await this.queueService.gracefulShutdown();
        }

        // 4. Close database connections
        await disconnectDatabase();
        await disconnectRedis();

        logger.info('Graceful shutdown complete');
        process.exit(0);

      } catch (error) {
        logger.error('Error during graceful shutdown', error);
        process.exit(1);
      }
    };

    // Handle shutdown signals
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    // Handle uncaught errors
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught exception', error);
      shutdown('UNCAUGHT_EXCEPTION');
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled rejection', { reason, promise });
      shutdown('UNHANDLED_REJECTION');
    });

    logger.info('Graceful shutdown handlers configured');
  }

  public async start(): Promise<void> {
    try {
      const port = process.env.PORT ? Number(process.env.PORT) : 3000;
      const host = process.env.HOST || '0.0.0.0';

      // Setup middleware first
      this.setupMiddleware();
      
      // Initialize services (connects MongoDB and Redis)
      await this.initializeServices();
      
      // Setup routes after services are ready
      this.setupRoutes();
      
      // Initialize Socket.IO
      this.initializeSocketIO();
      
      // Setup graceful shutdown
      this.setupGracefulShutdown();

      // Start server
      this.httpServer.listen(port, host, () => {
        logger.info('='.repeat(60));
        logger.info('🚀 Rider Incident Monitor API Started');
        logger.info('='.repeat(60));
        logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
        logger.info(`HTTP Server: http://${host}:${port}`);
        logger.info(`Health Check: http://${host}:${port}/health`);
        logger.info(`WebSocket: ws://${host}:${port}`);
        logger.info('='.repeat(60));
      });

    } catch (error) {
      logger.error('Failed to start application', error);
      process.exit(1);
    }
  }
}

// Start application
const app = new Application();
app.start();
