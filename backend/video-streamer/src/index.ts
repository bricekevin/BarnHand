import { exec } from 'child_process';
import { promisify } from 'util';

import { createApp } from './app';
import { env } from './config/env';
import { logger } from './config/logger';

const execAsync = promisify(exec);

// Kill any orphaned FFmpeg processes on startup (from previous hot-reloads)
const killOrphanedFFmpegProcesses = async () => {
  try {
    // Find all ffmpeg processes owned by this user
    const { stdout } = await execAsync('ps aux | grep "[f]fmpeg.*hls" || true');
    if (stdout.trim()) {
      logger.warn(
        'Found orphaned FFmpeg processes from previous runs, cleaning up...'
      );
      await execAsync('pkill -f "ffmpeg.*hls" || true');
      logger.info('Orphaned FFmpeg processes cleaned up');
    }
  } catch (error) {
    // Ignore errors - process might not exist
    logger.debug('No orphaned FFmpeg processes found');
  }
};

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
// Handle SIGUSR2 from tsx watch hot-reload
process.on('SIGUSR2', () => gracefulShutdown('SIGUSR2'));

// Start server
const startServer = async () => {
  try {
    // Clean up any orphaned FFmpeg processes from previous runs/hot-reloads
    await killOrphanedFFmpegProcesses();

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
          health: `http://localhost:${env.PORT}/health`,
        },
      });

      console.log(
        `\n🎬 BarnHand Video Streamer ready at http://localhost:${env.PORT}`
      );
      console.log(`📁 Media Path: ${env.MEDIA_PATH}`);
      console.log(`🎯 Stream Endpoints:`);
      console.log(`   • http://localhost:${env.PORT}/stream1/playlist.m3u8`);
      console.log(`   • http://localhost:${env.PORT}/stream2/playlist.m3u8`);
      console.log(`   • http://localhost:${env.PORT}/stream3/playlist.m3u8`);
      console.log(`   • http://localhost:${env.PORT}/stream4/playlist.m3u8`);
      console.log(`❤️  Health Check: http://localhost:${env.PORT}/health`);
    });

    // Store app and stream manager globally for graceful shutdown and auto-start
    (global as any).app = app;
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

// Auto-start streams from database that are marked as active
const autoStartStreams = async () => {
  try {
    // Wait for server to start
    await new Promise(resolve => setTimeout(resolve, 3000));

    const app = (global as any).app;
    const videoScanner = app?.videoScanner;
    const streamManager = app?.streamManager;

    if (!streamManager) {
      logger.warn('Stream manager not available for auto-start');
      return;
    }

    // Try to load active streams from database
    let activeStreams: any[] = [];
    try {
      const db = require('@barnhand/database');
      const StreamRepository = db.StreamRepository;
      const streamRepo = new StreamRepository();

      // Find all streams with status 'active'
      const allStreams = await streamRepo.findAll();
      activeStreams = allStreams.filter((s: any) => s.status === 'active');

      logger.info('Found active streams in database', {
        total: allStreams.length,
        active: activeStreams.length,
      });
    } catch (dbError) {
      logger.warn('Database not available for auto-start - falling back to local videos', {
        error: dbError instanceof Error ? dbError.message : dbError,
      });

      // Fallback: auto-start local videos if database is not available
      if (videoScanner) {
        const videos = await videoScanner.scanVideos();

        if (videos.length > 0) {
          logger.info('Auto-starting default streams from local videos', {
            availableVideos: videos.length,
          });

          // Start up to 4 streams with available videos
          const streamsToStart = Math.min(4, videos.length);

          for (let i = 0; i < streamsToStart; i++) {
            try {
              const streamId = `stream_00${i + 1}`;
              const video = videos[i % videos.length];

              await streamManager.createStream(streamId, video);
              logger.info('Auto-started local stream', {
                streamId,
                videoFile: video.filename,
                playlistUrl: `http://localhost:${env.PORT}/stream${i + 1}/playlist.m3u8`,
              });
            } catch (error) {
              logger.warn('Failed to auto-start local stream', {
                streamIndex: i,
                error: error instanceof Error ? error.message : error,
              });
            }
          }
        } else {
          logger.warn('No video files found for auto-streaming', {
            mediaPath: env.MEDIA_PATH,
          });
        }
      }
      return;
    }

    // Start each active stream from database
    for (const dbStream of activeStreams) {
      try {
        const sourceType = dbStream.source_type || 'rtsp';

        if (sourceType === 'local') {
          // Local video file
          if (!videoScanner) continue;

          const videos = await videoScanner.scanVideos();
          const videoFilename = dbStream.source_url.split('/').pop()?.replace('.m3u8', '.mp4') || '';
          const videoFile = videos.find(v => v.filename === videoFilename);

          if (videoFile) {
            await streamManager.createStream(dbStream.id, videoFile);
            logger.info('Auto-started local stream from database', {
              streamId: dbStream.id,
              name: dbStream.name,
              videoFile: videoFile.filename,
            });
          } else {
            logger.warn('Video file not found for stream', {
              streamId: dbStream.id,
              name: dbStream.name,
              videoFilename,
            });
          }
        } else if (['rtsp', 'rtmp', 'http'].includes(sourceType)) {
          // External stream (RTSP, RTMP, HTTP)
          await streamManager.createExternalStream(
            dbStream.id,
            dbStream.source_url,
            sourceType as 'rtsp' | 'rtmp' | 'http'
          );
          logger.info('Auto-started external stream from database', {
            streamId: dbStream.id,
            name: dbStream.name,
            sourceType,
            sourceUrl: dbStream.source_url,
          });
        } else {
          logger.warn('Unsupported stream type', {
            streamId: dbStream.id,
            name: dbStream.name,
            sourceType,
          });
        }
      } catch (error) {
        logger.error('Failed to auto-start stream from database', {
          streamId: dbStream.id,
          name: dbStream.name,
          error: error instanceof Error ? error.message : error,
        });
      }
    }

    if (activeStreams.length === 0) {
      logger.info('No active streams found in database');
    }
  } catch (error) {
    logger.error('Auto-start streams failed', {
      error: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined,
    });
  }
};

// Start the server
startServer().then(() => {
  // Auto-start streams after server is ready
  // Always enabled by default to load active streams from database
  // Disable with: ENABLE_AUTO_STREAMS=false
  const shouldAutoStart =
    process.env.NODE_ENV !== 'test' &&
    process.env.ENABLE_AUTO_STREAMS !== 'false';

  if (shouldAutoStart) {
    logger.info(
      'Auto-starting active streams from database (disable with ENABLE_AUTO_STREAMS=false)'
    );
    autoStartStreams();
  } else {
    logger.info(
      'Auto-start disabled. Manually create streams via API or enable with ENABLE_AUTO_STREAMS=true'
    );
  }
});

export { createApp };
