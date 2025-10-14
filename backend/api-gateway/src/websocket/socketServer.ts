import { Server as HTTPServer } from 'http';

import jwt from 'jsonwebtoken';
import { Server, Socket } from 'socket.io';

import {
  DetectionData,
  ChunkData,
  MetricsData,
  HorseData,
  HorsesDetectedEvent,
  HorseUpdatedEvent,
} from './events';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { UserPayload, JwtPayload } from '../types/auth';

interface SocketData {
  user?: UserPayload;
  streamIds?: string[];
  farmId?: string;
}

interface ExtendedSocket extends Socket {
  data: SocketData;
}

export class WebSocketServer {
  private io: Server;
  private connections: Map<string, ExtendedSocket> = new Map();
  private streamRooms: Map<string, Set<string>> = new Map();
  private userSessions: Map<string, Set<string>> = new Map();

  constructor(httpServer: HTTPServer) {
    this.io = new Server(httpServer, {
      cors: {
        origin: env.CORS_ORIGIN.split(',').map(origin => origin.trim()),
        credentials: true,
      },
      pingTimeout: 60000,
      pingInterval: 25000,
      transports: ['websocket', 'polling'],
    });

    this.setupMiddleware();
    this.setupEventHandlers();
    this.startMetricsReporting();

    logger.info('WebSocket server initialized');
  }

  private setupMiddleware() {
    // Authentication middleware
    this.io.use(async (socket: Socket, next) => {
      const extSocket = socket as ExtendedSocket;
      extSocket.data = {};

      try {
        const token = socket.handshake.auth.token;

        if (!token) {
          return next(new Error('Authentication token required'));
        }

        // Verify JWT token
        const decoded = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
        extSocket.data.user = {
          id: decoded.userId,
          userId: decoded.userId,
          email: decoded.email,
          role: decoded.role,
          farmId: decoded.farmId,
        };
        if (decoded.farmId !== undefined) {
          extSocket.data.farmId = decoded.farmId;
        }

        logger.info('WebSocket client authenticated', {
          userId: decoded.userId,
          farmId: decoded.farmId,
          socketId: socket.id,
        });

        next();
      } catch (error) {
        logger.error('WebSocket authentication failed', {
          error: error instanceof Error ? error.message : 'Unknown error',
          socketId: socket.id,
        });
        next(new Error('Authentication failed'));
      }
    });
  }

  private setupEventHandlers() {
    this.io.on('connection', (socket: Socket) => {
      const extSocket = socket as ExtendedSocket;
      const userId = extSocket.data.user?.id;
      const farmId = extSocket.data.farmId;

      if (!userId || !farmId) {
        socket.disconnect();
        return;
      }

      // Store connection
      this.connections.set(socket.id, extSocket);

      // Track user sessions
      if (!this.userSessions.has(userId)) {
        this.userSessions.set(userId, new Set());
      }
      this.userSessions.get(userId)?.add(socket.id);

      // Join farm room automatically
      socket.join(`farm:${farmId}`);

      logger.info('WebSocket client connected', {
        socketId: socket.id,
        userId,
        farmId,
        totalConnections: this.connections.size,
      });

      // Emit connection success
      socket.emit('connected', {
        socketId: socket.id,
        farmId,
        timestamp: new Date().toISOString(),
      });

      // Handle stream subscription
      socket.on('subscribe:stream', async (streamId: string) => {
        try {
          // TODO: Verify user has access to this stream
          const roomName = `stream:${streamId}`;
          await socket.join(roomName);

          // Track stream room membership
          if (!this.streamRooms.has(roomName)) {
            this.streamRooms.set(roomName, new Set());
          }
          this.streamRooms.get(roomName)?.add(socket.id);

          // Update socket data
          if (!extSocket.data.streamIds) {
            extSocket.data.streamIds = [];
          }
          extSocket.data.streamIds.push(streamId);

          socket.emit('subscribed:stream', {
            streamId,
            timestamp: new Date().toISOString(),
          });

          logger.info('Client subscribed to stream', {
            socketId: socket.id,
            streamId,
            userId,
          });
        } catch (error) {
          logger.error('Stream subscription failed', {
            error: error instanceof Error ? error.message : 'Unknown error',
            socketId: socket.id,
            streamId,
          });
          socket.emit('error', {
            type: 'subscription_failed',
            message: 'Failed to subscribe to stream',
          });
        }
      });

      // Handle stream unsubscription
      socket.on('unsubscribe:stream', async (streamId: string) => {
        const roomName = `stream:${streamId}`;
        await socket.leave(roomName);

        // Remove from tracking
        this.streamRooms.get(roomName)?.delete(socket.id);
        if (this.streamRooms.get(roomName)?.size === 0) {
          this.streamRooms.delete(roomName);
        }

        // Update socket data
        if (extSocket.data.streamIds) {
          extSocket.data.streamIds = extSocket.data.streamIds.filter(
            id => id !== streamId
          );
        }

        socket.emit('unsubscribed:stream', {
          streamId,
          timestamp: new Date().toISOString(),
        });

        logger.info('Client unsubscribed from stream', {
          socketId: socket.id,
          streamId,
          userId,
        });
      });

      // Handle ping for keeping connection alive
      socket.on('ping', () => {
        socket.emit('pong', { timestamp: new Date().toISOString() });
      });

      // Handle disconnection
      socket.on('disconnect', reason => {
        logger.info('WebSocket client disconnected', {
          socketId: socket.id,
          userId,
          reason,
        });

        // Clean up connections
        this.connections.delete(socket.id);

        // Clean up user sessions
        this.userSessions.get(userId)?.delete(socket.id);
        if (this.userSessions.get(userId)?.size === 0) {
          this.userSessions.delete(userId);
        }

        // Clean up stream rooms
        if (extSocket.data.streamIds) {
          extSocket.data.streamIds.forEach(streamId => {
            const roomName = `stream:${streamId}`;
            this.streamRooms.get(roomName)?.delete(socket.id);
            if (this.streamRooms.get(roomName)?.size === 0) {
              this.streamRooms.delete(roomName);
            }
          });
        }
      });
    });
  }

