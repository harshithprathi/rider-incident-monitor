import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HTTPServer } from 'http';
import { createAdapter } from '@socket.io/redis-adapter';
import { getRedisClient } from '../config/redis';
import Redis from 'ioredis';
import { AuthService } from '../../auth/services/auth.service';
import { IncidentUpdateService } from '../../incidents/services/incident-update.service';
import { Incident } from '../../incidents/schemas/incident.model';
import { JwtPayload, UserRole, JoinIncidentData } from '../types';
import { logger } from '../utils/logger';
import { asyncContext } from '../utils/async-context';
import { Types } from 'mongoose';
import { eventBus } from '../utils/events';

/**
 * Feature B + R2 + R3: Socket.IO Handler
 * - Authentication on connection
 * - join_incident with replay + live streaming
 * - Authorization enforcement (org/region)
 * - Gap-free update delivery
 */
export class SocketHandler {
  private io: SocketIOServer;
  private authService: AuthService;
  private updateService: IncidentUpdateService;
  private connectionCount: Map<string, number>; // Track connections per user
  private pubClient: Redis;
  private subClient: Redis;

  constructor(server: HTTPServer) {
    const allowedOrigins = [
      process.env.FRONTEND_URL || 'http://localhost:4200',
      'http://localhost:4201',
      'http://localhost:5173',
      'http://127.0.0.1:4200',
      'http://127.0.0.1:4201',
    ];

    this.io = new SocketIOServer(server, {
      cors: {
        origin: (origin, callback) => {
          if (!origin || allowedOrigins.indexOf(origin) !== -1 || origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
            callback(null, true);
          } else {
            callback(new Error('Not allowed by CORS'));
          }
        },
        credentials: true,
      },
      transports: ['websocket', 'polling'],
    });

    // Initialize Redis clients for pub/sub adapter
    this.pubClient = getRedisClient().duplicate();
    this.subClient = getRedisClient().duplicate();
    this.io.adapter(createAdapter(this.pubClient, this.subClient));

    this.authService = new AuthService();
    this.updateService = new IncidentUpdateService();
    this.connectionCount = new Map();

    this.setupMiddleware();
    this.setupConnectionHandler();

    // Listen for incident updates from service layer and broadcast to socket clients
    eventBus.on('incident_update', (data: { incidentId: string; update: any }) => {
      this.broadcastIncidentUpdate(data.incidentId, data.update);
    });

    logger.info('Socket.IO handler initialized');
  }

  /**
   * R3: Authentication middleware for Socket.IO
   */
  private setupMiddleware(): void {
    this.io.use(async (socket: Socket, next) => {
      try {
        const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');

        if (!token) {
          logger.warn('Socket connection rejected - no token', {
            socketId: socket.id,
          });
          return next(new Error('Authentication token required'));
        }

        // Verify token
        const payload = this.authService.verifyToken(token);
        
        // Attach user to socket
        (socket as any).user = payload;

        logger.info('Socket authenticated', {
          socketId: socket.id,
          userId: payload.userId,
          role: payload.role,
        });

        next();
      } catch (error: any) {
        logger.warn('Socket authentication failed', {
          socketId: socket.id,
          error: error.message,
        });
        next(new Error('Invalid authentication token'));
      }
    });
  }

  /**
   * Setup connection handler
   */
  private setupConnectionHandler(): void {
    this.io.on('connection', (socket: Socket) => {
      const user: JwtPayload = (socket as any).user;

      logger.info('Socket connected', {
        socketId: socket.id,
        userId: user.userId,
      });

      // R6: Track socket connections
      this.incrementConnectionCount(user.userId);

      // Setup event handlers
      this.setupEventHandlers(socket, user);

      // Handle disconnection
      socket.on('disconnect', () => {
        this.handleDisconnect(socket, user);
      });
    });
  }

  /**
   * Setup event handlers for socket
   */
  private setupEventHandlers(socket: Socket, user: JwtPayload): void {
    // Feature B: Join incident room with replay
    socket.on('join_incident', async (data: JoinIncidentData) => {
      await this.handleJoinIncident(socket, user, data);
    });

    // Leave incident room
    socket.on('leave_incident', (data: JoinIncidentData) => {
      this.handleLeaveIncident(socket, data);
    });

    // Ping/pong for connection health
    socket.on('ping', () => {
      socket.emit('pong');
    });
  }

