import { Router } from 'express';

import { logger } from '../config/logger';
import {
  authenticateToken,
  requireRole,
  createAuthenticatedRoute,
} from '../middleware/auth';
import { videoChunkService } from '../services/videoChunkService';
import { UserRole } from '../types/auth';

const router = Router();

// Apply authentication to all admin routes
router.use(authenticateToken);
router.use(requireRole([UserRole.SUPER_ADMIN, UserRole.FARM_ADMIN]));

// DELETE /api/v1/admin/chunks - Delete all recorded chunks and related detections
router.delete(
  '/chunks',
  createAuthenticatedRoute(async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      logger.warn('Admin cleanup: Deleting all chunks and related data', {
        userId: req.user.userId,
        userEmail: req.user.email,
      });

      // CRITICAL: Stop all stream processing to prevent new chunks from being created
      try {
        logger.info('Stopping all stream processing before chunk cleanup...');
        const db = require('@barnhand/database');
        const { query } = db;

        // Set all streams to inactive to stop new chunk generation
        await query("UPDATE streams SET status = 'inactive'");

        // Clear Redis processing queue
        try {
          const Redis = require('ioredis');
          const redis = new Redis(process.env.REDIS_URL || 'redis://redis:6379');
          const queueKeys = await redis.keys('queue:*');
          if (queueKeys.length > 0) {
            await redis.del(...queueKeys);
            logger.info(`Cleared ${queueKeys.length} processing queue keys`);
          }
          await redis.quit();
        } catch (redisError: any) {
          logger.warn('Failed to clear Redis queue (non-fatal)', { error: redisError.message });
        }

        // Give processing 2 seconds to wind down
        await new Promise(resolve => setTimeout(resolve, 2000));

        logger.info('Stream processing stopped');
      } catch (stopError: any) {
        logger.warn('Failed to stop stream processing (non-fatal)', { error: stopError.message });
      }

      // Get all chunks
      const chunks = await videoChunkService.getAllChunks();

      let deletedCount = 0;
      let errorCount = 0;
      let detectionsDeleted = 0;

      // First, delete all detections that reference chunks
      // This prevents orphaned detections from staying around
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const db = require('@barnhand/database');
        const { query } = db;

        // Delete detections that have chunk_id set
        // Note: detections.chunk_id has ON DELETE CASCADE, but we delete explicitly first
        const detectionsResult = await query(
          'DELETE FROM detections WHERE chunk_id IS NOT NULL'
        );
        detectionsDeleted = detectionsResult.rowCount || 0;

        logger.info('Deleted detections associated with chunks', {
          detectionsDeleted,
        });
      } catch (dbError) {
        logger.error('Failed to delete chunk-related detections', { dbError });
        // Continue anyway - the cascade will handle it
      }

      // Delete each chunk (files + DB record)
      for (const chunk of chunks) {
        try {
          // This will delete files and DB record
          // DB record deletion will cascade to any remaining detections via ON DELETE CASCADE
          await videoChunkService.deleteChunk(chunk.id, chunk.farm_id);
          deletedCount++;
        } catch (error) {
          logger.error(`Failed to delete chunk ${chunk.id}`, { error });
          errorCount++;
        }
      }

      // Clear chunk-related Redis cache
      let redisKeysCleared = 0;
      try {
        const Redis = require('ioredis');
        const redis = new Redis(process.env.REDIS_URL || 'redis://redis:6379');

        // Clear chunk progress keys
        const chunkKeys = await redis.keys('chunk:*:progress');
        if (chunkKeys.length > 0) {
          await redis.del(...chunkKeys);
          redisKeysCleared = chunkKeys.length;
        }

        await redis.quit();
        logger.info('Admin cleanup: Chunk Redis cache cleared', { keysCleared: redisKeysCleared });
      } catch (redisError: any) {
        logger.warn('Failed to clear chunk Redis cache (non-fatal)', { error: redisError.message });
      }

      logger.info('Admin cleanup: Chunks deleted', {
        deletedCount,
        errorCount,
        detectionsDeleted,
        redisKeysCleared,
        userId: req.user.userId,
      });

      return res.json({
        message: 'Chunk cleanup completed - files and detections removed',
        chunksDeleted: deletedCount,
        errorCount,
        detectionsDeleted,
        redisKeysCleared,
        total: chunks.length,
      });
    } catch (error) {
      logger.error('Admin cleanup: Failed to delete chunks', { error });
      return res.status(500).json({ error: 'Failed to delete chunks' });
    }
  })
);

