import { logger } from '../config/logger';

// Try to import database, but fallback to in-memory if not available
let StreamRepository: any;
try {
  const db = require('@barnhand/database');
  StreamRepository = db.StreamRepository;
} catch (error) {
  logger.warn('Database not available, using in-memory storage');
}

interface Stream {
  id: string;
  farm_id: string;
  name: string;
  source_type: 'local' | 'youtube' | 'rtsp' | 'rtmp';
  source_url: string;
  status: 'active' | 'inactive' | 'error' | 'processing';
  processing_delay: number;
  chunk_duration: number;
  config: Record<string, any>;
  created_at: Date;
  updated_at: Date;
}

class StreamService {
  private streamRepository: any;
  private inMemoryStreams = new Map<string, Stream>();
  private useDatabase = false;

  constructor() {
    // Try to use database if available
    if (StreamRepository) {
      try {
        this.streamRepository = new StreamRepository();
        this.useDatabase = true;
        this.restoreActiveStreams();
      } catch (error) {
        logger.warn('Database connection failed, falling back to in-memory storage');
        this.useDatabase = false;
      }
    }

    logger.info(`Stream service initialized (using ${this.useDatabase ? 'database' : 'in-memory'} storage)`);
  }

  // Load and restart previously active streams on startup
  private async restoreActiveStreams() {
    if (!this.useDatabase) return;

    try {
      const activeStreams = await this.streamRepository.getActiveStreams();
      logger.info(`Restoring ${activeStreams.length} active streams`);

      for (const stream of activeStreams) {
        try {
          // Call video-streamer to restart the stream
          const response = await fetch(`http://localhost:8003/api/streams/start/${stream.id}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              videoFilename: stream.source_url.split('/').pop()
            }),
          });

          if (!response.ok) {
            logger.error(`Failed to restore stream ${stream.id}`);
            await this.streamRepository.updateStatus(stream.id, 'error');
          }
        } catch (error) {
          logger.error(`Error restoring stream ${stream.id}:`, error);
          await this.streamRepository.updateStatus(stream.id, 'error');
        }
      }
    } catch (error) {
      logger.error('Failed to restore active streams:', error);
      this.useDatabase = false;
      logger.warn('Switching to in-memory storage due to database error');
    }
  }

  async createStream(streamData: Omit<Stream, 'id' | 'created_at' | 'updated_at'>): Promise<Stream | null> {
    try {
      let stream: Stream;

      if (this.useDatabase) {
        // Use database
        stream = await this.streamRepository.create(streamData);
      } else {
        // Use in-memory storage
        stream = {
          ...streamData,
          id: `stream_${Date.now()}`,
          created_at: new Date(),
          updated_at: new Date(),
        };
        this.inMemoryStreams.set(stream.id, stream);
      }

      // Call video-streamer API to start the actual stream
      try {
        const response = await fetch(`http://localhost:8003/api/streams/start/${stream.id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            videoFilename: stream.source_url.split('/').pop()
          }),
        });

        if (response.ok) {
          stream.status = 'active';
          if (this.useDatabase) {
            await this.streamRepository.updateStatus(stream.id, 'active');
          } else {
            this.inMemoryStreams.set(stream.id, stream);
          }
        } else {
          stream.status = 'error';
          if (this.useDatabase) {
            await this.streamRepository.updateStatus(stream.id, 'error');
          } else {
            this.inMemoryStreams.set(stream.id, stream);
          }
        }
      } catch (error) {
        logger.error('Failed to start stream in video-streamer', { streamId: stream.id, error });
        stream.status = 'error';
        if (this.useDatabase) {
          await this.streamRepository.updateStatus(stream.id, 'error');
        } else {
          this.inMemoryStreams.set(stream.id, stream);
        }
      }

      return stream;
    } catch (error) {
      logger.error('Failed to create stream', { error });
      return null;
    }
  }

  async getStream(streamId: string): Promise<Stream | null> {
    if (this.useDatabase) {
      return await this.streamRepository.findById(streamId);
    } else {
      return this.inMemoryStreams.get(streamId) || null;
    }
  }

  async getAllStreams(farmId?: string): Promise<Stream[]> {
    if (this.useDatabase) {
      return await this.streamRepository.findAll(farmId);
    } else {
      const allStreams = Array.from(this.inMemoryStreams.values());
      if (farmId) {
        return allStreams.filter(s => s.farm_id === farmId);
      }
      return allStreams;
    }
  }

  async updateStream(streamId: string, updates: Partial<Stream>): Promise<Stream | null> {
    if (this.useDatabase) {
      return await this.streamRepository.update(streamId, updates);
    } else {
      const stream = this.inMemoryStreams.get(streamId);
      if (!stream) return null;
      Object.assign(stream, updates, { updated_at: new Date() });
      this.inMemoryStreams.set(streamId, stream);
      return stream;
    }
  }

  async deleteStream(streamId: string): Promise<boolean> {
    const stream = await this.getStream(streamId);
    if (!stream) return false;

    // Stop the stream if active
    if (stream.status === 'active') {
      try {
        await fetch(`http://localhost:8003/api/streams/stop/${streamId}`, {
          method: 'POST',
        });
      } catch (error) {
        logger.error('Failed to stop stream in video-streamer', { streamId, error });
      }
    }

    if (this.useDatabase) {
      return await this.streamRepository.delete(streamId);
    } else {
      return this.inMemoryStreams.delete(streamId);
    }
  }

  async startStream(streamId: string): Promise<boolean> {
    const stream = await this.getStream(streamId);
    if (!stream || stream.status === 'active') return false;

    try {
      const response = await fetch(`http://localhost:8003/api/streams/start/${streamId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoFilename: stream.source_url.split('/').pop()
        }),
      });

      if (response.ok) {
        if (this.useDatabase) {
          await this.streamRepository.updateStatus(streamId, 'active');
        } else {
          stream.status = 'active';
          this.inMemoryStreams.set(streamId, stream);
        }
        return true;
      }
    } catch (error) {
      logger.error('Failed to start stream', { streamId, error });
      if (this.useDatabase) {
        await this.streamRepository.updateStatus(streamId, 'error');
      } else {
        stream.status = 'error';
        this.inMemoryStreams.set(streamId, stream);
      }
    }

    return false;
  }

  async stopStream(streamId: string): Promise<boolean> {
    const stream = await this.getStream(streamId);
    if (!stream || stream.status !== 'active') return false;

    try {
      const response = await fetch(`http://localhost:8003/api/streams/stop/${streamId}`, {
        method: 'POST',
      });

      if (response.ok) {
        if (this.useDatabase) {
          await this.streamRepository.updateStatus(streamId, 'inactive');
        } else {
          stream.status = 'inactive';
          this.inMemoryStreams.set(streamId, stream);
        }
        return true;
      }
    } catch (error) {
      logger.error('Failed to stop stream', { streamId, error });
    }

    return false;
  }
}

// Export singleton instance
export const streamService = new StreamService();