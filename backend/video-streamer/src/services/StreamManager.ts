import { spawn, ChildProcess } from 'child_process';
import fs from 'fs/promises';
import path from 'path';

import cron from 'node-cron';

import { VideoFile } from './VideoScanner';
import { env } from '../config/env';
import { logger } from '../config/logger';

// Database access for stream names
let StreamRepository: any;
let databaseAvailable = false;

try {
  // Try @barnhand/database first (local development with npm link)
  const db = require('@barnhand/database');
  StreamRepository = db.StreamRepository;
  databaseAvailable = true;
} catch (error) {
  // Fallback to absolute path (Docker container)
  try {
    const db = require('/database');
    StreamRepository = db.StreamRepository;
    databaseAvailable = true;
    logger.info('Using database module from /database path');
  } catch (fallbackError) {
    logger.warn('Database not available for stream names - using generic names');
  }
}

export interface StreamInfo {
  id: string;
  name: string;
  videoFile?: VideoFile; // Optional for RTSP streams
  sourceUrl?: string; // For RTSP/external streams
  sourceType: 'local' | 'rtsp' | 'rtmp' | 'http';
  status: 'starting' | 'active' | 'error' | 'stopped';
  process?: ChildProcess;
  startTime?: Date;
  restartCount: number;
  lastError?: string;
  playlistUrl: string;
  outputPath: string;
  manuallyStopped?: boolean;
}

export class StreamManager {
  private streams = new Map<string, StreamInfo>();
  private outputPath: string;
  private cleanupJob?: cron.ScheduledTask;
  private healthCheckJob?: cron.ScheduledTask;

  constructor() {
    this.outputPath = env.OUTPUT_PATH;
    this.initializeCleanup();
    this.initializeHealthMonitoring();
  }

  async initializeOutputDirectory(): Promise<void> {
    try {
      await fs.mkdir(this.outputPath, { recursive: true });
      logger.info('Output directory initialized', { path: this.outputPath });
    } catch (error) {
      logger.error('Failed to initialize output directory', {
        path: this.outputPath,
        error: error instanceof Error ? error.message : error,
      });
      throw error;
    }
  }

  async createStream(
    streamId: string,
    videoFile: VideoFile
  ): Promise<StreamInfo> {
    if (this.streams.has(streamId)) {
      throw new Error(`Stream ${streamId} already exists`);
    }

    if (this.streams.size >= env.MAX_STREAMS) {
      throw new Error(`Maximum streams limit reached (${env.MAX_STREAMS})`);
    }

    const streamOutputPath = path.join(this.outputPath, streamId);
    await fs.mkdir(streamOutputPath, { recursive: true });

    // Fetch stream name from database if available
    let streamName = `Stream ${streamId}`; // Default fallback
    if (databaseAvailable && StreamRepository) {
      try {
        const streamRepo = new StreamRepository();
        const dbStream = await streamRepo.findById(streamId);
        if (dbStream && dbStream.name) {
          streamName = dbStream.name;
          logger.debug('Using database stream name', { streamId, name: streamName });
        }
      } catch (error) {
        logger.warn('Failed to fetch stream name from database, using default', {
          streamId,
          error: error instanceof Error ? error.message : error,
        });
      }
    }

    const streamInfo: StreamInfo = {
      id: streamId,
      name: streamName,
      videoFile,
      sourceType: 'local',
      status: 'starting',
      restartCount: 0,
      playlistUrl: streamId.startsWith('stream_')
        ? `/stream${streamId.slice(-1)}/playlist.m3u8`  // Legacy format for stream_001, stream_002, etc
        : `/streams/${streamId}/playlist.m3u8`,          // Dynamic format for UUID streams
      outputPath: streamOutputPath,
      manuallyStopped: false,
    };

    this.streams.set(streamId, streamInfo);

    try {
      await this.startFFmpegProcess(streamInfo);
      logger.info('Stream created successfully', {
        streamId,
        filename: videoFile.filename,
        outputPath: streamOutputPath,
      });
    } catch (error) {
      this.streams.delete(streamId);
      logger.error('Failed to create stream', {
        streamId,
        error: error instanceof Error ? error.message : error,
      });
      throw error;
    }

    return streamInfo;
  }

