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

// DELETE /api/v1/admin/chunks - Delete all recorded chunks
router.delete(
  '/chunks',
  createAuthenticatedRoute(async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      logger.warn('Admin cleanup: Deleting all chunks', {
        userId: req.user.userId,
        userEmail: req.user.email,
      });

      // Get all chunks
      const chunks = await videoChunkService.getAllChunks();

      let deletedCount = 0;
      let errorCount = 0;

      // Delete each chunk
      for (const chunk of chunks) {
        try {
          // Delete files and DB record
          await videoChunkService.deleteChunk(chunk.id, chunk.farm_id);
          deletedCount++;
        } catch (error) {
          logger.error(`Failed to delete chunk ${chunk.id}`, { error });
          errorCount++;
        }
      }

      logger.info('Admin cleanup: Chunks deleted', {
        deletedCount,
        errorCount,
        userId: req.user.userId,
      });

      return res.json({
        message: 'Chunk cleanup completed',
        deletedCount,
        errorCount,
        total: chunks.length,
      });
    } catch (error) {
      logger.error('Admin cleanup: Failed to delete chunks', { error });
      return res.status(500).json({ error: 'Failed to delete chunks' });
    }
  })
);

// DELETE /api/v1/admin/horses - Delete all detected horses
router.delete(
  '/horses',
  createAuthenticatedRoute(async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      logger.warn('Admin cleanup: Deleting all horses', {
        userId: req.user.userId,
        userEmail: req.user.email,
      });

      // Use database package if available
      let deletedCount = 0;

      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const db = require('@barnhand/database');
        const HorseRepository = db.HorseRepository;
        const horseRepo = new HorseRepository();

        // Get all horses
        const horses = await horseRepo.findAll();

        // Delete each horse
        for (const horse of horses) {
          await horseRepo.delete(horse.id);
          deletedCount++;
        }

        logger.info('Admin cleanup: Horses deleted', {
          deletedCount,
          userId: req.user.userId,
        });

        return res.json({
          message: 'Horse cleanup completed',
          deletedCount,
        });
      } catch (dbError) {
        logger.error('Database not available for horse cleanup', { dbError });
        return res.status(503).json({ error: 'Database not available' });
      }
    } catch (error) {
      logger.error('Admin cleanup: Failed to delete horses', { error });
      return res.status(500).json({ error: 'Failed to delete horses' });
    }
  })
);

export default router;
