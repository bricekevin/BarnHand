import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../config/logger';
import { env } from '../config/env';

export interface ChunkInfo {
  id: string;
  streamId: string;
  startTime: number; // seconds from stream start
  duration: number; // seconds
  filename: string;
  fullPath: string;
  size?: number;
  extractedAt: Date;
  status: 'extracting' | 'ready' | 'error' | 'processing' | 'processed';
  error?: string;
}

export interface StreamSource {
  id: string;
  url: string; // HLS playlist URL
  name: string;
  active: boolean;
}

export class ChunkExtractor {
  private outputPath: string;
  private extractionProcesses = new Map<string, any>();

  constructor() {
    this.outputPath = env.CHUNK_OUTPUT_PATH;
    this.initializeOutputDirectory();
  }

  private async initializeOutputDirectory(): Promise<void> {
    try {
      await fs.mkdir(this.outputPath, { recursive: true });
      logger.info('Chunk output directory initialized', { path: this.outputPath });
    } catch (error) {
      logger.error('Failed to initialize chunk output directory', { 
        path: this.outputPath,
        error: error instanceof Error ? error.message : error 
      });
      throw error;
    }
  }

  async extractChunk(streamSource: StreamSource, startTime: number): Promise<ChunkInfo> {
    const chunkId = uuidv4();
    const filename = `${streamSource.id}_${Date.now()}_${Math.floor(startTime)}.mp4`;
    const outputFile = path.join(this.outputPath, filename);

    const chunkInfo: ChunkInfo = {
      id: chunkId,
      streamId: streamSource.id,
      startTime,
      duration: env.CHUNK_DURATION,
      filename,
      fullPath: outputFile,
      extractedAt: new Date(),
      status: 'extracting'
    };

    try {
      await this.runFFmpegExtraction(streamSource, outputFile, startTime);
      
      // Get file size after extraction
      try {
        const stats = await fs.stat(outputFile);
        chunkInfo.size = stats.size;
      } catch (statError) {
        logger.warn('Could not get chunk file size', { chunkId, filename });
      }

      chunkInfo.status = 'ready';
      
      logger.info('Chunk extracted successfully', {
        chunkId,
        streamId: streamSource.id,
        startTime,
        duration: env.CHUNK_DURATION,
        filename,
        size: chunkInfo.size
      });

    } catch (error) {
      chunkInfo.status = 'error';
      chunkInfo.error = error instanceof Error ? error.message : 'Unknown extraction error';
      
      logger.error('Chunk extraction failed', {
        chunkId,
        streamId: streamSource.id,
        error: chunkInfo.error
      });
      
      // Clean up failed file
      try {
        await fs.unlink(outputFile);
      } catch (cleanupError) {
        // Ignore cleanup errors
      }
      
      throw error;
    }

    return chunkInfo;
  }