  async createExternalStream(
    streamId: string,
    sourceUrl: string,
    sourceType: 'rtsp' | 'rtmp' | 'http'
  ): Promise<StreamInfo> {
    if (this.streams.has(streamId)) {
      throw new Error(`Stream ${streamId} already exists`);
    }

    if (this.streams.size >= env.MAX_STREAMS) {
      throw new Error(`Maximum streams limit reached (${env.MAX_STREAMS})`);
    }

    const streamOutputPath = path.join(this.outputPath, streamId);
    await fs.mkdir(streamOutputPath, { recursive: true });

    // Fetch stream name from database if available
    let streamName = `Stream ${streamId}`; // Default fallback
    if (databaseAvailable && StreamRepository) {
      try {
        const streamRepo = new StreamRepository();
        const dbStream = await streamRepo.findById(streamId);
        if (dbStream && dbStream.name) {
          streamName = dbStream.name;
          logger.debug('Using database stream name', { streamId, name: streamName });
        }
      } catch (error) {
        logger.warn('Failed to fetch stream name from database, using default', {
          streamId,
          error: error instanceof Error ? error.message : error,
        });
      }
    }

    const streamInfo: StreamInfo = {
      id: streamId,
      name: streamName,
      sourceUrl,
      sourceType,
      status: 'starting',
      restartCount: 0,
      playlistUrl: streamId.startsWith('stream_')
        ? `/stream${streamId.slice(-1)}/playlist.m3u8`  // Legacy format for stream_001, stream_002, etc
        : `/streams/${streamId}/playlist.m3u8`,          // Dynamic format for UUID streams
      outputPath: streamOutputPath,
      manuallyStopped: false,
    };

    this.streams.set(streamId, streamInfo);

    try {
      await this.startFFmpegProcess(streamInfo);
      logger.info('External stream created successfully', {
        streamId,
        sourceUrl,
        sourceType,
        outputPath: streamOutputPath,
      });
    } catch (error) {
      this.streams.delete(streamId);
      logger.error('Failed to create external stream', {
        streamId,
        sourceUrl,
        error: error instanceof Error ? error.message : error,
      });
      throw error;
    }

    return streamInfo;
  }

