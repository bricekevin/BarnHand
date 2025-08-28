import app from './app';
import { env } from './config/env';
import { logger } from './config/logger';

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

// Graceful shutdown handler
const gracefulShutdown = (signal: string) => {
  logger.info(`Received ${signal}. Starting graceful shutdown...`);

  // TODO: Add cleanup tasks:
  // - Close database connections
  // - Complete ongoing requests
  // - Clear intervals/timeouts

  setTimeout(() => {
    logger.info('Graceful shutdown completed');
    process.exit(0);
  }, 5000); // Allow 5 seconds for cleanup
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Start server
const startServer = async () => {
  try {
    const server = app.listen(env.PORT, () => {
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
        },
      });

      console.log(
        `\n🌟 BarnHand API Gateway ready at http://localhost:${env.PORT}`
      );
      console.log(`📚 API Documentation: http://localhost:${env.PORT}/api/v1`);
      console.log(
        `❤️  Health Check: http://localhost:${env.PORT}/api/v1/health`
      );
    });

    // Handle server errors
    server.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EADDRINUSE') {
        logger.error(`Port ${env.PORT} is already in use`);
      } else {
        logger.error('Server error', { error: error.message });
      }
      process.exit(1);
    });

    return server;
  } catch (error) {
    logger.error('Failed to start server', { error });
    process.exit(1);
  }
};

// Start the server
startServer();

export default app;
