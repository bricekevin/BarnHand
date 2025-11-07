import { createClient } from 'redis';

import { logger } from '../config/logger';

// Try to import database, but fallback gracefully if not available
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let CorrectionRepository: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let HorseRepository: any;
let databaseAvailable = false;

try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const db = require('@barnhand/database');
  CorrectionRepository = db.CorrectionRepository;
  HorseRepository = db.HorseRepository;
  databaseAvailable = true;
  logger.info('Correction repositories loaded successfully');
} catch (error) {
  logger.warn('Correction repositories not available', {
    error: (error as Error).message,
  });
  databaseAvailable = false;
}

/**
 * Correction payload from frontend
 */
export interface CorrectionPayload {
  detection_index: number;
  frame_index: number;
  correction_type: 'reassign' | 'new_guest' | 'mark_incorrect';
  original_horse_id: string;
  corrected_horse_id?: string;
  corrected_horse_name?: string;
}

/**
 * Response after submitting corrections
 */
export interface CorrectionResponse {
  message: string;
  reprocessing_url: string;
  corrections_count: number;
  chunk_id: string;
}

/**
 * Re-processing progress from ML service
 */
export interface ReprocessingProgress {
  chunk_id: string;
  status: 'idle' | 'pending' | 'running' | 'completed' | 'failed';
  progress: number;
  current_step: string;
  error?: string;
  started_at?: Date;
  completed_at?: Date;
}

/**
 * Validation result for corrections
 */
interface ValidationResult {
  valid: boolean;
  errors: string[];
}

class CorrectionService {
  private correctionRepository: any;
  private horseRepository: any;
  private useDatabase = false;
  private redisClient: ReturnType<typeof createClient> | null = null;
  private mlServiceUrl: string;

  constructor() {
    this.mlServiceUrl = process.env.ML_SERVICE_URL || 'http://ml-service:8002';

    // Try to use database if available
    if (databaseAvailable && CorrectionRepository && HorseRepository) {
      try {
        this.correctionRepository = new CorrectionRepository();
        this.horseRepository = new HorseRepository();
        this.useDatabase = true;
        logger.info('CorrectionService initialized with database repositories');
      } catch (error) {
        logger.warn('Database connection failed for CorrectionService', { error });
        this.useDatabase = false;
      }
    } else {
      logger.info('CorrectionService initialized without database');
    }

    // Initialize Redis for status tracking
    this.initRedis();
  }

  private async initRedis() {
    try {
      const redisUrl = process.env.REDIS_URL || 'redis://redis:6379';
      this.redisClient = createClient({ url: redisUrl });

      this.redisClient.on('error', err => {
        logger.error('Redis client error:', err);
      });

      await this.redisClient.connect();
      logger.info('Redis client connected for reprocessing status tracking', {
        redisUrl,
      });
    } catch (error) {
      logger.error('Failed to initialize Redis client:', error);
      this.redisClient = null;
    }
  }