  private async runFFmpegExtraction(
    streamSource: StreamSource, 
    outputFile: string, 
    startTime: number
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      // FFmpeg command to extract chunk from HLS stream
      const ffmpegArgs = [
        '-i', streamSource.url,           // Input HLS stream
        '-ss', startTime.toString(),      // Start time
        '-t', env.CHUNK_DURATION.toString(), // Duration
        '-c', 'copy',                     // Copy streams (no re-encoding)
        '-avoid_negative_ts', 'make_zero', // Handle timestamp issues
        '-f', 'mp4',                      // Output format
        '-y',                             // Overwrite existing files
        outputFile
      ];

      logger.debug('Starting FFmpeg chunk extraction', {
        streamId: streamSource.id,
        command: `ffmpeg ${ffmpegArgs.join(' ')}`,
        startTime,
        duration: env.CHUNK_DURATION
      });

      const ffmpegProcess = spawn(env.FFMPEG_BINARY, ffmpegArgs);
      const processKey = `extract_${Date.now()}`;
      this.extractionProcesses.set(processKey, ffmpegProcess);

      let stderr = '';

      ffmpegProcess.stdout?.on('data', (data) => {
        logger.debug('FFmpeg extraction stdout', { data: data.toString().trim() });
      });

      ffmpegProcess.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      ffmpegProcess.on('close', (code) => {
        this.extractionProcesses.delete(processKey);
        
        if (code === 0) {
          logger.debug('FFmpeg extraction completed', { 
            outputFile,
            startTime,
            duration: env.CHUNK_DURATION
          });
          resolve();
        } else {
          logger.error('FFmpeg extraction failed', { 
            code,
            stderr: stderr.slice(-500), // Last 500 chars of stderr
            outputFile,
            startTime
          });
          reject(new Error(`FFmpeg extraction failed with code ${code}`));
        }
      });

      ffmpegProcess.on('error', (error) => {
        this.extractionProcesses.delete(processKey);
        logger.error('FFmpeg process error during extraction', { 
          error: error.message,
          outputFile 
        });
        reject(error);
      });

      // Timeout after 30 seconds
      setTimeout(() => {
        if (this.extractionProcesses.has(processKey)) {
          ffmpegProcess.kill('SIGTERM');
          this.extractionProcesses.delete(processKey);
          reject(new Error('Chunk extraction timeout (30s)'));
        }
      }, 30000);
    });
  }

  async cleanupOldChunks(): Promise<number> {
    try {
      const files = await fs.readdir(this.outputPath);
      const cutoffTime = Date.now() - (env.CHUNK_RETENTION_HOURS * 60 * 60 * 1000);
      let deletedCount = 0;

      for (const filename of files) {
        if (!filename.endsWith('.mp4')) continue;
        
        const filePath = path.join(this.outputPath, filename);
        
        try {
          const stats = await fs.stat(filePath);
          
          if (stats.mtime.getTime() < cutoffTime) {
            await fs.unlink(filePath);
            deletedCount++;
            logger.debug('Deleted old chunk', { filename, age: Date.now() - stats.mtime.getTime() });
          }
        } catch (error) {
          logger.warn('Failed to process chunk file during cleanup', { 
            filename,
            error: error instanceof Error ? error.message : error 
          });
        }
      }

      if (deletedCount > 0) {
        logger.info('Chunk cleanup completed', { deletedCount, retentionHours: env.CHUNK_RETENTION_HOURS });
      }

      return deletedCount;
    } catch (error) {
      logger.error('Chunk cleanup failed', { error });
      return 0;
    }
  }

  async getChunkInfo(chunkId: string): Promise<ChunkInfo | null> {
    try {
      const files = await fs.readdir(this.outputPath);
      const chunkFile = files.find(f => f.includes(chunkId));
      
      if (!chunkFile) {
        return null;
      }

      const filePath = path.join(this.outputPath, chunkFile);
      const stats = await fs.stat(filePath);
      
      // Parse chunk info from filename (streamId_timestamp_startTime.mp4)
      const parts = path.parse(chunkFile).name.split('_');
      
      return {
        id: chunkId,
        streamId: parts[0] || 'unknown',
        startTime: parseInt(parts[2]) || 0,
        duration: env.CHUNK_DURATION,
        filename: chunkFile,
        fullPath: filePath,
        size: stats.size,
        extractedAt: stats.birthtime,
        status: 'ready'
      };
    } catch (error) {
      logger.error('Failed to get chunk info', { chunkId, error });
      return null;
    }
  }

  getActiveExtractions(): number {
    return this.extractionProcesses.size;
  }

  async shutdown(): Promise<void> {
    logger.info('Shutting down chunk extractor');
    
    // Kill all active extraction processes
    for (const [key, process] of this.extractionProcesses) {
      try {
        process.kill('SIGTERM');
        logger.debug('Killed extraction process', { key, pid: process.pid });
      } catch (error) {
        logger.warn('Failed to kill extraction process', { key, error });
      }
    }
    
    this.extractionProcesses.clear();
    logger.info('Chunk extractor shutdown completed');
  }
}