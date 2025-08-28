import { Router, Request, Response } from 'express';

import { env } from '../config/env';
import { logger } from '../config/logger';
import { StreamManager } from '../services/StreamManager';
import { VideoScanner } from '../services/VideoScanner';

export function createStreamRoutes(
  streamManager: StreamManager,
  videoScanner: VideoScanner
): Router {
  const router = Router();

  // GET /streams - List all active streams
  router.get('/', async (_req: Request, res: Response) => {
    try {
      const streams = streamManager.getAllStreams();
      const activeCount = streamManager.getActiveStreamCount();

      logger.info('Streams listed', {
        totalStreams: streams.length,
        activeStreams: activeCount,
      });

      res.json({
        streams: streams.map(stream => ({
          id: stream.id,
          name: stream.name,
          status: stream.status,
          playlistUrl: `http://localhost:${env.PORT}${stream.playlistUrl}`,
          videoFile: {
            filename: stream.videoFile.filename,
            duration: stream.videoFile.duration,
            resolution: stream.videoFile.resolution,
            size: stream.videoFile.size,
          },
          startTime: stream.startTime,
          restartCount: stream.restartCount,
          lastError: stream.lastError,
        })),
        summary: {
          total: streams.length,
          active: activeCount,
          maxStreams: env.MAX_STREAMS,
        },
      });
    } catch (error) {
      logger.error('List streams error', { error });
      res.status(500).json({ error: 'Failed to list streams' });
    }
  });

  // POST /streams/start/:streamId - Start or restart a stream
  router.post('/start/:streamId', async (req: Request, res: Response) => {
    try {
      const { streamId } = req.params;
      if (!streamId) {
        return res
          .status(400)
          .json({ error: 'streamId parameter is required' });
      }
      const { videoFilename } = req.body;

      if (!videoFilename) {
        return res
          .status(400)
          .json({ error: 'videoFilename required in request body' });
      }

      // Check if stream already exists
      let streamInfo = streamManager.getStream(streamId);
      if (streamInfo) {
        if (streamInfo.status === 'active') {
          return res.json({
            message: 'Stream already active',
            stream: {
              id: streamInfo.id,
              status: streamInfo.status,
              playlistUrl: `http://localhost:${env.PORT}${streamInfo.playlistUrl}`,
            },
          });
        } else {
          // Restart existing stream
          await streamManager.restartStream(streamId);
          const restartedStream = streamManager.getStream(streamId);
          if (!restartedStream) {
            return res.status(500).json({ error: 'Failed to restart stream' });
          }
          streamInfo = restartedStream;
        }
      } else {
        // Create new stream
        const videos = await videoScanner.scanVideos();
        const videoFile = videos.find(v => v.filename === videoFilename);

        if (!videoFile) {
          return res.status(404).json({
            error: 'Video file not found',
            availableVideos: videos.map(v => v.filename),
          });
        }

        streamInfo = await streamManager.createStream(streamId, videoFile);
      }

      logger.info('Stream started', {
        streamId,
        videoFile: streamInfo.videoFile.filename,
        status: streamInfo.status,
      });

      return res.json({
        message: 'Stream started successfully',
        stream: {
          id: streamInfo.id,
          name: streamInfo.name,
          status: streamInfo.status,
          playlistUrl: `http://localhost:${env.PORT}${streamInfo.playlistUrl}`,
          videoFile: streamInfo.videoFile.filename,
          startTime: streamInfo.startTime,
        },
      });
    } catch (error) {
      logger.error('Start stream error', { error });
      return res.status(500).json({
        error: 'Failed to start stream',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // POST /streams/stop/:streamId - Stop a stream
  router.post('/stop/:streamId', async (req: Request, res: Response) => {
    try {
      const { streamId } = req.params;
      if (!streamId) {
        return res
          .status(400)
          .json({ error: 'streamId parameter is required' });
      }

      const success = await streamManager.stopStream(streamId);

      if (!success) {
        return res.status(404).json({ error: 'Stream not found' });
      }

      logger.info('Stream stopped', { streamId });

      return res.json({
        message: 'Stream stopped successfully',
        streamId,
      });
    } catch (error) {
      logger.error('Stop stream error', { error });
      return res.status(500).json({ error: 'Failed to stop stream' });
    }
  });

  // GET /streams/:streamId/health - Check stream health
  router.get('/:streamId/health', async (req: Request, res: Response) => {
    try {
      const { streamId } = req.params;
      if (!streamId) {
        return res
          .status(400)
          .json({ error: 'streamId parameter is required' });
      }

      const streamInfo = streamManager.getStream(streamId);
      if (!streamInfo) {
        return res.status(404).json({ error: 'Stream not found' });
      }

      const health = await streamManager.getStreamHealth(streamId);

      return res.json({
        streamId,
        status: streamInfo.status,
        health: {
          isHealthy: health.isHealthy,
          playlistExists: health.playlistExists,
          segmentCount: health.segmentCount,
          lastSegmentAge: health.lastSegmentAge,
        },
        process: {
          pid: streamInfo.process?.pid,
          startTime: streamInfo.startTime,
          restartCount: streamInfo.restartCount,
          lastError: streamInfo.lastError,
        },
      });
    } catch (error) {
      logger.error('Stream health check error', { error });
      return res.status(500).json({ error: 'Failed to check stream health' });
    }
  });

  return router;
}