// DELETE /api/v1/admin/horses - Delete all detected horses and related data
router.delete(
  '/horses',
  createAuthenticatedRoute(async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      logger.warn('Admin cleanup: Deleting all horses and related data', {
        userId: req.user.userId,
        userEmail: req.user.email,
      });

      // CRITICAL: Stop all stream processing to prevent new horses from being created
      try {
        logger.info('Stopping all stream processing before horse cleanup...');
        const db = require('@barnhand/database');
        const { query } = db;

        // Set all streams to inactive to stop new chunk generation
        await query("UPDATE streams SET status = 'inactive'");

        // Give processing 2 seconds to wind down
        await new Promise(resolve => setTimeout(resolve, 2000));

        logger.info('Stream processing stopped');
      } catch (stopError: any) {
        logger.warn('Failed to stop stream processing (non-fatal)', { error: stopError.message });
      }

      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const db = require('@barnhand/database');
        const { query } = db;

        // Start transaction for comprehensive cleanup
        await query('BEGIN');

        // 1. Delete all detections (TimescaleDB hypertable)
        // Note: detections.horse_id has ON DELETE SET NULL, so we must delete explicitly
        const detectionsResult = await query('DELETE FROM detections');
        const detectionsDeleted = detectionsResult.rowCount || 0;

        // 2. Delete all horse_features (has CASCADE so would auto-delete, but explicit is better)
        const featuresResult = await query('DELETE FROM horse_features');
        const featuresDeleted = featuresResult.rowCount || 0;

        // 3. Delete all stream_horses associations (has CASCADE so would auto-delete)
        const streamHorsesResult = await query('DELETE FROM stream_horses');
        const streamHorsesDeleted = streamHorsesResult.rowCount || 0;

        // 4. Delete all horse-related alerts (has CASCADE so would auto-delete)
        const alertsResult = await query('DELETE FROM alerts WHERE horse_id IS NOT NULL');
        const alertsDeleted = alertsResult.rowCount || 0;

        // 5. Finally delete all horses
        const horsesResult = await query('DELETE FROM horses RETURNING id');
        const horsesDeleted = horsesResult.rowCount || 0;

        // 6. Refresh continuous aggregate views to clear cached data
        await query('CALL refresh_continuous_aggregate(\'hourly_horse_activity\', NULL, NULL)').catch(() => {
          logger.warn('Could not refresh hourly_horse_activity view');
        });
        await query('CALL refresh_continuous_aggregate(\'daily_stream_summary\', NULL, NULL)').catch(() => {
          logger.warn('Could not refresh daily_stream_summary view');
        });

        await query('COMMIT');

        // 7. Clear Redis cache (horse state, tracking data)
        let redisKeysCleared = 0;
        try {
          const Redis = require('ioredis');
          const redis = new Redis(process.env.REDIS_URL || 'redis://redis:6379');

          // Clear all horse-related keys
          const horseKeys = await redis.keys('horse:*:state');
          if (horseKeys.length > 0) {
            await redis.del(...horseKeys);
            redisKeysCleared = horseKeys.length;
          }

          await redis.quit();
          logger.info('Admin cleanup: Redis cache cleared', { keysCleared: redisKeysCleared });
        } catch (redisError: any) {
          logger.warn('Failed to clear Redis cache (non-fatal)', { error: redisError.message });
        }

        logger.info('Admin cleanup: Complete horse cleanup successful', {
          horsesDeleted,
          detectionsDeleted,
          featuresDeleted,
          streamHorsesDeleted,
          alertsDeleted,
          redisKeysCleared,
          userId: req.user.userId,
        });

        return res.json({
          message: 'Complete horse cleanup successful - all related data removed',
          horsesDeleted,
          detectionsDeleted,
          featuresDeleted,
          streamHorsesDeleted,
          alertsDeleted,
          redisKeysCleared,
        });
      } catch (dbError: any) {
        // Rollback on error
        try {
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const db = require('@barnhand/database');
          const { query } = db;
          await query('ROLLBACK');
        } catch (rollbackError) {
          logger.error('Failed to rollback transaction', { rollbackError });
        }

        logger.error('Database error during horse cleanup', {
          dbError: dbError.message,
          stack: dbError.stack,
        });
        return res.status(503).json({
          error: 'Database cleanup failed',
          details: dbError.message,
        });
      }
    } catch (error: any) {
      logger.error('Admin cleanup: Failed to delete horses', {
        error: error.message,
        stack: error.stack,
      });
      return res.status(500).json({ error: 'Failed to delete horses' });
    }
  })
);

