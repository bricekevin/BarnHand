import { logger } from '../config/logger';

// Try to import database, but fallback gracefully if not available
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let HorseRepository: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let StreamRepository: any;
let databaseAvailable = false;

try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const db = require('@barnhand/database');
  HorseRepository = db.HorseRepository;
  StreamRepository = db.StreamRepository;
  databaseAvailable = true;
  logger.info('Database repositories loaded successfully');
} catch (error) {
  logger.warn('Database repositories not available - will return empty data', { error: (error as Error).message });
  databaseAvailable = false;
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
  // Optional fields from JOINs for display purposes
  stream_name?: string;
  farm_name?: string;
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

  constructor() {
    // Try to use database if available
    if (databaseAvailable && HorseRepository && StreamRepository) {
      try {
        this.horseRepository = new HorseRepository();
        this.streamRepository = new StreamRepository();
        this.useDatabase = true;
        logger.info('StreamHorseService initialized with database repositories');
      } catch (error) {
        logger.warn('Database connection failed for StreamHorseService', { error });
        this.useDatabase = false;
      }
    } else {
      logger.info('StreamHorseService initialized without database - will return empty data');
    }
  }

  /**
   * Get all horses detected on a specific stream
   * @param streamId - Stream ID to query
   * @param farmId - Farm ID for authorization check
   * @returns Array of horses for the stream
   */
  async getStreamHorses(streamId: string, farmId: string): Promise<Horse[]> {
    if (!this.useDatabase) {
      // Gracefully return empty array when database unavailable
      logger.debug('Database not available - returning empty horse array', {
        streamId,
        farmId
      });
      return [];
    }

    try {
      // Verify stream belongs to farm (authorization check)
      logger.debug('Fetching stream for verification', { streamId, farmId });
      const stream = await this.streamRepository.findById(streamId);
      if (!stream) {
        throw new Error(`Stream ${streamId} not found`);
      }
      if (stream.farm_id !== farmId) {
        throw new Error(`Stream ${streamId} does not belong to farm ${farmId}`);
      }

      // Fetch horses for this stream
      logger.debug('Fetching horses for stream', { streamId });
      const horses = await this.horseRepository.findByStreamId(streamId);
      logger.debug('Fetched stream horses', {
        streamId,
        farmId,
        count: horses.length
      });

      return horses;
    } catch (error) {
      logger.error('Error in getStreamHorses', {
        error: (error as Error).message,
        stack: (error as Error).stack,
        streamId,
        farmId,
        useDatabase: this.useDatabase
      });
      throw error;
    }
  }

  /**
   * Get a specific horse by ID
   * @param horseId - Horse ID
   * @param farmId - Farm ID for authorization check
   * @returns Horse or null if not found
   */
  async getHorse(horseId: string, farmId: string): Promise<Horse | null> {
    if (!this.useDatabase) {
      logger.debug('Database not available - returning null for horse', { horseId, farmId });
      return null;
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
      logger.debug('Database not available - returning null for avatar', { horseId, farmId });
      return null;
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
      logger.debug('Database not available - returning empty summary', { streamId, farmId });
      return { total: 0, recent: [] };
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
