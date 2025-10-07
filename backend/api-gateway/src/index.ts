import { createServer } from 'http';

import app from './app';
import { env } from './config/env';
import { logger } from './config/logger';
import { messageQueue } from './websocket/messageQueue';
import { WebSocketServer } from './websocket/socketServer';

// Handle uncaught exceptions
process.on('uncaughtException', error => {
  logger.error('Uncaught exception', {
    error: error.message,
    stack: error.stack,
  });
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection', { reason, promise });
  process.exit(1);
});

let wsServer: WebSocketServer | null = null;
let httpServer: ReturnType<typeof createServer> | null = null;

// Graceful shutdown handler
const gracefulShutdown = async (signal: string) => {
  logger.info(`Received ${signal}. Starting graceful shutdown...`);

  try {
    // Stop accepting new connections
    httpServer?.close();

    // Shutdown WebSocket server
    if (wsServer) {
      await wsServer.shutdown();
    }

    // Stop message queue
    messageQueue.stop();

    // TODO: Add more cleanup tasks:
    // - Close database connections
    // - Complete ongoing requests
    // - Clear intervals/timeouts

    logger.info('Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    logger.error('Error during graceful shutdown', { error });
    process.exit(1);
  }
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Start server
const startServer = async () => {
  try {
    // Create HTTP server
    httpServer = createServer(app);

    // Initialize WebSocket server
    wsServer = new WebSocketServer(httpServer);

    // Make WebSocket server available globally for use in routes
    globalThis.wsServer = wsServer;

    httpServer.listen(env.PORT, () => {
      logger.info(`🚀 BarnHand API Gateway started`, {
        port: env.PORT,
        environment: env.NODE_ENV,
        version: '0.3.0',
        endpoints: {
          health: `http://localhost:${env.PORT}/api/v1/health`,
          auth: `http://localhost:${env.PORT}/api/v1/auth`,
          streams: `http://localhost:${env.PORT}/api/v1/streams`,
          horses: `http://localhost:${env.PORT}/api/v1/horses`,
          detections: `http://localhost:${env.PORT}/api/v1/detections`,
          analytics: `http://localhost:${env.PORT}/api/v1/analytics`,
          websocket: `ws://localhost:${env.PORT}`,
        },
      });

      console.log(
        `\n🌟 BarnHand API Gateway ready at http://localhost:${env.PORT}`
      );
      console.log(`📚 API Documentation: http://localhost:${env.PORT}/api/v1`);
      console.log(
        `❤️  Health Check: http://localhost:${env.PORT}/api/v1/health`
      );
      console.log(`🔌 WebSocket Server: ws://localhost:${env.PORT}`);
    });

    // Handle server errors
    httpServer.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EADDRINUSE') {
        logger.error(`Port ${env.PORT} is already in use`);
      } else {
        logger.error('Server error', { error: error.message });
      }
      process.exit(1);
    });

    return httpServer;
  } catch (error) {
    logger.error('Failed to start server', { error });
    process.exit(1);
  }
};

// Start the server
startServer();

export default app;
