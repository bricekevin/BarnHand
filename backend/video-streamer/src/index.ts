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
    // Get stream manager from app instance
    const streamManager = (global as any).streamManager;
    if (streamManager) {
      await streamManager.shutdown();
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
      logger.info('🎥 BarnHand Video Streamer started', {
        port: env.PORT,
        environment: env.NODE_ENV,
        version: '0.3.0',
        mediaPath: env.MEDIA_PATH,
        outputPath: env.OUTPUT_PATH,
        maxStreams: env.MAX_STREAMS,
        endpoints: {
          root: `http://localhost:${env.PORT}`,
          streams: `http://localhost:${env.PORT}/api/streams`,
          videos: `http://localhost:${env.PORT}/api/videos`,
          health: `http://localhost:${env.PORT}/health`
        }
      });
      
      console.log(`\n🎬 BarnHand Video Streamer ready at http://localhost:${env.PORT}`);
      console.log(`📁 Media Path: ${env.MEDIA_PATH}`);
      console.log(`🎯 Stream Endpoints:`);
      console.log(`   • http://localhost:${env.PORT}/stream1/playlist.m3u8`);
      console.log(`   • http://localhost:${env.PORT}/stream2/playlist.m3u8`);
      console.log(`   • http://localhost:${env.PORT}/stream3/playlist.m3u8`);
      console.log(`   • http://localhost:${env.PORT}/stream4/playlist.m3u8`);
      console.log(`   • http://localhost:${env.PORT}/stream5/playlist.m3u8`);
      console.log(`❤️  Health Check: http://localhost:${env.PORT}/health`);
    });

    // Store stream manager globally for graceful shutdown
    (global as any).streamManager = (app as any).streamManager;

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

// Auto-start default streams if videos available
const autoStartStreams = async () => {
  try {
    // Wait for server to start
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    const app = (global as any).app;
    const videoScanner = app?.videoScanner;
    const streamManager = app?.streamManager;
    
    if (videoScanner && streamManager) {
      const videos = await videoScanner.scanVideos();
      
      if (videos.length > 0) {
        logger.info('Auto-starting default streams', { availableVideos: videos.length });
        
        // Start up to 5 streams with available videos
        const streamsToStart = Math.min(5, videos.length);
        
        for (let i = 0; i < streamsToStart; i++) {
          try {
            const streamId = `stream_00${i + 1}`;
            const video = videos[i % videos.length]; // Cycle through videos if fewer than 5
            
            await streamManager.createStream(streamId, video);
            logger.info('Auto-started stream', { 
              streamId,
              videoFile: video.filename,
              playlistUrl: `http://localhost:${env.PORT}/stream${i + 1}/playlist.m3u8`
            });
          } catch (error) {
            logger.warn('Failed to auto-start stream', { 
              streamIndex: i,
              error: error instanceof Error ? error.message : error 
            });
          }
        }
      } else {
        logger.warn('No video files found for auto-streaming', { mediaPath: env.MEDIA_PATH });
      }
    }
  } catch (error) {
    logger.error('Auto-start streams failed', { error });
  }
};

// Start the server
startServer().then(() => {
  // Auto-start streams after server is ready
  if (!isTest) {
    autoStartStreams();
  }
});

export { createApp };