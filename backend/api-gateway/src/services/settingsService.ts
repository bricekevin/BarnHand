import { logger } from '../config/logger';

// Try to import database, but fallback gracefully if not available
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let FarmRepository: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let StreamRepository: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let HorseRepository: any;
let databaseAvailable = false;

try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const db = require('@barnhand/database');
  FarmRepository = db.FarmRepository;
  StreamRepository = db.StreamRepository;
  HorseRepository = db.HorseRepository;
  databaseAvailable = true;
  logger.info('Database repositories loaded successfully for SettingsService');
} catch (error) {
  logger.warn('Database repositories not available - SettingsService will return empty data', { error: (error as Error).message });
  databaseAvailable = false;
}

interface StreamSummary {
  id: string;
  name: string;
  status: string;
  horseCount: number;
  last_activity?: Date;
  source_url?: string;
}

interface FarmSummary {
  id: string;
  name: string;
  streamCount: number;
  horseCount: number;
  expected_horse_count?: number;
  timezone?: string;
  metadata?: Record<string, any>;
  streams: StreamSummary[];
}

interface StreamManagementOverview {
  farms: FarmSummary[];
}

class SettingsService {
  private farmRepository: any;
  private streamRepository: any;
  private horseRepository: any;
  private useDatabase = false;

  constructor() {
    // Try to use database if available
    if (databaseAvailable && FarmRepository && StreamRepository && HorseRepository) {
      try {
        this.farmRepository = new FarmRepository();
        this.streamRepository = new StreamRepository();
        this.horseRepository = new HorseRepository();
        this.useDatabase = true;
        logger.info('SettingsService initialized with database repositories');
      } catch (error) {
        logger.warn('Database connection failed for SettingsService', { error });
        this.useDatabase = false;
      }
    } else {
      logger.info('SettingsService initialized without database - will return empty data');
    }
  }

  /**
   * Get comprehensive overview of farms, streams, and horses for management UI
   * @param farmId - Optional farm ID to filter (for non-super-admin users)
   * @returns Stream management overview
   */
  async getStreamManagementOverview(farmId?: string): Promise<StreamManagementOverview> {
    if (!this.useDatabase) {
      logger.debug('Database not available - returning empty stream management overview');
      return { farms: [] };
    }

    try {
      // Get all farms (filtered by farmId if provided)
      const farms = farmId
        ? [await this.farmRepository.findById(farmId)]
        : await this.farmRepository.findAll();

      if (!farms || farms.length === 0) {
        return { farms: [] };
      }

      // Build farm summaries with stream and horse counts
      const farmSummaries: FarmSummary[] = [];

      for (const farm of farms) {
        if (!farm) continue;

        // Get all streams for this farm
        const streams = await this.streamRepository.findByFarmId(farm.id);

        // Get stream summaries with horse counts
        const streamSummaries: StreamSummary[] = [];
        let totalHorses = 0;

        for (const stream of streams) {
          // Get horses for this stream
          const horses = await this.horseRepository.findByStreamId(stream.id);
          const horseCount = horses.length;
          totalHorses += horseCount;

          // Find most recent horse activity
          const lastActivity = horses.length > 0
            ? horses.reduce((latest: Date, horse: any) =>
              horse.last_seen > latest ? horse.last_seen : latest,
              horses[0].last_seen
            )
            : undefined;

          streamSummaries.push({
            id: stream.id,
            name: stream.name,
            status: stream.status,
            horseCount,
            last_activity: lastActivity,
            source_url: stream.source_url
          });
        }

        farmSummaries.push({
          id: farm.id,
          name: farm.name,
          streamCount: streams.length,
          horseCount: totalHorses,
          expected_horse_count: farm.expected_horse_count,
          timezone: farm.timezone,
          metadata: farm.metadata,
          streams: streamSummaries
        });
      }

      logger.debug('Stream management overview generated', {
        farmCount: farmSummaries.length,
        totalStreams: farmSummaries.reduce((sum, f) => sum + f.streamCount, 0),
        totalHorses: farmSummaries.reduce((sum, f) => sum + f.horseCount, 0)
      });

      return { farms: farmSummaries };
    } catch (error) {
      logger.error('Error in getStreamManagementOverview', {
        error: (error as Error).message,
        stack: (error as Error).stack,
        farmId,
        useDatabase: this.useDatabase
      });
      throw error;
    }
  }

  /**
   * Reassign a stream to a different farm
   * @param streamId - Stream ID to reassign
   * @param newFarmId - Target farm ID
   * @param currentUserFarmId - Current user's farm ID for authorization (null for SUPER_ADMIN)
   * @returns Updated stream and count of horses reassigned
   */
  async reassignStreamToFarm(
    streamId: string,
    newFarmId: string,
    currentUserFarmId: string | null
  ): Promise<{ stream: any; horsesReassigned: number; message: string }> {
    if (!this.useDatabase) {
      throw new Error('Database not available');
    }

    try {
      // Verify stream exists
      const stream = await this.streamRepository.findById(streamId);
      if (!stream) {
        throw new Error(`Stream ${streamId} not found`);
      }

      // Only check farm ownership if user is not a SUPER_ADMIN
      // (SUPER_ADMIN passes null for currentUserFarmId)
      if (currentUserFarmId !== null && stream.farm_id !== currentUserFarmId) {
        throw new Error(`Stream ${streamId} does not belong to your farm`);
      }

      // Verify target farm exists and user has access
      const targetFarm = await this.farmRepository.findById(newFarmId);
      if (!targetFarm) {
        throw new Error(`Target farm ${newFarmId} not found`);
      }

      // Update stream's farm_id
      const updatedStream = await this.streamRepository.update(streamId, {
        farm_id: newFarmId
      });

      // Update all horses associated with this stream to the new farm
      const horses = await this.horseRepository.findByStreamId(streamId);
      let horsesReassigned = 0;

      for (const horse of horses) {
        await this.horseRepository.update(horse.id, {
          farm_id: newFarmId
        });
        horsesReassigned++;
      }

      logger.info('Stream reassigned to new farm', {
        streamId,
        oldFarmId: stream.farm_id,
        newFarmId,
        horsesReassigned
      });

      return {
        stream: updatedStream,
        horsesReassigned,
        message: `Stream reassigned successfully. ${horsesReassigned} horses moved to new farm.`
      };
    } catch (error) {
      logger.error('Error in reassignStreamToFarm', {
        error: (error as Error).message,
        stack: (error as Error).stack,
        streamId,
        newFarmId
      });
      throw error;
    }
  }
}

// Export singleton instance
export const settingsService = new SettingsService();