  /**
   * Validate a single correction
   */
  async validateCorrection(
    correction: CorrectionPayload,
    chunkId: string
  ): Promise<ValidationResult> {
    const errors: string[] = [];

    // Validate correction type and required fields
    if (correction.correction_type === 'reassign') {
      if (!correction.corrected_horse_id) {
        errors.push('Reassign correction requires corrected_horse_id');
      } else {
        // Verify horse exists
        if (this.useDatabase) {
          try {
            const horse = await this.horseRepository.findByIdAnyStatus(
              correction.corrected_horse_id
            );
            if (!horse) {
              errors.push(
                `Target horse ${correction.corrected_horse_id} does not exist`
              );
            }
          } catch (error) {
            logger.warn('Could not validate horse existence', { error });
          }
        }
      }

      // Can't reassign to the same horse
      if (correction.corrected_horse_id === correction.original_horse_id) {
        errors.push('Cannot reassign detection to the same horse');
      }
    }

    if (correction.correction_type === 'new_guest') {
      if (!correction.corrected_horse_name) {
        errors.push('New guest correction requires corrected_horse_name');
      }
    }

    // Validate numeric fields
    if (correction.detection_index < 0) {
      errors.push('detection_index must be >= 0');
    }

    if (correction.frame_index < 0) {
      errors.push('frame_index must be >= 0');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Submit corrections for a chunk
   * Returns 202 Accepted immediately, processing happens asynchronously
   */
  async submitCorrections(
    streamId: string,
    chunkId: string,
    corrections: CorrectionPayload[],
    userId: string
  ): Promise<CorrectionResponse> {
    logger.info('Submitting corrections', {
      chunkId,
      streamId,
      userId,
      correctionsCount: corrections.length,
      useDatabase: this.useDatabase,
    });

    // Validate all corrections first (simple validation without database)
    for (const correction of corrections) {
      // Basic validation
      if (correction.correction_type === 'reassign' && !correction.corrected_horse_id) {
        throw new Error('Reassign correction requires corrected_horse_id');
      }
      if (correction.correction_type === 'new_guest' && !correction.corrected_horse_name) {
        throw new Error('New guest correction requires corrected_horse_name');
      }
      if (correction.detection_index < 0 || correction.frame_index < 0) {
        throw new Error('Invalid detection or frame index');
      }
    }

    // Store corrections in database if available
    const createdCorrections = [];
    if (this.useDatabase) {
      try {
        for (const correction of corrections) {
          const created = await this.correctionRepository.create({
            chunk_id: chunkId,
            detection_index: correction.detection_index,
            frame_index: correction.frame_index,
            correction_type: correction.correction_type,
            original_horse_id: correction.original_horse_id,
            corrected_horse_id: correction.corrected_horse_id,
            corrected_horse_name: correction.corrected_horse_name,
            user_id: userId,
          });
          createdCorrections.push(created);
        }

        logger.info('Corrections stored in database', {
          chunkId,
          correctionIds: createdCorrections.map(c => c.id),
        });
      } catch (error) {
        logger.warn('Failed to store corrections in database, continuing without persistence', {
          error: (error as Error).message,
        });
      }
    } else {
      logger.info('Database not available, triggering ML service directly without persistence');
    }

    // Trigger ML service re-processing (async)
    try {
      await this.triggerReprocessing(chunkId, corrections);
    } catch (error) {
      logger.error('Failed to trigger ML re-processing', {
        error: (error as Error).message,
        chunkId,
      });
      // Mark corrections as failed if we have them in database
      if (this.useDatabase && createdCorrections.length > 0) {
        for (const correction of createdCorrections) {
          await this.correctionRepository.updateStatus(
            correction.id,
            'failed',
            `Failed to trigger re-processing: ${(error as Error).message}`
          );
        }
      }
      throw new Error(`Failed to trigger re-processing: ${(error as Error).message}`);
    }

    return {
      message: 'Corrections queued for processing',
      reprocessing_url: `/api/v1/streams/${streamId}/chunks/${chunkId}/corrections/status`,
      corrections_count: corrections.length,
      chunk_id: chunkId,
    };
  }

  /**
   * Trigger ML service to re-process chunk with corrections
   */
  private async triggerReprocessing(
    chunkId: string,
    corrections: CorrectionPayload[]
  ): Promise<void> {
    const url = `${this.mlServiceUrl}/api/v1/reprocess/chunk/${chunkId}`;

    logger.info('Triggering ML service re-processing', { url, chunkId });

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ chunk_id: chunkId, corrections }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({})) as { message?: string };
        throw new Error(
          `ML service error: ${errorData.message || response.statusText}`
        );
      }

      logger.info('ML service re-processing triggered successfully', {
        chunkId,
        status: response.status,
      });
    } catch (error) {
      if (error instanceof Error) {
        logger.error('ML service request failed', {
          chunkId,
          message: error.message,
        });
        throw new Error(`ML service error: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Get re-processing status for a chunk
   */
  async getReprocessingStatus(chunkId: string): Promise<ReprocessingProgress> {
    // Try to get status from Redis first (real-time)
    if (this.redisClient) {
      try {
        const statusKey = `reprocessing:${chunkId}:status`;
        const statusJson = await this.redisClient.get(statusKey);

        if (statusJson) {
          const status = JSON.parse(statusJson);
          return {
            chunk_id: chunkId,
            status: status.status || 'running',
            progress: status.progress || 0,
            current_step: status.step || 'Processing...',
            error: status.error,
            started_at: status.started_at ? new Date(status.started_at) : undefined,
            completed_at: status.completed_at
              ? new Date(status.completed_at)
              : undefined,
          };
        }
      } catch (error) {
        logger.warn('Failed to get status from Redis', { error, chunkId });
      }
    }

    // Fallback: check database for pending corrections
    if (this.useDatabase) {
      const pendingCount = await this.correctionRepository.countPendingByChunkId(
        chunkId
      );
      const appliedCount = await this.correctionRepository.countByChunkId(chunkId);

      if (pendingCount > 0) {
        return {
          chunk_id: chunkId,
          status: 'pending',
          progress: 0,
          current_step: 'Waiting to start...',
        };
      }

      if (appliedCount > 0) {
        return {
          chunk_id: chunkId,
          status: 'completed',
          progress: 100,
          current_step: 'Completed',
        };
      }
    }

    // No status found
    return {
      chunk_id: chunkId,
      status: 'idle',
      progress: 0,
      current_step: 'No corrections applied',
    };
  }

  /**
   * Cancel all pending corrections for a chunk
   */
  async cancelPendingCorrections(chunkId: string): Promise<number> {
    if (!this.useDatabase) {
      throw new Error('Database not available');
    }

    const deletedCount = await this.correctionRepository.deletePending(chunkId);

    logger.info('Cancelled pending corrections', { chunkId, deletedCount });

    return deletedCount;
  }

  /**
   * Get correction history for a chunk
   */
  async getChunkCorrections(chunkId: string) {
    if (!this.useDatabase) {
      return [];
    }

    return this.correctionRepository.findByChunkId(chunkId);
  }
}

// Export singleton instance
export const correctionService = new CorrectionService();