  // Public methods for emitting events

  public emitDetectionUpdate(streamId: string, detection: DetectionData) {
    const roomName = `stream:${streamId}`;
    this.io.to(roomName).emit('detection:update', {
      streamId,
      detection,
      timestamp: new Date().toISOString(),
    });

    logger.debug('Detection update emitted', {
      streamId,
      roomSize: this.streamRooms.get(roomName)?.size || 0,
    });
  }

  public emitChunkProcessed(streamId: string, chunkData: ChunkData) {
    const roomName = `stream:${streamId}`;
    this.io.to(roomName).emit('chunk:processed', {
      ...chunkData,
      streamId,
      timestamp: new Date().toISOString(),
    });

    logger.debug('Chunk processed notification sent', {
      streamId,
      chunkId: chunkData.id,
    });
  }

  public emitMetricsUpdate(farmId: string, metrics: MetricsData) {
    const roomName = `farm:${farmId}`;
    this.io.to(roomName).emit('metrics:update', {
      ...metrics,
      timestamp: new Date().toISOString(),
    });
  }

  public emitStreamStatusChange(streamId: string, status: string) {
    const roomName = `stream:${streamId}`;
    this.io.to(roomName).emit('stream:status', {
      streamId,
      status,
      timestamp: new Date().toISOString(),
    });

    logger.info('Stream status change emitted', {
      streamId,
      status,
      roomSize: this.streamRooms.get(roomName)?.size || 0,
    });
  }

  public emitHorseUpdate(farmId: string, horseData: HorseData) {
    const roomName = `farm:${farmId}`;
    this.io.to(roomName).emit('horse:update', {
      ...horseData,
      timestamp: new Date().toISOString(),
    });
  }

  public broadcastToFarm(farmId: string, event: string, data: unknown) {
    const roomName = `farm:${farmId}`;
    this.io.to(roomName).emit(event, {
      data,
      timestamp: new Date().toISOString(),
    });
  }

  public emitHorsesDetected(
    streamId: string,
    horses: HorsesDetectedEvent['horses']
  ) {
    const roomName = `stream:${streamId}`;
    this.io.to(roomName).emit('horses:detected', {
      streamId,
      horses,
      timestamp: new Date().toISOString(),
    });

    logger.debug('Horses detected event emitted', {
      streamId,
      horseCount: horses.length,
      roomSize: this.streamRooms.get(roomName)?.size || 0,
    });
  }

  public emitHorseUpdatedEvent(
    streamId: string,
    horse: HorseUpdatedEvent['horse']
  ) {
    const roomName = `stream:${streamId}`;
    this.io.to(roomName).emit('horses:updated', {
      streamId,
      horse,
      timestamp: new Date().toISOString(),
    });

    logger.info('Horse updated event emitted', {
      streamId,
      horseId: horse.id,
      horseName: horse.name,
      roomSize: this.streamRooms.get(roomName)?.size || 0,
    });
  }

  // Metrics reporting
  private startMetricsReporting() {
    setInterval(() => {
      const metrics = {
        totalConnections: this.connections.size,
        uniqueUsers: this.userSessions.size,
        activeStreamRooms: this.streamRooms.size,
        memoryUsage: process.memoryUsage(),
      };

      // Only log metrics in debug mode or when there are active connections
      if (process.env.LOG_LEVEL === 'debug' || this.connections.size > 0) {
        logger.debug('WebSocket metrics', metrics);
      }
    }, 300000); // Report every 5 minutes instead of every minute
  }

  // Graceful shutdown
  public async shutdown() {
    logger.info('Shutting down WebSocket server...');

    // Notify all clients
    this.io.emit('server:shutdown', {
      message: 'Server is shutting down',
      timestamp: new Date().toISOString(),
    });

    // Close all connections
    this.io.disconnectSockets(true);

    // Close the server
    await new Promise<void>(resolve => {
      this.io.close(() => {
        logger.info('WebSocket server shut down');
        resolve();
      });
    });
  }

  // Getters for monitoring
  public getConnectionCount(): number {
    return this.connections.size;
  }

  public getUserCount(): number {
    return this.userSessions.size;
  }

  public getStreamRoomCount(): number {
    return this.streamRooms.size;
  }

  public getStreamSubscribers(streamId: string): number {
    return this.streamRooms.get(`stream:${streamId}`)?.size || 0;
  }
}

export default WebSocketServer;
