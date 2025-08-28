import cron from 'node-cron';
import { logger } from '../config/logger';
import { env } from '../config/env';
import { ChunkExtractor, StreamSource, ChunkInfo } from './ChunkExtractor';
import { ProcessingQueue } from './ProcessingQueue';

export interface ProcessorMetrics {
  chunksExtracted: number;
  chunksProcessed: number;
  chunksFailed: number;
  avgExtractionTime: number;
  avgProcessingTime: number;
  queueDepth: number;
  activeExtractions: number;
}

export class StreamProcessor {
  private chunkExtractor: ChunkExtractor;
  private processingQueue: ProcessingQueue;
  private activeStreams = new Map<string, StreamSource>();
  private processingJobs: Map<string, any> = new Map();
  private metrics: ProcessorMetrics;
  private cleanupJob?: any;

  constructor() {
    this.chunkExtractor = new ChunkExtractor();
    this.processingQueue = new ProcessingQueue();
    this.metrics = {
      chunksExtracted: 0,
      chunksProcessed: 0,
      chunksFailed: 0,
      avgExtractionTime: 0,
      avgProcessingTime: 0,
      queueDepth: 0,
      activeExtractions: 0
    };

    this.initializeCleanupJob();
  }

  async initialize(): Promise<void> {
    await this.processingQueue.initialize();
    logger.info('Stream processor initialized');
  }

  async startStreamProcessing(streamSource: StreamSource): Promise<void> {
    if (this.activeStreams.has(streamSource.id)) {
      throw new Error(`Stream ${streamSource.id} is already being processed`);
    }

    this.activeStreams.set(streamSource.id, streamSource);

    // Start continuous chunk extraction
    const processingJob = this.scheduleChunkExtraction(streamSource);
    this.processingJobs.set(streamSource.id, processingJob);

    logger.info('Started stream processing', {
      streamId: streamSource.id,
      streamUrl: streamSource.url,
      chunkDuration: env.CHUNK_DURATION,
      processingDelay: env.PROCESSING_DELAY
    });
  }

  async stopStreamProcessing(streamId: string): Promise<boolean> {
    const streamSource = this.activeStreams.get(streamId);
    if (!streamSource) {
      logger.warn('Attempted to stop non-existent stream processing', { streamId });
      return false;
    }

    // Stop the processing job
    const processingJob = this.processingJobs.get(streamId);
    if (processingJob) {
      clearInterval(processingJob);
      this.processingJobs.delete(streamId);
    }

    this.activeStreams.delete(streamId);

    logger.info('Stopped stream processing', { streamId });
    return true;
  }

  private scheduleChunkExtraction(streamSource: StreamSource): NodeJS.Timeout {
    let currentTime = 0;
    
    // Extract chunks at regular intervals based on chunk duration minus overlap
    const extractionInterval = (env.CHUNK_DURATION - env.CHUNK_OVERLAP) * 1000;

    return setInterval(async () => {
      try {
        const extractionStart = Date.now();
        
        // Extract chunk from stream
        const chunkInfo = await this.chunkExtractor.extractChunk(streamSource, currentTime);
        
        const extractionTime = Date.now() - extractionStart;
        this.updateExtractionMetrics(extractionTime);

        logger.debug('Chunk extracted for processing', {
          streamId: streamSource.id,
          chunkId: chunkInfo.id,
          startTime: currentTime,
          extractionTime
        });

        // Add chunk to ML processing queue
        const jobId = await this.processingQueue.addChunkForProcessing(chunkInfo);
        
        logger.debug('Chunk queued for ML processing', {
          streamId: streamSource.id,
          chunkId: chunkInfo.id,
          jobId
        });

        // Advance time for next chunk
        currentTime += env.CHUNK_DURATION - env.CHUNK_OVERLAP;
        
      } catch (error) {
        this.metrics.chunksFailed++;
        logger.error('Chunk extraction failed', {
          streamId: streamSource.id,
          currentTime,
          error: error instanceof Error ? error.message : error
        });
      }
    }, extractionInterval);
  }

  private updateExtractionMetrics(extractionTime: number): void {
    this.metrics.chunksExtracted++;
    
    // Update rolling average
    const alpha = 0.1; // Smoothing factor
    this.metrics.avgExtractionTime = this.metrics.avgExtractionTime === 0 
      ? extractionTime
      : (1 - alpha) * this.metrics.avgExtractionTime + alpha * extractionTime;
  }

  async updateMetrics(): Promise<void> {
    try {
      const queueStatus = await this.processingQueue.getQueueStatus();
      this.metrics.queueDepth = queueStatus.waiting + queueStatus.active;
      this.metrics.activeExtractions = this.chunkExtractor.getActiveExtractions();
      
      // Update processing metrics from completed jobs
      const jobs = this.processingQueue.getAllJobs();
      const completedJobs = jobs.filter(j => j.status === 'completed');
      const failedJobs = jobs.filter(j => j.status === 'failed');
      
      this.metrics.chunksProcessed = completedJobs.length;
      this.metrics.chunksFailed = failedJobs.length;
      
      if (completedJobs.length > 0) {
        const totalProcessingTime = completedJobs.reduce((sum, job) => 
          sum + (job.result?.processingTimeMs || 0), 0);
        this.metrics.avgProcessingTime = totalProcessingTime / completedJobs.length;
      }
      
    } catch (error) {
      logger.error('Failed to update metrics', { error });
    }
  }

  getMetrics(): ProcessorMetrics {
    return { ...this.metrics };
  }

  getActiveStreams(): StreamSource[] {
    return Array.from(this.activeStreams.values());
  }

  getStreamStatus(streamId: string): {
    isActive: boolean;
    source?: StreamSource;
    metrics: {
      chunksExtracted: number;
      processingDelay: number;
      lastChunkTime?: Date;
    };
  } {
    const source = this.activeStreams.get(streamId);
    const jobs = this.processingQueue.getAllJobs()
      .filter(j => j.chunkInfo.streamId === streamId);
    
    return {
      isActive: !!source,
      source,
      metrics: {
        chunksExtracted: jobs.length,
        processingDelay: env.PROCESSING_DELAY,
        lastChunkTime: jobs.length > 0 ? 
          jobs.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0].createdAt : 
          undefined
      }
    };
  }

  private initializeCleanupJob(): void {
    // Clean up old chunks every hour
    this.cleanupJob = cron.schedule('0 * * * *', async () => {
      try {
        logger.info('Starting scheduled chunk cleanup');
        const deletedCount = await this.chunkExtractor.cleanupOldChunks();
        logger.info('Scheduled cleanup completed', { deletedCount });
      } catch (error) {
        logger.error('Scheduled cleanup failed', { error });
      }
    });

    logger.info('Cleanup job scheduled (hourly)');
  }

  async shutdown(): Promise<void> {
    logger.info('Shutting down stream processor');
    
    try {
      // Stop cleanup job
      if (this.cleanupJob) {
        this.cleanupJob.destroy();
      }

      // Stop all stream processing
      const streamIds = Array.from(this.activeStreams.keys());
      await Promise.all(streamIds.map(id => this.stopStreamProcessing(id)));

      // Shutdown services
      await Promise.all([
        this.chunkExtractor.shutdown(),
        this.processingQueue.shutdown()
      ]);

      logger.info('Stream processor shutdown completed');
    } catch (error) {
      logger.error('Error during stream processor shutdown', { error });
    }
  }
}