  private async startFFmpegProcess(streamInfo: StreamInfo): Promise<void> {
    const { id: streamId, videoFile, sourceUrl, sourceType, outputPath } = streamInfo;

    // Build FFmpeg args based on source type
    const ffmpegArgs: string[] = [];

    if (sourceType === 'local' && videoFile) {
      // Local file streaming with looping
      ffmpegArgs.push(
        '-re', // Read input at native frame rate
        '-stream_loop', '-1', // Loop input infinitely
        '-i', videoFile.fullPath // Input video file
      );
    } else if (sourceType === 'rtsp' && sourceUrl) {
      // RTSP stream - extract credentials if embedded in URL
      const rtspUrl = new URL(sourceUrl);
      const username = rtspUrl.username;
      const password = rtspUrl.password;

      // Build clean URL without credentials
      const cleanUrl = sourceUrl.replace(/\/\/[^:]+:[^@]+@/, '//');

      ffmpegArgs.push(
        '-rtsp_transport', 'tcp', // Use TCP for RTSP (more reliable than UDP)
        '-timeout', '10000000' // Timeout MUST come before -i
      );

      // Add authentication if provided
      if (username && password) {
        ffmpegArgs.push(
          '-rtsp_user', username,
          '-rtsp_password', password
        );
      }

      ffmpegArgs.push(
        '-i', cleanUrl // Input RTSP URL (without embedded credentials)
      );
    } else if ((sourceType === 'rtmp' || sourceType === 'http') && sourceUrl) {
      // RTMP or HTTP stream
      ffmpegArgs.push(
        '-i', sourceUrl // Input URL
      );
    } else {
      throw new Error(`Invalid stream configuration: sourceType=${sourceType}, hasVideoFile=${!!videoFile}, hasSourceUrl=${!!sourceUrl}`);
    }

    // Common encoding and HLS output settings
    ffmpegArgs.push(
      '-c:v', 'libx264', // Video codec
      '-preset', 'veryfast', // Faster encoding for real-time
      '-crf', '23', // Good quality setting
      '-maxrate', env.BITRATE, // Max bitrate
      '-bufsize', '2M', // Buffer size
      '-c:a', 'aac', // Audio codec
      '-b:a', '128k', // Audio bitrate
      '-f', 'hls', // Output format
      '-hls_time', env.SEGMENT_DURATION.toString(), // Segment duration
      '-hls_list_size', env.PLAYLIST_SIZE.toString(), // Keep segments in playlist
      '-hls_flags', 'delete_segments', // Clean up old segments
      '-hls_segment_filename', path.join(outputPath, 'segment_%03d.ts'),
      path.join(outputPath, 'playlist.m3u8')
    );

    logger.info('Starting FFmpeg process', {
      streamId,
      sourceType,
      command: `ffmpeg ${ffmpegArgs.join(' ')}`,
      source: sourceType === 'local' ? videoFile?.filename : sourceUrl,
    });

    const ffmpegProcess = spawn(env.FFMPEG_BINARY, ffmpegArgs);
    streamInfo.process = ffmpegProcess;
    streamInfo.startTime = new Date();

    // Buffer stderr for error reporting
    let stderrBuffer = '';

    // Handle process events
    ffmpegProcess.stdout?.on('data', data => {
      logger.debug('FFmpeg stdout', { streamId, data: data.toString().trim() });
    });

    ffmpegProcess.stderr?.on('data', data => {
      const message = data.toString().trim();
      stderrBuffer += message + '\n';
      // FFmpeg logs most output to stderr, filter out normal operational messages
      if (!message.includes('frame=') && !message.includes('time=')) {
        logger.debug('FFmpeg stderr', { streamId, message });
      }
    });

    ffmpegProcess.on('spawn', () => {
      streamInfo.status = 'active';
      logger.info('FFmpeg process started', {
        streamId,
        pid: ffmpegProcess.pid,
      });
    });

    ffmpegProcess.on('error', error => {
      streamInfo.status = 'error';
      streamInfo.lastError = error.message;
      logger.error('FFmpeg process error', {
        streamId,
        error: error.message,
        stderr: stderrBuffer.slice(-500), // Last 500 chars of stderr
        restartCount: streamInfo.restartCount,
      });

      // Auto-restart on failure (with limit)
      if (streamInfo.restartCount < 3) {
        setTimeout(() => this.restartStream(streamId), 5000);
      }
    });

    ffmpegProcess.on('exit', (code, signal) => {
      const wasActive = streamInfo.status === 'active';
      streamInfo.status = code === 0 ? 'stopped' : 'error';
      delete streamInfo.process;

      const logData: any = {
        streamId,
        code,
        signal,
        wasActive,
        restartCount: streamInfo.restartCount,
      };

      // Include stderr if exit was an error
      if (code !== 0) {
        logData.stderr = stderrBuffer.slice(-1000); // Last 1000 chars
        streamInfo.lastError = `FFmpeg exited with code ${code}`;
      }

      logger.warn('FFmpeg process exited', logData);

      // Auto-restart if it was running and exit was unexpected (but not manually stopped)
      if (
        wasActive &&
        code !== 0 &&
        streamInfo.restartCount < 3 &&
        !streamInfo.manuallyStopped
      ) {
        setTimeout(() => this.restartStream(streamId), 5000);
      }
    });

    // Wait a moment to ensure process starts successfully
    await new Promise(resolve => setTimeout(resolve, 2000));

    if (ffmpegProcess.killed || ffmpegProcess.exitCode !== null) {
      throw new Error('FFmpeg process failed to start');
    }
  }