  /**
   * Feature B: Handle join_incident event
   * - Replay last 20 updates
   * - Subscribe to live updates
   * - R3: Enforce authorization
   * - R2: Gap-free delivery
   */
  private async handleJoinIncident(
    socket: Socket,
    user: JwtPayload,
    data: JoinIncidentData
  ): Promise<void> {
    // Use AsyncLocalStorage for request-scoped correlation
    const correlationId = `socket-${socket.id}`;

    return asyncContext.run({ correlationId }, async () => {
      try {
        const { incidentId } = data;

        if (!incidentId) {
          socket.emit('error', {
            code: 'MISSING_INCIDENT_ID',
            message: 'Incident ID is required',
          });
          return;
        }

        // R3: Authorization check - verify user can access this incident
        if (user.role === UserRole.RESPONDER) {
          if (!user.organizationId || !user.region) {
            socket.emit('error', {
              code: 'INVALID_SCOPE',
              message: 'Invalid authorization scope',
            });
            return;
          }

          // Verify incident belongs to user's org/region
          const incident = await Incident.findOne({
            _id: new Types.ObjectId(incidentId),
            organizationId: new Types.ObjectId(user.organizationId),
            region: user.region,
          });

          if (!incident) {
            logger.warn('Unauthorized incident access attempt', {
              correlationId,
              userId: user.userId,
              incidentId,
              organizationId: user.organizationId,
              region: user.region,
            });

            socket.emit('error', {
              code: 'UNAUTHORIZED',
              message: 'Access denied to this incident',
            });
            return;
          }
        }

        // Join room
        const room = `incident-${incidentId}`;
        socket.join(room);

        logger.info('Socket joined incident room', {
          correlationId,
          socketId: socket.id,
          userId: user.userId,
          incidentId,
          room,
        });

        // Feature B: Replay last 20 updates
        const replayUpdates = await this.updateService.getLastNUpdates(incidentId, 20);

        socket.emit('incident_replay', {
          incidentId,
          updates: replayUpdates,
          count: replayUpdates.length,
        });

        logger.info('Incident updates replayed', {
          correlationId,
          incidentId,
          count: replayUpdates.length,
        });

        // Send confirmation
        socket.emit('joined_incident', {
          incidentId,
          room,
        });

      } catch (error) {
        logger.error('Error joining incident room', error);
        socket.emit('error', {
          code: 'JOIN_FAILED',
          message: 'Failed to join incident room',
        });
      }
    });
  }

  /**
   * Handle leave_incident event
   */
  private handleLeaveIncident(socket: Socket, data: JoinIncidentData): void {
    const { incidentId } = data;
    const room = `incident-${incidentId}`;

    socket.leave(room);

    logger.info('Socket left incident room', {
      socketId: socket.id,
      incidentId,
      room,
    });

    socket.emit('left_incident', { incidentId });
  }

  /**
   * Broadcast new incident update to all clients in room
   * - Called from incident update creation
   * - R2: Gap-free streaming
   */
  public broadcastIncidentUpdate(incidentId: string, update: any): void {
    const room = `incident-${incidentId}`;

    this.io.to(room).emit('incident_update', {
      incidentId,
      update,
    });

    logger.info('Incident update broadcasted', {
      incidentId,
      sequenceNumber: update.sequenceNumber,
      type: update.type,
    });
  }

  /**
   * R6: Handle socket disconnection
   */
  private handleDisconnect(socket: Socket, user: JwtPayload): void {
    logger.info('Socket disconnected', {
      socketId: socket.id,
      userId: user.userId,
    });

    // Decrement connection count
    this.decrementConnectionCount(user.userId);
  }

  /**
   * R6: Track connection count (prevent unbounded growth)
   */
  private incrementConnectionCount(userId: string): void {
    const current = this.connectionCount.get(userId) || 0;
    this.connectionCount.set(userId, current + 1);

    logger.debug('Connection count incremented', {
      userId,
      count: current + 1,
    });
  }

  private decrementConnectionCount(userId: string): void {
    const current = this.connectionCount.get(userId) || 0;
    const newCount = Math.max(0, current - 1);

    if (newCount === 0) {
      this.connectionCount.delete(userId);
    } else {
      this.connectionCount.set(userId, newCount);
    }

    logger.debug('Connection count decremented', {
      userId,
      count: newCount,
    });
  }

  /**
   * Get connection statistics
   */
  public getConnectionStats(): {
    totalConnections: number;
    uniqueUsers: number;
  } {
    let total = 0;
    for (const count of this.connectionCount.values()) {
      total += count;
    }

    return {
      totalConnections: total,
      uniqueUsers: this.connectionCount.size,
    };
  }

  /**
   * R5: Graceful shutdown - close all connections
   */
  public async gracefulShutdown(): Promise<void> {
    logger.info('Starting Socket.IO graceful shutdown...');

    // Close all connections
    const sockets = await this.io.fetchSockets();
    for (const socket of sockets) {
      socket.disconnect(true);
    }

    // Close server
    this.io.close();

    // Close Redis adapter connections
    await this.pubClient.quit();
    await this.subClient.quit();

    logger.info('Socket.IO shutdown complete');
  }

  /**
   * Get Socket.IO instance
   */
  public getIO(): SocketIOServer {
    return this.io;
  }
}
