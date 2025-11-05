import { query } from '../connection';
import type { DetectionCorrection, CreateCorrectionRequest, CorrectionStatus } from '../types';

/**
 * Repository for detection_corrections table
 * Manages CRUD operations for manual detection corrections
 */
export class CorrectionRepository {
  /**
   * Create a new detection correction
   */
  async create(correction: CreateCorrectionRequest): Promise<DetectionCorrection> {
    const sql = `
      INSERT INTO detection_corrections (
        chunk_id,
        detection_index,
        frame_index,
        correction_type,
        original_horse_id,
        corrected_horse_id,
        corrected_horse_name,
        user_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `;

    const params = [
      correction.chunk_id,
      correction.detection_index,
      correction.frame_index,
      correction.correction_type,
      correction.original_horse_id || null,
      correction.corrected_horse_id || null,
      correction.corrected_horse_name || null,
      correction.user_id || null,
    ];

    const result = await query(sql, params);
    return this.mapRowToCorrection(result.rows[0]);
  }

  /**
   * Find all corrections for a specific chunk
   */
  async findByChunkId(chunkId: string): Promise<DetectionCorrection[]> {
    const sql = `
      SELECT * FROM detection_corrections
      WHERE chunk_id = $1
      ORDER BY created_at ASC
    `;

    const result = await query(sql, [chunkId]);
    return result.rows.map(this.mapRowToCorrection);
  }

  /**
   * Find corrections by chunk ID and status
   */
  async findByChunkIdAndStatus(
    chunkId: string,
    status: CorrectionStatus
  ): Promise<DetectionCorrection[]> {
    const sql = `
      SELECT * FROM detection_corrections
      WHERE chunk_id = $1 AND status = $2
      ORDER BY created_at ASC
    `;

    const result = await query(sql, [chunkId, status]);
    return result.rows.map(this.mapRowToCorrection);
  }

  /**
   * Find a single correction by ID
   */
  async findById(id: string): Promise<DetectionCorrection | null> {
    const sql = `
      SELECT * FROM detection_corrections
      WHERE id = $1
    `;

    const result = await query(sql, [id]);
    return result.rows.length > 0 ? this.mapRowToCorrection(result.rows[0]) : null;
  }

  /**
   * Update correction status
   */
  async updateStatus(
    id: string,
    status: CorrectionStatus,
    errorMessage?: string
  ): Promise<void> {
    const sql = `
      UPDATE detection_corrections
      SET status = $1, error_message = $2
      WHERE id = $3
    `;

    await query(sql, [status, errorMessage || null, id]);
  }

  /**
   * Mark correction as applied (with applied_at timestamp)
   */
  async markApplied(id: string): Promise<void> {
    const sql = `
      UPDATE detection_corrections
      SET status = 'applied', applied_at = NOW()
      WHERE id = $1
    `;

    await query(sql, [id]);
  }

  /**
   * Mark multiple corrections as applied (batch operation)
   */
  async markManyApplied(ids: string[]): Promise<void> {
    if (ids.length === 0) return;

    const sql = `
      UPDATE detection_corrections
      SET status = 'applied', applied_at = NOW()
      WHERE id = ANY($1::uuid[])
    `;

    await query(sql, [ids]);
  }

  /**
   * Delete all pending corrections for a chunk
   * Returns the number of deleted corrections
   */
  async deletePending(chunkId: string): Promise<number> {
    const sql = `
      DELETE FROM detection_corrections
      WHERE chunk_id = $1 AND status = 'pending'
    `;

    const result = await query(sql, [chunkId]);
    return result.rowCount || 0;
  }

  /**
   * Delete a specific correction by ID
   * Only allows deleting pending corrections
   */
  async deleteById(id: string): Promise<boolean> {
    const sql = `
      DELETE FROM detection_corrections
      WHERE id = $1 AND status = 'pending'
    `;

    const result = await query(sql, [id]);
    return (result.rowCount || 0) > 0;
  }

  /**
   * Count corrections by chunk ID
   */
  async countByChunkId(chunkId: string): Promise<number> {
    const sql = `
      SELECT COUNT(*) as count
      FROM detection_corrections
      WHERE chunk_id = $1
    `;

    const result = await query(sql, [chunkId]);
    return parseInt(result.rows[0].count, 10);
  }

  /**
   * Count pending corrections by chunk ID
   */
  async countPendingByChunkId(chunkId: string): Promise<number> {
    const sql = `
      SELECT COUNT(*) as count
      FROM detection_corrections
      WHERE chunk_id = $1 AND status = 'pending'
    `;

    const result = await query(sql, [chunkId]);
    return parseInt(result.rows[0].count, 10);
  }

  /**
   * Get recent corrections by user
   */
  async findRecentByUser(userId: string, limit = 50): Promise<DetectionCorrection[]> {
    const sql = `
      SELECT * FROM detection_corrections
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT $2
    `;

    const result = await query(sql, [userId, limit]);
    return result.rows.map(this.mapRowToCorrection);
  }

  /**
   * Get correction statistics for a user
   */
  async getUserStats(userId: string): Promise<{
    total: number;
    applied: number;
    pending: number;
    failed: number;
  }> {
    const sql = `
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'applied') as applied,
        COUNT(*) FILTER (WHERE status = 'pending') as pending,
        COUNT(*) FILTER (WHERE status = 'failed') as failed
      FROM detection_corrections
      WHERE user_id = $1
    `;

    const result = await query(sql, [userId]);
    const row = result.rows[0];

    return {
      total: parseInt(row.total, 10),
      applied: parseInt(row.applied, 10),
      pending: parseInt(row.pending, 10),
      failed: parseInt(row.failed, 10),
    };
  }

  /**
   * Map database row to DetectionCorrection type
   */
  private mapRowToCorrection(row: any): DetectionCorrection {
    return {
      id: row.id,
      chunk_id: row.chunk_id,
      detection_index: row.detection_index,
      frame_index: row.frame_index,
      correction_type: row.correction_type,
      original_horse_id: row.original_horse_id,
      corrected_horse_id: row.corrected_horse_id,
      corrected_horse_name: row.corrected_horse_name,
      user_id: row.user_id,
      created_at: row.created_at,
      applied_at: row.applied_at,
      status: row.status,
      error_message: row.error_message,
    };
  }
}
