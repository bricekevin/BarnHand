import { env } from './config/env';
import { logger } from './config/logger';
import { createApp } from './app';

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', { error: error.message, stack: error.stack });
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection', { reason, promise });
  process.exit(1);
});

// Graceful shutdown handler
const gracefulShutdown = async (signal: string) => {
  logger.info(`Received ${signal}. Starting graceful shutdown...`);
  
  try {
    // Get stream processor from app instance
    const streamProcessor = (global as any).streamProcessor;
    if (streamProcessor) {
      await streamProcessor.shutdown();
    }
    
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
    const app = await createApp();
    
    const server = app.listen(env.PORT, () => {
      logger.info('🎬 BarnHand Stream Processing Service started', {
        port: env.PORT,
        environment: env.NODE_ENV,
        version: '0.3.0',
        configuration: {
          chunkDuration: env.CHUNK_DURATION,
          chunkOverlap: env.CHUNK_OVERLAP,
          processingDelay: env.PROCESSING_DELAY,
          maxQueueSize: env.MAX_QUEUE_SIZE,
          concurrency: env.QUEUE_CONCURRENCY
        },
        endpoints: {
          root: `http://localhost:${env.PORT}`,
          processing: `http://localhost:${env.PORT}/api/processing`,
          health: `http://localhost:${env.PORT}/health`
        }
      });
      
      console.log(`\n⚙️  BarnHand Stream Service ready at http://localhost:${env.PORT}`);
      console.log(`🎯 Chunk Processing: ${env.CHUNK_DURATION}s chunks with ${env.CHUNK_OVERLAP}s overlap`);
      console.log(`⏱️  Processing Delay: ${env.PROCESSING_DELAY}s`);
      console.log(`📊 Queue Concurrency: ${env.QUEUE_CONCURRENCY} jobs`);
      console.log(`❤️  Health Check: http://localhost:${env.PORT}/health`);
    });

    // Store stream processor globally for graceful shutdown
    (global as any).streamProcessor = (app as any).streamProcessor;

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

// Auto-connect to video streams if they're available AND marked as active in DB
const autoConnectStreams = async () => {
  try {
    // Wait for server to start
    await new Promise(resolve => setTimeout(resolve, 3000));

    const streamProcessor = (global as any).streamProcessor;

    if (streamProcessor && !env.NODE_ENV.includes('test')) {
      // Note: Auto-connect is disabled since stream-service doesn't have database module built
      // Streams must be started manually via API or they will auto-connect when marked as 'active' in DB
      // and the stream-service is restarted with database module available.
      logger.info('Auto-connect disabled - streams should be started manually via API');
      logger.info('Streams marked as "active" in the database will be started manually');
    }
  } catch (error: any) {
    logger.error('Auto-connect streams failed', {
      error: error.message || error,
      stack: error.stack
    });
  }
};

// Start the server
startServer().then(() => {
  // Auto-connect to streams after server is ready
  if (!env.NODE_ENV.includes('test')) {
    autoConnectStreams();
  }
});

export { createApp };