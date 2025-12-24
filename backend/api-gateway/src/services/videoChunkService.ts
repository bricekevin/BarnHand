import { exec } from 'child_process';
import { promises as dns } from 'dns';
import { promises as fs } from 'fs';
import path from 'path';
import { promisify } from 'util';

import { createClient } from 'redis';
import { v4 as uuidv4 } from 'uuid';

import { logger } from '../config/logger';

const execAsync = promisify(exec);

// Video chunk record structure for database
export interface VideoChunk {
  id: string;
  stream_id: string;
  farm_id: string;
  user_id: string;
  filename: string;
  file_path: string;
  file_size: number;
  duration: number; // in seconds
  start_timestamp: Date;
  end_timestamp: Date;
  source_url: string;
  status: 'recording' | 'completed' | 'failed';
  metadata: {
    codec?: string;
    resolution?: string;
    bitrate?: number;
    fps?: number;
    frame_interval?: number;
  };
  created_at: Date;
  updated_at: Date;
  correction_count?: number;
  last_corrected?: Date;
}

interface ActiveRecording {
  process?: {
    kill: (signal?: NodeJS.Signals) => boolean;
  };
  chunkId: string;
}

export class VideoChunkService {
  private chunkStoragePath: string;
  private activeRecordings: Map<string, ActiveRecording> = new Map();
  private ffmpegPath: string;
  private ffprobePath: string;
  private redisClient: ReturnType<typeof createClient> | null = null;

  constructor() {
    // Configure storage path - will be mounted volume in Docker
    this.chunkStoragePath =
      process.env.CHUNK_STORAGE_PATH || '/app/storage/chunks';

    // Auto-detect FFmpeg paths for Docker vs local development
    this.ffmpegPath = this.detectFFmpegPath();
    this.ffprobePath = this.detectFFprobePath();

    this.ensureStorageDirectory();
    this.initRedis();

    logger.info('VideoChunkService initialized', {
      chunkStoragePath: this.chunkStoragePath,
      ffmpegPath: this.ffmpegPath,
      ffprobePath: this.ffprobePath,
    });
  }

  private async initRedis() {
    try {
      const redisUrl = process.env.REDIS_URL || 'redis://redis:6379';
      this.redisClient = createClient({ url: redisUrl });

      this.redisClient.on('error', err => {
        logger.error('Redis client error:', err);
      });

      await this.redisClient.connect();
      logger.info('Redis client connected for progress tracking', { redisUrl });
    } catch (error) {
      logger.error('Failed to initialize Redis client:', error);
      this.redisClient = null;
    }
  }

  private detectFFmpegPath(): string {
    // Check if running in Docker container
    if (this.isRunningInDocker()) {
      return '/usr/bin/ffmpeg'; // Standard Docker container path
    }

    // Local development paths
    const possiblePaths = [
      '/opt/homebrew/bin/ffmpeg', // macOS Homebrew
      '/usr/local/bin/ffmpeg', // Standard local install
      '/usr/bin/ffmpeg', // System install
      'ffmpeg', // System PATH
    ];

    // For now, return the first likely path - could enhance with actual file existence check
    return possiblePaths[0];
  }

  private detectFFprobePath(): string {
    // Check if running in Docker container
    if (this.isRunningInDocker()) {
      return '/usr/bin/ffprobe'; // Standard Docker container path
    }

    // Local development paths
    const possiblePaths = [
      '/opt/homebrew/bin/ffprobe', // macOS Homebrew
      '/usr/local/bin/ffprobe', // Standard local install
      '/usr/bin/ffprobe', // System install
      'ffprobe', // System PATH
    ];

    return possiblePaths[0];
  }

  private isRunningInDocker(): boolean {
    try {
      // Import fs synchronously for this check
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const fs = require('fs');

      // Check for Docker-specific indicators
      return (
        // Docker container hostname pattern
        (process.env.HOSTNAME?.includes('-') &&
          process.env.HOSTNAME?.length > 10) ||
        // Docker-specific environment variables
        process.env.DOCKER_CONTAINER === 'true' ||
        // Check if running on Linux (typical for Docker)
        process.platform === 'linux' ||
        // Check for Docker filesystem markers
        fs.existsSync('/.dockerenv')
      );
    } catch (error) {
      return false;
    }
  }

  private convertToInternalUrl(sourceUrl: string): string {
    // If running in Docker, convert localhost URLs to internal service names
    if (this.isRunningInDocker()) {
      // Convert localhost:8003 to video-streamer:8003 for Docker internal communication
      return sourceUrl.replace(
        'http://localhost:8003',
        'http://video-streamer:8003'
      );
    }

    // Return original URL for local development
    return sourceUrl;
  }

