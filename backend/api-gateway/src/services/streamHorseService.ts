import { logger } from '../config/logger';
import { Pool } from 'pg';

// Create database pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://admin:password@postgres:5432/barnhand',
});

// Try to import database, but fallback gracefully if not available
let HorseRepository: any;
let StreamRepository: any;
try {
  const db = require('@barnhand/database');
  HorseRepository = db.HorseRepository;
  StreamRepository = db.StreamRepository;
} catch (error) {
  logger.warn('Database not available for StreamHorseService, using direct pool');
}

interface Horse {
  id: string;
  farm_id: string;
  stream_id?: string;
  name?: string;
  breed?: string;
  age?: number;
  color?: string;
  markings?: string;
  gender?: 'mare' | 'stallion' | 'gelding' | 'unknown';
  tracking_id?: string;
  ui_color?: string;
  feature_vector?: number[];
  thumbnail_url?: string;
  avatar_thumbnail?: string; // base64 encoded
  first_detected?: Date;
  last_seen?: Date;
  total_detections: number;
  confidence_score: number;
  metadata: Record<string, any>;
  created_at: Date;
  updated_at: Date;
}

export interface UpdateHorseDto {
  name?: string;
  breed?: string;
  age?: number;
  color?: string;
  markings?: string;
  gender?: 'mare' | 'stallion' | 'gelding' | 'unknown';
  metadata?: Record<string, any>;
}

class StreamHorseService {
  private horseRepository: any;
  private streamRepository: any;
  private useDatabase = false;
  private useDirectPool = true; // Use direct pool as workaround

  constructor() {
    // Try to use database if available
    if (HorseRepository && StreamRepository) {
      try {
        this.horseRepository = new HorseRepository();
        this.streamRepository = new StreamRepository();
        this.useDatabase = true;
        this.useDirectPool = false;
        logger.info('StreamHorseService initialized with database repositories');
      } catch (error) {
        logger.warn('Database connection failed for StreamHorseService', { error });
        this.useDatabase = false;
      }
    } else {
      logger.info('StreamHorseService using direct PostgreSQL pool');
    }
  }

  /**
   * Get all horses detected on a specific stream
   * @param streamId - Stream ID to query
   * @param farmId - Farm ID for authorization check
   * @returns Array of horses for the stream
   */
  async getStreamHorses(streamId: string, farmId: string): Promise<Horse[]> {
    if (this.useDirectPool) {
      // Direct PostgreSQL query as workaround
      const streamQuery = await pool.query(
        'SELECT * FROM streams WHERE id = $1',
        [streamId]
      );

      if (streamQuery.rows.length === 0) {
        throw new Error(`Stream ${streamId} not found`);
      }

      const stream = streamQuery.rows[0];
      if (stream.farm_id !== farmId) {
        throw new Error(`Stream ${streamId} does not belong to farm ${farmId}`);
      }

      const horsesQuery = await pool.query(
        'SELECT * FROM horses WHERE stream_id = $1 ORDER BY last_seen DESC',
        [streamId]
      );

      logger.debug('Fetched stream horses (direct)', {
        streamId,
        farmId,
        count: horsesQuery.rows.length
      });

      return horsesQuery.rows;
    }

    if (!this.useDatabase) {
      throw new Error('Database not available');
    }

    // Verify stream belongs to farm (authorization check)
    const stream = await this.streamRepository.findById(streamId);
    if (!stream) {
      throw new Error(`Stream ${streamId} not found`);
    }
    if (stream.farm_id !== farmId) {
      throw new Error(`Stream ${streamId} does not belong to farm ${farmId}`);
    }

    // Fetch horses for this stream
    const horses = await this.horseRepository.findByStreamId(streamId);
    logger.debug('Fetched stream horses', {
      streamId,
      farmId,
      count: horses.length
    });

    return horses;
  }

  /**
   * Get a specific horse by ID
   * @param horseId - Horse ID
   * @param farmId - Farm ID for authorization check
   * @returns Horse or null if not found
   */
  async getHorse(horseId: string, farmId: string): Promise<Horse | null> {
    if (!this.useDatabase) {
      throw new Error('Database not available');
    }

    const horse = await this.horseRepository.findById(horseId);
    if (!horse) {
      return null;
    }

    // Verify horse belongs to farm (authorization check)
    if (horse.farm_id !== farmId) {
      throw new Error(`Horse ${horseId} does not belong to farm ${farmId}`);
    }

    return horse;
  }

  /**
   * Update horse details (name, breed, metadata)
   * @param horseId - Horse ID to update
   * @param farmId - Farm ID for authorization check
   * @param updates - Fields to update
   * @returns Updated horse
   */
  async updateHorse(
    horseId: string,
    farmId: string,
    updates: UpdateHorseDto
  ): Promise<Horse> {
    if (!this.useDatabase) {
      throw new Error('Database not available');
    }

    // Verify horse exists and belongs to farm
    const existingHorse = await this.horseRepository.findById(horseId);
    if (!existingHorse) {
      throw new Error(`Horse ${horseId} not found`);
    }
    if (existingHorse.farm_id !== farmId) {
      throw new Error(`Horse ${horseId} does not belong to farm ${farmId}`);
    }

    // Update horse details
    const updatedHorse = await this.horseRepository.updateHorseDetails(horseId, updates);

    logger.info('Horse details updated', {
      horseId,
      farmId,
      updates: Object.keys(updates)
    });

    return updatedHorse;
  }

  /**
   * Get horse avatar thumbnail as Buffer
   * @param horseId - Horse ID
   * @param farmId - Farm ID for authorization check
   * @returns Buffer containing JPEG image, or null if no avatar
   */
  async getHorseAvatar(horseId: string, farmId: string): Promise<Buffer | null> {
    if (!this.useDatabase) {
      throw new Error('Database not available');
    }

    // Verify horse exists and belongs to farm
    const horse = await this.horseRepository.findById(horseId);
    if (!horse) {
      throw new Error(`Horse ${horseId} not found`);
    }
    if (horse.farm_id !== farmId) {
      throw new Error(`Horse ${horseId} does not belong to farm ${farmId}`);
    }

    // avatar_thumbnail is base64 in the Horse object from mapRowToHorse
    // We need to get the raw BYTEA from the database
    // For now, convert the base64 back to Buffer if it exists
    if (horse.avatar_thumbnail) {
      return Buffer.from(horse.avatar_thumbnail, 'base64');
    }

    return null;
  }

  /**
   * Get summary statistics for stream horses
   * @param streamId - Stream ID
   * @param farmId - Farm ID for authorization check
   * @returns Summary with total count and recent detections
   */
  async getStreamHorseSummary(
    streamId: string,
    farmId: string
  ): Promise<{ total: number; recent: Horse[] }> {
    if (!this.useDatabase) {
      throw new Error('Database not available');
    }

    // Verify stream belongs to farm
    const stream = await this.streamRepository.findById(streamId);
    if (!stream) {
      throw new Error(`Stream ${streamId} not found`);
    }
    if (stream.farm_id !== farmId) {
      throw new Error(`Stream ${streamId} does not belong to farm ${farmId}`);
    }

    const horses = await this.horseRepository.findByStreamId(streamId);

    // Return total count and up to 3 most recent horses
    return {
      total: horses.length,
      recent: horses.slice(0, 3)
    };
  }
}

// Export singleton instance
export const streamHorseService = new StreamHorseService();
