import { Router, Request, Response } from 'express';
import { logger } from '../config/logger';
import { VideoScanner } from '../services/VideoScanner';

export function createVideoRoutes(videoScanner: VideoScanner): Router {
  const router = Router();

  // GET /videos - List available video files
  router.get('/', async (req: Request, res: Response) => {
    try {
      const videos = await videoScanner.scanVideos();
      
      logger.info('Videos listed', { count: videos.length });

      res.json({
        videos: videos.map(video => ({
          id: video.id,
          filename: video.filename,
          size: video.size,
          sizeFormatted: formatBytes(video.size),
          duration: video.duration,
          durationFormatted: video.duration ? formatDuration(video.duration) : undefined,
          format: video.format,
          resolution: video.resolution,
          lastModified: video.lastModified
        })),
        total: videos.length,
        totalSize: formatBytes(videos.reduce((sum, v) => sum + v.size, 0)),
        supportedFormats: ['.mp4', '.mov', '.avi', '.mkv', '.m4v']
      });
    } catch (error) {
      logger.error('List videos error', { error });
      res.status(500).json({ error: 'Failed to list videos' });
    }
  });

  // GET /videos/:id - Get specific video details
  router.get('/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const videos = await videoScanner.scanVideos();
      const video = videos.find(v => v.id === id);

      if (!video) {
        return res.status(404).json({ 
          error: 'Video not found',
          availableVideos: videos.map(v => ({ id: v.id, filename: v.filename }))
        });
      }

      res.json({
        id: video.id,
        filename: video.filename,
        fullPath: video.fullPath,
        size: video.size,
        sizeFormatted: formatBytes(video.size),
        duration: video.duration,
        durationFormatted: video.duration ? formatDuration(video.duration) : undefined,
        format: video.format,
        resolution: video.resolution,
        lastModified: video.lastModified
      });
    } catch (error) {
      logger.error('Get video details error', { error });
      res.status(500).json({ error: 'Failed to get video details' });
    }
  });

  return router;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  } else {
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  }
}