  private async ensureStorageDirectory(): Promise<void> {
    try {
      await fs.mkdir(this.chunkStoragePath, { recursive: true });
      logger.info('Chunk storage directory ensured', {
        path: this.chunkStoragePath,
      });
    } catch (error) {
      logger.error('Failed to create chunk storage directory', {
        error,
        path: this.chunkStoragePath,
      });
      throw error;
    }
  }

  /**
   * Resolve hostname to IP address to work around Docker DNS issues with child processes
   * FFmpeg spawned via exec() doesn't inherit Docker DNS configuration properly
   */
  private async resolveHostnameInUrl(url: string): Promise<string> {
    try {
      // Parse URL to extract hostname
      const urlMatch = url.match(/^(rtsp:\/\/|http:\/\/|https:\/\/)([^:/]+)(.*)/);
      if (!urlMatch) {
        // Not a URL we can parse, return as-is
        return url;
      }

      const [, protocol, hostname, rest] = urlMatch;

      // Check if hostname is already an IP address
      const isIpAddress = /^(\d{1,3}\.){3}\d{1,3}$/.test(hostname);
      if (isIpAddress) {
        // Already an IP, no need to resolve
        return url;
      }

      // Resolve hostname to IP
      logger.debug('Resolving hostname for FFmpeg', { hostname });
      const addresses = await dns.resolve4(hostname);

      if (addresses.length === 0) {
        logger.warn('No DNS resolution results, using original URL', { hostname });
        return url;
      }

      const ipAddress = addresses[0];
      const resolvedUrl = `${protocol}${ipAddress}${rest}`;

      logger.info('Resolved hostname to IP for FFmpeg', {
        original: url,
        resolved: resolvedUrl,
        hostname,
        ipAddress,
      });

      return resolvedUrl;
    } catch (error) {
      logger.warn('Failed to resolve hostname, using original URL', {
        error,
        url,
      });
      return url;
    }
  }

  async recordChunk(
    streamId: string,
    farmId: string,
    userId: string,
    sourceUrl: string,
    duration: number = 5,
    frameInterval: number = 1
  ): Promise<VideoChunk> {
    // Convert external URLs to internal Docker URLs when running in container
    const internalSourceUrl = this.convertToInternalUrl(sourceUrl);
    const chunkId = uuidv4();
    const timestamp = new Date();
    // Use chunkId in filename so we can recover it later
    const filename = `chunk_${streamId}_${chunkId}.mp4`;
    const filePath = path.join(
      this.chunkStoragePath,
      farmId,
      streamId,
      filename
    );

    // Ensure stream-specific directory exists
    const streamDir = path.dirname(filePath);
    await fs.mkdir(streamDir, { recursive: true });

    const chunk: VideoChunk = {
      id: chunkId,
      stream_id: streamId,
      farm_id: farmId,
      user_id: userId,
      filename,
      file_path: filePath,
      file_size: 0,
      duration,
      start_timestamp: timestamp,
      end_timestamp: new Date(timestamp.getTime() + duration * 1000),
      source_url: internalSourceUrl,
      status: 'recording',
      metadata: {
        frame_interval: frameInterval,
      },
      created_at: timestamp,
      updated_at: timestamp,
    };

    try {
      // Start recording using ffmpeg
      await this.startRecording(chunk);

      // TODO: Save to database
      // await VideoChunkRepository.create(chunk);

      logger.info('Video chunk recording started', {
        chunkId,
        streamId,
        farmId,
        userId,
        duration,
        filePath,
      });

      return chunk;
    } catch (error) {
      logger.error('Failed to start video chunk recording', {
        error,
        chunkId,
        streamId,
        sourceUrl,
      });
      throw error;
    }
  }