// DELETE /api/v1/admin/reset-all - Complete system reset (chunks + horses + all related data)
router.delete(
  '/reset-all',
  createAuthenticatedRoute(async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      logger.warn('Admin cleanup: COMPLETE SYSTEM RESET requested', {
        userId: req.user.userId,
        userEmail: req.user.email,
      });

      const summary = {
        chunksDeleted: 0,
        chunkErrors: 0,
        horsesDeleted: 0,
        detectionsDeleted: 0,
        featuresDeleted: 0,
        streamHorsesDeleted: 0,
        alertsDeleted: 0,
      };

      // Step 1: Delete all video chunks and files
      try {
        const chunks = await videoChunkService.getAllChunks();
        logger.info(`Deleting ${chunks.length} video chunks...`);

        for (const chunk of chunks) {
          try {
            await videoChunkService.deleteChunk(chunk.id, chunk.farm_id);
            summary.chunksDeleted++;
          } catch (error) {
            logger.error(`Failed to delete chunk ${chunk.id}`, { error });
            summary.chunkErrors++;
          }
        }
      } catch (error) {
        logger.error('Failed to fetch/delete chunks', { error });
      }

      // Step 2: Comprehensive database cleanup
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const db = require('@barnhand/database');
        const { query } = db;

        await query('BEGIN');

        // Delete ALL detections (removes both chunk-related and horse-related)
        const detectionsResult = await query('DELETE FROM detections');
        summary.detectionsDeleted = detectionsResult.rowCount || 0;

        // Delete all horse features
        const featuresResult = await query('DELETE FROM horse_features');
        summary.featuresDeleted = featuresResult.rowCount || 0;

        // Delete all stream-horse associations
        const streamHorsesResult = await query('DELETE FROM stream_horses');
        summary.streamHorsesDeleted = streamHorsesResult.rowCount || 0;

        // Delete all horse-related alerts
        const alertsResult = await query(
          'DELETE FROM alerts WHERE horse_id IS NOT NULL'
        );
        summary.alertsDeleted = alertsResult.rowCount || 0;

        // Delete all horses
        const horsesResult = await query('DELETE FROM horses');
        summary.horsesDeleted = horsesResult.rowCount || 0;

        // Unassign all streams from barns (set farm_id to NULL)
        await query('UPDATE streams SET farm_id = NULL');
        logger.info('All streams unassigned from barns');

        // Refresh continuous aggregate views
        await query(
          'CALL refresh_continuous_aggregate(\'hourly_horse_activity\', NULL, NULL)'
        ).catch(() => {
          logger.warn('Could not refresh hourly_horse_activity view');
        });
        await query(
          'CALL refresh_continuous_aggregate(\'daily_stream_summary\', NULL, NULL)'
        ).catch(() => {
          logger.warn('Could not refresh daily_stream_summary view');
        });

        await query('COMMIT');

        // Step 3: Clear ALL Redis cache (comprehensive cleanup)
        let redisKeysCleared = 0;
        try {
          const Redis = require('ioredis');
          const redis = new Redis(process.env.REDIS_URL || 'redis://redis:6379');

          // Clear all horse-related keys
          const horseKeys = await redis.keys('horse:*');
          // Clear all chunk-related keys
          const chunkKeys = await redis.keys('chunk:*');
          // Clear any other processing keys
          const processKeys = await redis.keys('process:*');

          const allKeys = [...horseKeys, ...chunkKeys, ...processKeys];
          if (allKeys.length > 0) {
            await redis.del(...allKeys);
            redisKeysCleared = allKeys.length;
          }

          await redis.quit();
          logger.info('Admin cleanup: All Redis cache cleared', {
            keysCleared: redisKeysCleared,
            horseKeys: horseKeys.length,
            chunkKeys: chunkKeys.length,
            processKeys: processKeys.length
          });
        } catch (redisError: any) {
          logger.warn('Failed to clear Redis cache (non-fatal)', { error: redisError.message });
        }

        logger.info('Complete system reset successful', {
          ...summary,
          redisKeysCleared,
          userId: req.user.userId,
        });

        return res.json({
          message:
            'Complete system reset successful - all horses, detections, chunks, and related data removed',
          ...summary,
          redisKeysCleared,
        });
      } catch (dbError: any) {
        // Rollback on database error
        try {
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const db = require('@barnhand/database');
          const { query } = db;
          await query('ROLLBACK');
        } catch (rollbackError) {
          logger.error('Failed to rollback transaction', { rollbackError });
        }

        logger.error('Database error during system reset', {
          dbError: dbError.message,
          stack: dbError.stack,
        });

        return res.status(503).json({
          error: 'System reset failed during database cleanup',
          details: dbError.message,
          partialResults: summary,
        });
      }
    } catch (error: any) {
      logger.error('Admin cleanup: System reset failed', {
        error: error.message,
        stack: error.stack,
      });
      return res.status(500).json({
        error: 'System reset failed',
        details: error.message,
      });
    }
  })
);

export default router;
