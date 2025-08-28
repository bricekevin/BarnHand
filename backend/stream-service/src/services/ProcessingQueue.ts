import Redis from 'ioredis';
import Bull from 'bull';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../config/logger';
import { env } from '../config/env';
import { ChunkInfo } from './ChunkExtractor';

export interface ProcessingJob {
  id: string;
  chunkInfo: ChunkInfo;
  priority: number;
  attempts: number;
  status: 'waiting' | 'processing' | 'completed' | 'failed';
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
  result?: {
    processedChunkPath: string;
    detections: any[];
    processingTimeMs: number;
  };
}

export class ProcessingQueue {
  private redis: Redis;
  private queue: Bull.Queue<ChunkInfo>;
  private jobs = new Map<string, ProcessingJob>();

  constructor() {
    // Initialize Redis connection
    this.redis = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      lazyConnect: true
    });

    // Initialize Bull queue for ML processing
    this.queue = new Bull('chunk-processing', {
      redis: {
        port: this.getRedisPort(),
        host: this.getRedisHost()
      },
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000
        },
        removeOnComplete: 10, // Keep last 10 completed jobs
        removeOnFail: 25 // Keep last 25 failed jobs for debugging
      }
    });

    this.initializeQueueHandlers();
  }

  async initialize(): Promise<void> {
    try {
      await this.redis.ping();
      logger.info('Redis connection established for processing queue');
      
      // Clean up any stale jobs from previous runs
      await this.queue.clean(5000, 'completed');
      await this.queue.clean(10000, 'failed');
      
      logger.info('Processing queue initialized', {
        maxConcurrency: env.QUEUE_CONCURRENCY,
        maxQueueSize: env.MAX_QUEUE_SIZE
      });
    } catch (error) {
      logger.error('Failed to initialize processing queue', { error });
      throw error;
    }
  }

  async addChunkForProcessing(chunkInfo: ChunkInfo): Promise<string> {
    try {
      // Check queue size limit
      const waiting = await this.queue.getWaiting();
      if (waiting.length >= env.MAX_QUEUE_SIZE) {
        throw new Error(`Queue size limit reached (${env.MAX_QUEUE_SIZE})`);
      }

      const job = await this.queue.add(chunkInfo, {
        priority: this.calculatePriority(chunkInfo),
        delay: 0 // No delay for now
      });

      const processingJob: ProcessingJob = {
        id: job.id?.toString() || uuidv4(),
        chunkInfo,
        priority: this.calculatePriority(chunkInfo),
        attempts: 0,
        status: 'waiting',
        createdAt: new Date()
      };

      this.jobs.set(processingJob.id, processingJob);

      logger.info('Chunk added to processing queue', {
        jobId: processingJob.id,
        chunkId: chunkInfo.id,
        streamId: chunkInfo.streamId,
        queueSize: waiting.length + 1
      });

      return processingJob.id;
    } catch (error) {
      logger.error('Failed to add chunk to queue', {
        chunkId: chunkInfo.id,
        error: error instanceof Error ? error.message : error
      });
      throw error;
    }
  }

  private calculatePriority(chunkInfo: ChunkInfo): number {
    // Higher priority = lower number in Bull queue
    // Prioritize recent chunks over older ones
    const ageMinutes = (Date.now() - chunkInfo.extractedAt.getTime()) / 60000;
    return Math.floor(ageMinutes); // Recent chunks get priority 0, older chunks get higher numbers
  }

  private initializeQueueHandlers(): void {
    // Process jobs with concurrency
    this.queue.process(env.QUEUE_CONCURRENCY, async (job) => {
      const chunkInfo: ChunkInfo = job.data;
      const jobId = job.id?.toString() || 'unknown';

      logger.info('Starting chunk processing', {
        jobId,
        chunkId: chunkInfo.id,
        streamId: chunkInfo.streamId,
        attempt: job.attemptsMade + 1
      });

      // Update job status
      const processingJob = this.jobs.get(jobId);
      if (processingJob) {
        processingJob.status = 'processing';
        processingJob.startedAt = new Date();
        processingJob.attempts = job.attemptsMade + 1;
      }

      try {
        // Call ML service for processing
        const result = await this.callMLService(chunkInfo);
        
        // Update job with results
        if (processingJob) {
          processingJob.status = 'completed';
          processingJob.completedAt = new Date();
          processingJob.result = result;
        }

        logger.info('Chunk processing completed', {
          jobId,
          chunkId: chunkInfo.id,
          detectionCount: result.detections.length,
          processingTime: result.processingTimeMs
        });

        return result;
      } catch (error) {
        // Update job with error
        if (processingJob) {
          processingJob.status = 'failed';
          processingJob.error = error instanceof Error ? error.message : 'Unknown error';
        }

        logger.error('Chunk processing failed', {
          jobId,
          chunkId: chunkInfo.id,
          attempt: job.attemptsMade + 1,
          error: error instanceof Error ? error.message : error
        });

        throw error;
      }
    });

    // Queue event handlers
    this.queue.on('completed', (job, result) => {
      logger.debug('Job completed', { jobId: job.id, result });
    });

    this.queue.on('failed', (job, error) => {
      logger.warn('Job failed', { 
        jobId: job.id, 
        chunkId: job.data?.id,
        attempt: job.attemptsMade,
        error: error.message 
      });
    });

    this.queue.on('stalled', (job) => {
      logger.warn('Job stalled', { 
        jobId: job.id,
        chunkId: job.data?.id 
      });
    });
  }

  private async callMLService(chunkInfo: ChunkInfo): Promise<{
    processedChunkPath: string;
    detections: any[];
    processingTimeMs: number;
  }> {
    const startTime = Date.now();
    
    // TODO: Replace with actual HTTP call to ML service
    // Simulate ML processing
    await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 3000)); // 2-5 seconds

    const processingTimeMs = Date.now() - startTime;
    
    // Mock detection results
    const mockDetections = [
      {
        horse_id: 'horse_001',
        tracking_id: 'track_123',
        bbox: { x: 150, y: 200, width: 120, height: 180 },
        confidence: 0.92,
        pose_keypoints: [
          { name: 'nose', x: 210, y: 220, confidence: 0.95 },
          { name: 'neck', x: 205, y: 240, confidence: 0.88 }
        ],
        gait_type: 'walk',
        velocity: 1.2
      }
    ];

    // Mock processed chunk path (overlay will be applied by ML service)
    const processedChunkPath = chunkInfo.fullPath.replace('.mp4', '_processed.mp4');

    return {
      processedChunkPath,
      detections: mockDetections,
      processingTimeMs
    };
  }

  async getQueueStatus(): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
  }> {
    try {
      const [waiting, active, completed, failed, delayed] = await Promise.all([
        this.queue.getWaiting(),
        this.queue.getActive(), 
        this.queue.getCompleted(),
        this.queue.getFailed(),
        this.queue.getDelayed()
      ]);

      return {
        waiting: waiting.length,
        active: active.length,
        completed: completed.length,
        failed: failed.length,
        delayed: delayed.length
      };
    } catch (error) {
      logger.error('Failed to get queue status', { error });
      return { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 };
    }
  }

  getJobStatus(jobId: string): ProcessingJob | undefined {
    return this.jobs.get(jobId);
  }

  getAllJobs(): ProcessingJob[] {
    return Array.from(this.jobs.values());
  }

  private getRedisHost(): string {
    const url = new URL(env.REDIS_URL);
    return url.hostname;
  }

  private getRedisPort(): number {
    const url = new URL(env.REDIS_URL);
    return parseInt(url.port) || 6379;
  }

  async shutdown(): Promise<void> {
    logger.info('Shutting down processing queue');
    
    try {
      // Close queue
      await this.queue.close();
      
      // Close Redis connection
      this.redis.disconnect();
      
      logger.info('Processing queue shutdown completed');
    } catch (error) {
      logger.error('Error during processing queue shutdown', { error });
    }
  }
}