  private async startRecording(chunk: VideoChunk): Promise<void> {
    const { source_url, file_path, duration, id } = chunk;

    try {
      // Resolve hostname to IP address to work around Docker DNS issues
      // FFmpeg spawned via exec() doesn't inherit Docker DNS configuration
      const resolvedUrl = await this.resolveHostnameInUrl(source_url);

      // FFmpeg command to record chunk from live stream
      // For HLS streams, we capture the live edge and record for specified duration
      const ffmpegArgs = [this.ffmpegPath, '-y']; // Overwrite output files without asking

      // Detect if source is RTSP and add required transport settings
      const isRTSP = resolvedUrl.toLowerCase().startsWith('rtsp://');
      if (isRTSP) {
        // Add RTSP-specific flags BEFORE the input
        ffmpegArgs.push(
          '-rtsp_transport',
          'tcp', // Use TCP for RTSP
          '-timeout',
          '10000000' // 10 second timeout
        );
      }

      // Add input source (use resolved URL)
      ffmpegArgs.push('-i', resolvedUrl);

      // Add duration and output settings
      // Re-encode to H.264 to ensure proper frame counts/durations that OpenCV can read
      // HEVC streams with -c:v copy often result in corrupted metadata (duration=0, nb_frames=1)
      ffmpegArgs.push(
        '-t',
        duration.toString(),
        '-c:v',
        'libx264', // Re-encode to H.264 for better compatibility
        '-preset',
        'ultrafast', // Fastest encoding preset for low latency
        '-crf',
        '23', // Good quality/size balance
        '-r',
        '30', // Force 30fps output for consistent frame timing
        '-an', // Skip audio (ML processing only needs video)
        '-avoid_negative_ts',
        'make_zero',
        '-f',
        'mp4',
        '-movflags',
        'faststart',
        file_path
      );

      logger.info('Starting FFmpeg recording', {
        args: ffmpegArgs,
        chunkId: id,
        sourceUrl: source_url,
        outputPath: file_path,
        duration,
      });

      // Execute FFmpeg recording with proper error handling
      const { stdout, stderr } = await execAsync(ffmpegArgs.join(' '), {
        timeout: (duration + 30) * 1000, // Add 30 second buffer for HLS processing
        maxBuffer: 1024 * 1024 * 10, // 10MB buffer for output
      });

      logger.info('FFmpeg completed successfully', {
        chunkId: id,
        stdout: stdout.substring(0, 500), // Log first 500 chars
        stderr: stderr.substring(0, 500),
      });

      // Verify file was created and has content
      let stats;
      try {
        stats = await fs.stat(file_path);
      } catch (statError) {
        throw new Error(`Output file not created: ${file_path}`);
      }

      if (stats.size === 0) {
        throw new Error(`Output file is empty: ${file_path}`);
      }

      // Update chunk with file info
      chunk.file_size = stats.size;
      chunk.status = 'completed';
      chunk.updated_at = new Date();

      // Extract metadata using ffprobe
      await this.extractMetadata(chunk);

      // Trigger ML processing asynchronously (fire and forget)
      // This won't block the response to the client
      this.triggerMLProcessing(chunk).catch(error => {
        logger.error('ML processing trigger failed (non-blocking)', {
          error,
          chunkId: id,
        });
      });

      // Remove from active recordings
      this.activeRecordings.delete(id);

      logger.info('Video chunk recording completed successfully', {
        chunkId: id,
        fileSize: chunk.file_size,
        filePath: file_path,
        duration: chunk.duration,
      });
    } catch (error) {
      chunk.status = 'failed';
      chunk.updated_at = new Date();
      this.activeRecordings.delete(id);

      // Log detailed error information
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;

      logger.error('Video chunk recording failed', {
        error: errorMessage,
        stack: errorStack,
        chunkId: id,
        sourceUrl: source_url,
        outputPath: file_path,
        duration,
      });

      // Clean up failed file if it exists
      try {
        await fs.unlink(file_path);
      } catch (cleanupError) {
        logger.warn('Failed to clean up failed recording file', {
          cleanupError,
          file_path,
        });
      }

      throw new Error(`FFmpeg recording failed: ${errorMessage}`);
    }
  }

  private async extractMetadata(chunk: VideoChunk): Promise<void> {
    try {
      const ffprobeArgs = [
        this.ffprobePath,
        '-v',
        'quiet',
        '-print_format',
        'json',
        '-show_format',
        '-show_streams',
        chunk.file_path,
      ];

      const { stdout } = await execAsync(ffprobeArgs.join(' '));
      const metadata = JSON.parse(stdout);

      if (metadata.streams && metadata.streams.length > 0) {
        const videoStream = metadata.streams.find(
          (s: any) => s.codec_type === 'video'
        );
        if (videoStream) {
          // Merge with existing metadata to preserve frame_interval and other fields
          chunk.metadata = {
            ...chunk.metadata, // Preserve existing metadata (like frame_interval)
            codec: videoStream.codec_name,
            resolution: `${videoStream.width}x${videoStream.height}`,
            bitrate: parseInt(videoStream.bit_rate) || 0,
            fps: this.parseFps(videoStream.r_frame_rate),
          };
        }
      }

      logger.info('Metadata extracted for chunk (merged with existing)', {
        chunkId: chunk.id,
        metadata: chunk.metadata,
        frame_interval: chunk.metadata?.frame_interval,
      });
    } catch (error) {
      logger.warn('Failed to extract metadata for chunk', {
        error,
        chunkId: chunk.id,
      });
    }
  }

  private parseFps(fpsString: string): number {
    try {
      if (fpsString.includes('/')) {
        const [num, den] = fpsString.split('/').map(Number);
        return Math.round(num / den);
      }
      return Math.round(parseFloat(fpsString));
    } catch {
      return 0;
    }
  }

