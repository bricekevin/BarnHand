import fs from 'fs/promises';
import path from 'path';

import { logger } from '../config/logger';

export interface VideoFile {
  id: string;
  filename: string;
  fullPath: string;
  size: number;
  duration?: number;
  format?: string;
  resolution?: string;
  lastModified: Date;
}

export class VideoScanner {
  private mediaPath: string;
  private supportedFormats = ['.mp4', '.mov', '.avi', '.mkv', '.m4v'];

  constructor(mediaPath: string) {
    this.mediaPath = mediaPath;
  }

  async scanVideos(): Promise<VideoFile[]> {
    try {
      await this.ensureMediaDirectory();
      const files = await fs.readdir(this.mediaPath);
      const videoFiles: VideoFile[] = [];

      for (const filename of files) {
        const fullPath = path.join(this.mediaPath, filename);
        const ext = path.extname(filename).toLowerCase();

        if (this.supportedFormats.includes(ext)) {
          try {
            const stats = await fs.stat(fullPath);
            if (stats.isFile()) {
              const videoFile: VideoFile = {
                id: this.generateVideoId(filename),
                filename,
                fullPath,
                size: stats.size,
                lastModified: stats.mtime,
              };

              // Get video metadata using ffprobe (if available)
              try {
                const metadata = await this.getVideoMetadata(fullPath);
                videoFile.duration = metadata.duration ?? 0;
                videoFile.format = metadata.format ?? 'unknown';
                videoFile.resolution = metadata.resolution ?? 'unknown';
              } catch (metadataError) {
                logger.warn('Could not extract video metadata', {
                  filename,
                  error:
                    metadataError instanceof Error
                      ? metadataError.message
                      : metadataError,
                });
              }

              videoFiles.push(videoFile);
            }
          } catch (statError) {
            logger.warn('Could not stat video file', {
              filename,
              error: statError instanceof Error ? statError.message : statError,
            });
          }
        }
      }

      logger.info('Video scan completed', {
        mediaPath: this.mediaPath,
        videosFound: videoFiles.length,
        totalSize: this.formatBytes(
          videoFiles.reduce((sum, v) => sum + v.size, 0)
        ),
      });

      return videoFiles.sort((a, b) => a.filename.localeCompare(b.filename));
    } catch (error) {
      logger.error('Video scan failed', {
        mediaPath: this.mediaPath,
        error: error instanceof Error ? error.message : error,
      });
      return [];
    }
  }

  private async ensureMediaDirectory(): Promise<void> {
    try {
      const stats = await fs.stat(this.mediaPath);
      if (!stats.isDirectory()) {
        throw new Error(`Media path is not a directory: ${this.mediaPath}`);
      }
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        logger.info('Creating media directory', { path: this.mediaPath });
        await fs.mkdir(this.mediaPath, { recursive: true });
      } else {
        throw error;
      }
    }
  }

  private generateVideoId(filename: string): string {
    // Create consistent ID from filename (remove extension, normalize)
    const nameWithoutExt = path.parse(filename).name;
    return nameWithoutExt.toLowerCase().replace(/[^a-z0-9]/g, '_');
  }

  private async getVideoMetadata(filePath: string): Promise<{
    duration?: number;
    format?: string;
    resolution?: string;
  }> {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    const command = `ffprobe -v quiet -print_format json -show_format -show_streams "${filePath}"`;

    try {
      const { stdout } = await execAsync(command, { timeout: 10000 });
      const metadata = JSON.parse(stdout);

      const videoStream = metadata.streams?.find(
        (s: any) => s.codec_type === 'video'
      );

      return {
        duration: parseFloat(metadata.format?.duration || '0'),
        format: metadata.format?.format_name || 'unknown',
        resolution: videoStream
          ? `${videoStream.width}x${videoStream.height}`
          : 'unknown',
      };
    } catch (error) {
      logger.debug('FFprobe metadata extraction failed', {
        filePath,
        error: error instanceof Error ? error.message : error,
      });
      return {};
    }
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}