  async restartStream(streamId: string): Promise<void> {
    const streamInfo = this.streams.get(streamId);
    if (!streamInfo) {
      logger.warn('Attempted to restart non-existent stream', { streamId });
      return;
    }

    streamInfo.restartCount++;
    streamInfo.manuallyStopped = false; // Clear manual stop flag on restart
    logger.info('Restarting stream', {
      streamId,
      attempt: streamInfo.restartCount,
      maxAttempts: 3,
    });

    // Kill existing process if running
    if (streamInfo.process && !streamInfo.process.killed) {
      streamInfo.process.kill('SIGTERM');
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    try {
      await this.startFFmpegProcess(streamInfo);
    } catch (error) {
      logger.error('Stream restart failed', {
        streamId,
        error: error instanceof Error ? error.message : error,
      });
    }
  }

  async stopStream(streamId: string): Promise<boolean> {
    const streamInfo = this.streams.get(streamId);
    if (!streamInfo) {
      logger.warn('Attempted to stop non-existent stream', { streamId });
      return false;
    }

    logger.info('Stopping stream', { streamId });

    // Mark as manually stopped to prevent auto-restart
    streamInfo.manuallyStopped = true;

    if (streamInfo.process && !streamInfo.process.killed) {
      streamInfo.process.kill('SIGTERM');

      // Wait for graceful shutdown
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Force kill if still running
      if (!streamInfo.process.killed) {
        streamInfo.process.kill('SIGKILL');
      }
    }

    streamInfo.status = 'stopped';
    delete streamInfo.process;

    // Clean up output directory
    try {
      await this.cleanupStreamOutput(streamInfo.outputPath);
    } catch (error) {
      logger.warn('Failed to cleanup stream output', {
        streamId,
        error: error instanceof Error ? error.message : error,
      });
    }

    this.streams.delete(streamId);
    logger.info('Stream stopped and cleaned up', { streamId });

    return true;
  }

  getStream(streamId: string): StreamInfo | undefined {
    return this.streams.get(streamId);
  }

  getAllStreams(): StreamInfo[] {
    return Array.from(this.streams.values());
  }

  getActiveStreamCount(): number {
    return Array.from(this.streams.values()).filter(s => s.status === 'active')
      .length;
  }

  async getStreamHealth(streamId: string): Promise<{
    isHealthy: boolean;
    playlistExists: boolean;
    segmentCount: number;
    lastSegmentAge?: number;
  }> {
    const streamInfo = this.streams.get(streamId);
    if (!streamInfo) {
      return { isHealthy: false, playlistExists: false, segmentCount: 0 };
    }

    const playlistPath = path.join(streamInfo.outputPath, 'playlist.m3u8');

    try {
      const stats = await fs.stat(playlistPath);
      const playlistContent = await fs.readFile(playlistPath, 'utf-8');

      // Count segments in playlist
      const segmentCount = (playlistContent.match(/\.ts$/gm) || []).length;

      // Check age of last segment
      const lastSegmentAge = Date.now() - stats.mtime.getTime();

      const isHealthy = segmentCount > 0 && lastSegmentAge < 10000; // Less than 10 seconds old

      return {
        isHealthy,
        playlistExists: true,
        segmentCount,
        lastSegmentAge,
      };
    } catch (error) {
      return { isHealthy: false, playlistExists: false, segmentCount: 0 };
    }
  }

  private async cleanupStreamOutput(outputPath: string): Promise<void> {
    try {
      const files = await fs.readdir(outputPath);
      for (const file of files) {
        await fs.unlink(path.join(outputPath, file));
      }
      await fs.rmdir(outputPath);
    } catch (error) {
      // Ignore cleanup errors
    }
  }

  private initializeCleanup(): void {
    // Clean up old segments every minute
    this.cleanupJob = cron.schedule('*/1 * * * *', async () => {
      for (const streamInfo of this.streams.values()) {
        if (streamInfo.status === 'active') {
          await this.cleanupOldSegments(streamInfo.outputPath);
        }
      }
    });

    logger.info('Stream cleanup job initialized');
  }

  private initializeHealthMonitoring(): void {
    // Check stream health every 30 seconds
    this.healthCheckJob = cron.schedule('*/30 * * * * *', async () => {
      await this.performHealthChecks();
    });

    logger.info('Stream health monitoring initialized (30s interval)');
  }

  private async performHealthChecks(): Promise<void> {
    try {
      for (const [streamId, streamInfo] of this.streams.entries()) {
        // Skip manually stopped streams
        if (streamInfo.manuallyStopped) {
          continue;
        }

        // Check if stream should be active (from database)
        let shouldBeActive = false;
        if (databaseAvailable && StreamRepository) {
          try {
            const streamRepo = new StreamRepository();
            const dbStream = await streamRepo.findById(streamId);
            shouldBeActive = dbStream && dbStream.status === 'active';
          } catch (error) {
            // Skip database check on error
            continue;
          }
        }

        // If stream should be active but is stopped/error, restart it
        if (shouldBeActive && (streamInfo.status === 'stopped' || streamInfo.status === 'error')) {
          logger.warn('Detected stopped stream that should be active, restarting', {
            streamId,
            name: streamInfo.name,
            status: streamInfo.status,
            restartCount: streamInfo.restartCount,
          });

          // Reset restart count for health-check-initiated restarts
          // This allows unlimited restarts for persistent streams
          if (streamInfo.restartCount >= 3) {
            logger.info('Resetting restart count for health check restart', {
              streamId,
              oldCount: streamInfo.restartCount,
            });
            streamInfo.restartCount = 0;
          }

          // Attempt restart
          await this.restartStream(streamId);
        }

        // Check if active stream is actually producing output
        if (streamInfo.status === 'active') {
          const health = await this.getStreamHealth(streamId);

          if (!health.isHealthy) {
            logger.warn('Active stream is unhealthy, restarting', {
              streamId,
              name: streamInfo.name,
              health,
              restartCount: streamInfo.restartCount,
            });

            // Force restart for unhealthy streams
            await this.restartStream(streamId);
          }
        }
      }
    } catch (error) {
      logger.error('Health check failed', {
        error: error instanceof Error ? error.message : error,
      });
    }
  }

  private async cleanupOldSegments(outputPath: string): Promise<void> {
    try {
      const files = await fs.readdir(outputPath);
      const segmentFiles = files.filter((f: string) => f.endsWith('.ts'));

      // Keep only recent segments (beyond playlist size)
      if (segmentFiles.length > env.PLAYLIST_SIZE * 2) {
        const sortedSegments = segmentFiles.sort();
        const toDelete = sortedSegments.slice(
          0,
          segmentFiles.length - env.PLAYLIST_SIZE
        );

        for (const file of toDelete) {
          try {
            await fs.unlink(path.join(outputPath, file));
          } catch (error) {
            // Ignore individual file deletion errors
          }
        }

        logger.debug('Cleaned up old segments', {
          outputPath,
          deleted: toDelete.length,
          remaining: segmentFiles.length - toDelete.length,
        });
      }
    } catch (error) {
      logger.warn('Segment cleanup failed', {
        outputPath,
        error: error instanceof Error ? error.message : error,
      });
    }
  }

  async shutdown(): Promise<void> {
    logger.info('Shutting down stream manager');

    // Stop cleanup job
    if (this.cleanupJob) {
      this.cleanupJob.stop();
    }

    // Stop health check job
    if (this.healthCheckJob) {
      this.healthCheckJob.stop();
      logger.info('Health monitoring stopped');
    }

    // Stop all streams
    const stopPromises = Array.from(this.streams.keys()).map(streamId =>
      this.stopStream(streamId)
    );
    await Promise.allSettled(stopPromises);

    logger.info('Stream manager shutdown completed');
  }
}