  private async getVideoDuration(filePath: string): Promise<number> {
    try {
      const ffprobeArgs = [
        this.ffprobePath,
        '-v',
        'quiet',
        '-print_format',
        'json',
        '-show_format',
        filePath,
      ];

      const { stdout } = await execAsync(ffprobeArgs.join(' '));
      const metadata = JSON.parse(stdout);

      if (metadata.format && metadata.format.duration) {
        return Math.round(parseFloat(metadata.format.duration));
      }

      // Fallback to default duration if can't extract
      return 5;
    } catch (error) {
      logger.warn('Failed to extract video duration', {
        error,
        filePath,
      });
      return 5; // Default fallback
    }
  }

  async getChunksForStream(
    streamId: string,
    farmId: string
  ): Promise<VideoChunk[]> {
    // TODO: Replace with database query
    // return await VideoChunkRepository.findByStreamId(streamId, farmId);

    // For now, scan file system for existing chunks
    const streamDir = path.join(this.chunkStoragePath, farmId, streamId);

    try {
      const files = await fs.readdir(streamDir);
      const chunks: VideoChunk[] = [];

      for (const filename of files) {
        if (filename.endsWith('.mp4')) {
          const filePath = path.join(streamDir, filename);
          try {
            const stats = await fs.stat(filePath);

            // Extract chunk_id from filename (chunk_streamId_uuid.mp4)
            // Stream ID may contain underscores (e.g., stream_001), so match after the LAST underscore
            const chunkIdMatch = filename.match(/chunk_.*_([^_]+)\.mp4$/);
            const chunkId = chunkIdMatch
              ? chunkIdMatch[1]
              : `chunk-${Date.now()}`;

            // Use file creation time as timestamp
            const timestamp = stats.birthtimeMs;

            // Use a default duration of 10 seconds (our standard chunk size)
            // This avoids expensive ffprobe calls on every request
            // The actual duration is extracted once during recording in extractMetadata()
            const videoDuration = 10;

            const chunk: VideoChunk = {
              id: chunkId,
              stream_id: streamId,
              farm_id: farmId,
              user_id: 'user-1', // TODO: Get from auth context
              filename,
              file_path: filePath,
              file_size: stats.size,
              duration: videoDuration,
              start_timestamp: new Date(timestamp),
              end_timestamp: new Date(timestamp + videoDuration * 1000),
              source_url: `http://localhost:8003/${streamId}`,
              status: 'completed',
              metadata: {},
              created_at: stats.birthtime,
              updated_at: stats.mtime,
            };

            chunks.push(chunk);
          } catch (statError) {
            logger.warn('Failed to stat chunk file', {
              error: statError,
              filename,
            });
          }
        }
      }

      // Enrich chunks with correction data from database
      await this.enrichChunksWithCorrectionData(chunks);

      // Sort by creation time, newest first
      chunks.sort((a, b) => b.created_at.getTime() - a.created_at.getTime());

      logger.info(`Found ${chunks.length} chunks for stream ${streamId}`, {
        farmId,
        streamId,
      });
      return chunks;
    } catch (error) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === 'ENOENT'
      ) {
        // Directory doesn't exist, no chunks yet
        logger.info(`No chunks directory found for stream ${streamId}`, {
          farmId,
          streamId,
        });
        return [];
      }

      logger.error('Failed to list chunks for stream', {
        error,
        farmId,
        streamId,
      });
      return [];
    }
  }

  async getChunkById(
    chunkId: string,
    farmId: string
  ): Promise<VideoChunk | null> {
    // TODO: Replace with database query
    // return await VideoChunkRepository.findById(chunkId, farmId);

    // Optimized filesystem search:
    // Instead of calling getChunksForStream (expensive), we search for the file directly
    // Chunk filename format: chunk_{streamId}_{chunkId}.mp4
    const farmDir = path.join(this.chunkStoragePath, farmId);

    try {
      // Get all stream directories in the farm
      const streamDirs = await fs.readdir(farmDir);

      for (const streamId of streamDirs) {
        const streamDirPath = path.join(farmDir, streamId);

        // Check if it's a directory
        try {
          const stats = await fs.stat(streamDirPath);
          if (!stats.isDirectory()) continue;

          // Look for chunk file directly by pattern: chunk_*_{chunkId}.mp4
          const files = await fs.readdir(streamDirPath);
          const chunkFile = files.find(
            file =>
              file.endsWith('.mp4') &&
              file.includes(`_${chunkId}.mp4`)
          );

          if (chunkFile) {
            const filePath = path.join(streamDirPath, chunkFile);
            const fileStats = await fs.stat(filePath);

            // Return minimal chunk info without expensive operations
            return {
              id: chunkId,
              stream_id: streamId,
              farm_id: farmId,
              user_id: 'user-1',
              filename: chunkFile,
              file_path: filePath,
              file_size: fileStats.size,
              duration: 10, // Default chunk duration
              start_timestamp: fileStats.birthtime,
              end_timestamp: new Date(fileStats.birthtimeMs + 10000),
              source_url: `http://localhost:8003/${streamId}`,
              status: 'completed',
              metadata: {},
              created_at: fileStats.birthtime,
              updated_at: fileStats.mtime,
            };
          }
        } catch (statError) {
          // Skip if can't stat directory
          continue;
        }
      }

      return null;
    } catch (error) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === 'ENOENT'
      ) {
        // Farm directory doesn't exist, no chunks yet
        logger.debug(`No farm directory found for chunks`, { farmId });
        return null;
      }

      logger.error('Failed to search for chunk by ID', {
        error,
        farmId,
        chunkId,
      });
      return null;
    }
  }

  async getChunkStreamUrl(
    chunkId: string,
    farmId: string,
    forceRaw: boolean = false
  ): Promise<string | null> {
    const chunk = await this.getChunkById(chunkId, farmId);
    if (!chunk) {
      return null;
    }

    // Allow serving raw video even when chunk is still processing
    // This enables playback while ML processing is in progress
    const isRecordingOrCompleted =
      chunk.status === 'completed' ||
      chunk.status === 'processing' ||
      chunk.status === 'recording';

    if (!isRecordingOrCompleted) {
      logger.warn('Chunk not ready for streaming', {
        chunkId,
        status: chunk.status,
      });
      return null;
    }

    // Check if the raw video file exists before attempting to serve it
    const rawVideoPath = path.join(
      this.chunkStoragePath,
      farmId,
      chunk.stream_id,
      chunk.filename
    );

    try {
      const rawStats = await fs.stat(rawVideoPath);
      if (!rawStats.isFile() || rawStats.size === 0) {
        logger.warn('Raw video file missing or empty', {
          chunkId,
          rawVideoPath,
        });
        return null;
      }
    } catch (error) {
      logger.error('Raw video file not accessible', {
        chunkId,
        rawVideoPath,
        error,
      });
      return null;
    }

    // Check if processed video is available and not forcing raw
    // TODO: When database is integrated, check ml_processed flag from database
    // For now, check if processed file exists on disk
    if (!forceRaw) {
      const processedFilename = `${path.basename(chunk.filename, '.mp4')}_processed.mp4`;
      const processedPath = path.join(
        this.chunkStoragePath,
        farmId,
        chunk.stream_id,
        'processed',
        processedFilename
      );

      try {
        const stats = await fs.stat(processedPath);
        if (stats.isFile() && stats.size > 0) {
          // Processed video exists, return that URL
          logger.info('Serving processed video', {
            chunkId,
            processedPath,
          });
          return `http://localhost:8003/chunks/${farmId}/${chunk.stream_id}/processed/${processedFilename}`;
        }
      } catch (error) {
        // Processed file doesn't exist yet, fall through to raw video
        logger.debug('Processed video not available, serving raw', {
          chunkId,
          processedPath,
        });
      }
    }

    // For Docker deployment, we'll serve chunks through a dedicated endpoint
    // This URL will be handled by the video-streamer service
    // Serve raw video (original recording)
    logger.info('Serving raw video', {
      chunkId,
      filename: chunk.filename,
      status: chunk.status,
    });
    return `http://localhost:8003/chunks/${farmId}/${chunk.stream_id}/${chunk.filename}`;
  }

  /**
   * Enrich detection data with horse names from database
   * Maps tracking_id to horse name for each detection in each frame
   */
  private async enrichDetectionsWithHorseNames(
    detections: any,
    streamId: string
  ): Promise<any> {
    // Import HorseRepository lazily to avoid circular dependencies
    const { HorseRepository } = await import(
      '@barnhand/database/src/repositories/HorseRepository'
    );
    const horseRepo = new HorseRepository();

    // Build a cache of tracking_id -> horse_name mappings
    const horseCache: Map<string, string | null> = new Map();

    // Process each frame in the detections
    if (detections.frames && Array.isArray(detections.frames)) {
      for (const frame of detections.frames) {
        if (frame.horses && Array.isArray(frame.horses)) {
          for (const detection of frame.horses) {
            if (
              detection.tracking_id &&
              !horseCache.has(detection.tracking_id)
            ) {
              // Look up horse by tracking_id
              try {
                const horse = await horseRepo.findByTrackingId(
                  detection.tracking_id
                );
                // Cache the result (null if not found, name if found)
                horseCache.set(
                  detection.tracking_id,
                  horse && horse.name ? horse.name : null
                );
              } catch (error) {
                logger.warn('Failed to lookup horse by tracking_id', {
                  tracking_id: detection.tracking_id,
                  error,
                });
                // Cache null to avoid repeated failed lookups
                horseCache.set(detection.tracking_id, null);
              }
            }

            // Set horse_name from cache
            detection.horse_name =
              horseCache.get(detection.tracking_id) || null;
          }
        }
      }
    }

    logger.debug('Enriched detections with horse names', {
      streamId,
      totalHorsesCached: horseCache.size,
      horsesWithNames: Array.from(horseCache.values()).filter(
        name => name !== null
      ).length,
    });

    return detections;
  }

  async getChunkDetections(
    chunkId: string,
    farmId: string
  ): Promise<any | null> {
    const chunk = await this.getChunkById(chunkId, farmId);
    if (!chunk) {
      return null;
    }

    // Build path to detections JSON file
    const detectionsFilename = `${path.basename(chunk.filename, '.mp4')}_detections.json`;
    const detectionsPath = path.join(
      this.chunkStoragePath,
      farmId,
      chunk.stream_id,
      'detections',
      detectionsFilename
    );

    try {
      // Read and parse detections JSON file
      const detectionsData = await fs.readFile(detectionsPath, 'utf-8');
      let detections = JSON.parse(detectionsData);

      // Enrich detections with horse names from database
      detections = await this.enrichDetectionsWithHorseNames(
        detections,
        chunk.stream_id
      );

      logger.info('Chunk detections retrieved and enriched', {
        chunkId,
        farmId,
        detectionsPath,
      });

      return detections;
    } catch (error) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === 'ENOENT'
      ) {
        // File doesn't exist - chunk not processed yet
        logger.debug('Detections file not found', {
          chunkId,
          detectionsPath,
        });
        return null;
      }

      // Other error (parse error, permission, etc)
      logger.error('Failed to read chunk detections', {
        error,
        chunkId,
        detectionsPath,
      });
      throw error;
    }
  }

  async getChunkFrame(
    chunkId: string,
    framePath: string,
    farmId: string
  ): Promise<Buffer | null> {
    const chunk = await this.getChunkById(chunkId, farmId);
    if (!chunk) {
      return null;
    }

    // Build path to frame image file
    // framePath is relative like "frame_0015.jpg"
    const frameFilePath = path.join(
      this.chunkStoragePath,
      farmId,
      chunk.stream_id,
      'detections',
      path.basename(chunk.filename, '.mp4') + '_detections',
      'frames',
      framePath
    );

    try {
      // Read frame image file as buffer
      const frameBuffer = await fs.readFile(frameFilePath);

      logger.debug('Chunk frame retrieved', {
        chunkId,
        farmId,
        framePath,
        frameFilePath,
      });

      return frameBuffer;
    } catch (error) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === 'ENOENT'
      ) {
        // File doesn't exist
        logger.debug('Frame file not found', {
          chunkId,
          framePath,
          frameFilePath,
        });
        return null;
      }

      // Other error
      logger.error('Failed to read chunk frame', {
        error,
        chunkId,
        framePath,
        frameFilePath,
      });
      throw error;
    }
  }

  async getChunkStatus(
    chunkId: string,
    farmId: string
  ): Promise<{
    chunk_id: string;
    recording_status: 'recording' | 'completed' | 'failed';
    ml_processed: boolean;
    processing_status: string;
    has_processed_video: boolean;
    has_detections: boolean;
    frames_processed?: number;
    total_frames?: number;
    file_size?: number;
    duration?: number;
    created_at?: Date;
  } | null> {
    const chunk = await this.getChunkById(chunkId, farmId);
    if (!chunk) {
      return null;
    }

    // Check if processed video exists
    const processedFilename = `${path.basename(chunk.filename, '.mp4')}_processed.mp4`;
    const processedPath = path.join(
      this.chunkStoragePath,
      farmId,
      chunk.stream_id,
      'processed',
      processedFilename
    );

    let hasProcessedVideo = false;
    try {
      const stats = await fs.stat(processedPath);
      hasProcessedVideo = stats.isFile() && stats.size > 0;
    } catch (error) {
      // File doesn't exist
      hasProcessedVideo = false;
    }

    // Check if detections file exists
    const detectionsFilename = `${path.basename(chunk.filename, '.mp4')}_detections.json`;
    const detectionsPath = path.join(
      this.chunkStoragePath,
      farmId,
      chunk.stream_id,
      'detections',
      detectionsFilename
    );

    let hasDetections = false;
    try {
      const stats = await fs.stat(detectionsPath);
      hasDetections = stats.isFile() && stats.size > 0;
    } catch (error) {
      // File doesn't exist
      hasDetections = false;
    }

    // Determine ML processing status based on file existence
    // TODO: When database is integrated, read ml_processed and processing_status from DB
    const ml_processed = hasProcessedVideo && hasDetections;
    let processing_status = 'pending';

    if (ml_processed) {
      processing_status = 'complete';
    } else if (hasProcessedVideo || hasDetections) {
      processing_status = 'processing'; // Partial files - still processing
    }

    // Get frame processing progress from Redis
    let frames_processed: number | undefined;
    let total_frames: number | undefined;

    // Check Redis for progress regardless of status (processing may have started but no files yet)
    if (this.redisClient && processing_status !== 'complete') {
      try {
        const progressKey = `chunk:${chunkId}:progress`;
        const progressValue = await this.redisClient.get(progressKey);

        if (progressValue) {
          // Format: "58/149"
          const [processed, total] = progressValue.split('/').map(Number);
          if (!isNaN(processed) && !isNaN(total)) {
            frames_processed = processed;
            total_frames = total;
            // If we have progress in Redis, update status to processing
            if (processing_status === 'pending') {
              processing_status = 'processing';
            }
          }
        }
      } catch (error) {
        logger.debug('Failed to fetch progress from Redis:', error);
      }
    }

    return {
      chunk_id: chunkId,
      recording_status: chunk.status,
      ml_processed,
      processing_status,
      has_processed_video: hasProcessedVideo,
      has_detections: hasDetections,
      frames_processed,
      total_frames,
      file_size: chunk.file_size,
      duration: chunk.duration,
      created_at: chunk.created_at,
    };
  }

  async cancelRecording(chunkId: string): Promise<boolean> {
    const recordingProcess = this.activeRecordings.get(chunkId);
    if (!recordingProcess || !recordingProcess.process) {
      return false;
    }

    try {
      recordingProcess.process.kill('SIGTERM');
      this.activeRecordings.delete(chunkId);

      logger.info('Video chunk recording cancelled', { chunkId });
      return true;
    } catch (error) {
      logger.error('Failed to cancel video chunk recording', {
        error,
        chunkId,
      });
      return false;
    }
  }

  async deleteChunk(chunkId: string, farmId: string): Promise<boolean> {
    try {
      const chunk = await this.getChunkById(chunkId, farmId);
      if (!chunk) {
        return false;
      }

      // Delete file from storage
      try {
        await fs.unlink(chunk.file_path);
      } catch (error) {
        logger.warn('Failed to delete chunk file', {
          error,
          filePath: chunk.file_path,
        });
      }

      // TODO: Delete from database
      // await VideoChunkRepository.delete(chunkId);

      logger.info('Video chunk deleted', {
        chunkId,
        filePath: chunk.file_path,
      });
      return true;
    } catch (error) {
      logger.error('Failed to delete video chunk', { error, chunkId });
      return false;
    }
  }

  async getAllChunks(): Promise<VideoChunk[]> {
    try {
      const allChunks: VideoChunk[] = [];

      // Read all farm directories
      const farmDirs = await fs.readdir(this.chunkStoragePath);

      for (const farmId of farmDirs) {
        const farmPath = path.join(this.chunkStoragePath, farmId);
        const farmStat = await fs.stat(farmPath);

        if (!farmStat.isDirectory()) continue;

        // Read all stream directories for this farm
        const streamDirs = await fs.readdir(farmPath);

        for (const streamId of streamDirs) {
          const streamPath = path.join(farmPath, streamId);
          const streamStat = await fs.stat(streamPath);

          if (!streamStat.isDirectory()) continue;

          // Get chunks for this stream
          try {
            const chunks = await this.getChunksForStream(streamId, farmId);
            allChunks.push(...chunks);
          } catch (error) {
            logger.debug(`Failed to get chunks for stream ${streamId}`, {
              error,
            });
          }
        }
      }

      return allChunks;
    } catch (error) {
      logger.error('Failed to get all chunks', { error });
      return [];
    }
  }

  getStorageStats(): { path: string; activeRecordings: number } {
    return {
      path: this.chunkStoragePath,
      activeRecordings: this.activeRecordings.size,
    };
  }

  /**
   * Trigger ML processing for a video chunk
   * This method sends the chunk to the ML service for processing asynchronously
   */
  async triggerMLProcessing(chunk: VideoChunk): Promise<void> {
    const {
      id: chunkId,
      stream_id: streamId,
      farm_id: farmId,
      file_path: chunkPath,
    } = chunk;

    try {
      // Define output paths for processed video and detections
      const processedDir = path.join(
        this.chunkStoragePath,
        farmId,
        streamId,
        'processed'
      );
      const detectionsDir = path.join(
        this.chunkStoragePath,
        farmId,
        streamId,
        'detections'
      );

      // Ensure output directories exist
      await fs.mkdir(processedDir, { recursive: true });
      await fs.mkdir(detectionsDir, { recursive: true });

      const outputVideoPath = path.join(
        processedDir,
        `${path.basename(chunkPath, '.mp4')}_processed.mp4`
      );
      const outputJsonPath = path.join(
        detectionsDir,
        `${path.basename(chunkPath, '.mp4')}_detections.json`
      );

      // ML Service URL - use Docker service name when running in container
      const mlServiceUrl =
        process.env.ML_SERVICE_URL || 'http://ml-service:8002';
      const processEndpoint = `${mlServiceUrl}/api/process-chunk`;

      logger.info('Triggering ML processing for chunk', {
        chunkId,
        streamId,
        farmId,
        chunkPath,
        outputVideoPath,
        outputJsonPath,
        mlServiceUrl: processEndpoint,
      });

      logger.info('📤 Sending chunk_id to ML service', {
        chunk_id: chunkId,
        frame_interval: chunk.metadata?.frame_interval || 1,
        metadata: chunk.metadata,
      });

      // TODO: Update database to mark chunk as queued for ML processing
      // await query(
      //   `UPDATE video_chunks SET
      //     processing_status = 'queued',
      //     ml_started_at = NOW()
      //   WHERE id = $1`,
      //   [chunkId]
      // );

      // Call ML service asynchronously (fire and forget)
      // The ML service will take care of updating the database when complete
      fetch(processEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chunk_id: chunkId,
          chunk_path: chunkPath,
          farm_id: farmId,
          stream_id: streamId,
          output_video_path: outputVideoPath,
          output_json_path: outputJsonPath,
          frame_interval: chunk.metadata?.frame_interval || 1,
          start_time: chunk.start_timestamp ? Math.floor(chunk.start_timestamp.getTime() / 1000) : Math.floor(Date.now() / 1000),
        }),
      })
        .then(response => {
          if (!response.ok) {
            throw new Error(
              `ML service responded with status ${response.status}`
            );
          }
          return response.json();
        })
        .then(result => {
          logger.info('ML processing started successfully', {
            chunkId,
            result,
          });
        })
        .catch(error => {
          logger.error('Failed to trigger ML processing', {
            error: error.message,
            errorStack: error.stack,
            errorType: error.constructor.name,
            chunkId,
            streamId,
            farmId,
            mlServiceUrl: processEndpoint,
          });
          // TODO: Update database to mark processing as failed
          // await query(
          //   `UPDATE video_chunks SET
          //     processing_status = 'failed',
          //     ml_completed_at = NOW()
          //   WHERE id = $1`,
          //   [chunkId]
          //);
        });

      logger.info('ML processing request sent (async)', { chunkId });
    } catch (error) {
      logger.error('Failed to prepare ML processing request', {
        error,
        chunkId,
        streamId,
        farmId,
      });
      // Don't throw - we want chunk recording to succeed even if ML processing fails
    }
  }

  /**
   * Enrich chunks with correction data from the database
   * Queries video_chunks table for correction_count and last_corrected
   */
  private async enrichChunksWithCorrectionData(
    chunks: VideoChunk[]
  ): Promise<void> {
    if (chunks.length === 0) return;

    try {
      // Dynamically import the database connection
      const { pool } = await import('@barnhand/database');

      // Get chunk IDs to query
      const chunkIds = chunks.map(c => c.id);

      // Query correction data for all chunks
      const query = `
        SELECT id, correction_count, last_corrected
        FROM video_chunks
        WHERE id = ANY($1::uuid[])
      `;

      const result = await pool.query(query, [chunkIds]);

      // Create a map for quick lookup
      const correctionDataMap = new Map<
        string,
        { correction_count: number; last_corrected?: Date }
      >();
      for (const row of result.rows) {
        correctionDataMap.set(row.id, {
          correction_count: row.correction_count || 0,
          last_corrected: row.last_corrected
            ? new Date(row.last_corrected)
            : undefined,
        });
      }

      // Enrich chunks with correction data
      for (const chunk of chunks) {
        const correctionData = correctionDataMap.get(chunk.id);
        if (correctionData) {
          chunk.correction_count = correctionData.correction_count;
          chunk.last_corrected = correctionData.last_corrected;
        } else {
          // Chunk not in database yet, set defaults
          chunk.correction_count = 0;
        }
      }

      logger.debug(`Enriched ${chunks.length} chunks with correction data`, {
        chunksWithCorrections: chunks.filter(c => (c.correction_count || 0) > 0)
          .length,
      });
    } catch (error) {
      logger.warn('Failed to enrich chunks with correction data', {
        error,
        chunkCount: chunks.length,
      });
      // Don't throw - correction data is optional
      // Set defaults for all chunks
      for (const chunk of chunks) {
        chunk.correction_count = 0;
      }
    }
  }
}

export const videoChunkService = new VideoChunkService();
