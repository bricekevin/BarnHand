import { query } from '../connection';
import type { Horse, CreateHorseRequest } from '../types';

export class HorseRepository {
  async findAll(farmId?: string): Promise<Horse[]> {
    // Filter out soft-deleted horses (status='deleted')
    const sql = farmId
      ? "SELECT * FROM horses WHERE farm_id = $1 AND status != 'deleted' ORDER BY last_seen DESC"
      : "SELECT * FROM horses WHERE status != 'deleted' ORDER BY last_seen DESC";

    const params = farmId ? [farmId] : [];
    const result = await query(sql, params);

    return result.rows.map(this.mapRowToHorse);
  }

  async findById(id: string): Promise<Horse | null> {
    // Filter out soft-deleted horses
    const result = await query("SELECT * FROM horses WHERE id = $1 AND status != 'deleted'", [id]);

    return result.rows.length > 0 ? this.mapRowToHorse(result.rows[0]) : null;
  }

  async findByTrackingId(trackingId: string): Promise<Horse | null> {
    // Filter out soft-deleted horses
    const result = await query("SELECT * FROM horses WHERE tracking_id = $1 AND status != 'deleted'", [
      trackingId,
    ]);

    return result.rows.length > 0 ? this.mapRowToHorse(result.rows[0]) : null;
  }

  async findByStreamId(streamId: string): Promise<Horse[]> {
    const sql = `
      SELECT
        h.*,
        s.name as stream_name,
        f.name as farm_name
      FROM horses h
      LEFT JOIN streams s ON h.stream_id = s.id
      LEFT JOIN farms f ON h.farm_id = f.id
      WHERE h.stream_id = $1
      ORDER BY h.last_seen DESC
    `;
    const result = await query(sql, [streamId]);

    return result.rows.map(this.mapRowToHorse);
  }

  async create(horseData: CreateHorseRequest): Promise<Horse> {
    const sql = `
      INSERT INTO horses (farm_id, stream_id, name, breed, age, color, markings, gender, tracking_id, ui_color, avatar_thumbnail, metadata)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *
    `;

    const params = [
      horseData.farm_id,
      horseData.stream_id || null,
      horseData.name || null,
      horseData.breed || null,
      horseData.age || null,
      horseData.color || null,
      horseData.markings || null,
      horseData.gender || null,
      horseData.tracking_id || null,
      horseData.ui_color || null,
      horseData.avatar_thumbnail || null,
      JSON.stringify(horseData.metadata || {}),
    ];

    const result = await query(sql, params);
    return this.mapRowToHorse(result.rows[0]);
  }

  async updateFeatureVector(
    id: string,
    featureVector: number[]
  ): Promise<void> {
    await query(
      'UPDATE horses SET feature_vector = $1 WHERE id = $2',
      [`[${featureVector.join(',')}]`, id]
    );
  }

  async updateLastSeen(id: string, timestamp?: Date): Promise<void> {
    const time = timestamp || new Date();
    await query(
      'UPDATE horses SET last_seen = $1 WHERE id = $2',
      [time, id]
    );
  }

  async incrementDetectionCount(id: string): Promise<void> {
    await query(
      'UPDATE horses SET total_detections = total_detections + 1 WHERE id = $1',
      [id]
    );
  }

  async updateConfidenceScore(id: string, confidence: number): Promise<void> {
    await query(
      'UPDATE horses SET confidence_score = $1 WHERE id = $2',
      [confidence, id]
    );
  }

  async updateAvatar(horseId: string, avatarData: Buffer): Promise<void> {
    await query(
      'UPDATE horses SET avatar_thumbnail = $1 WHERE id = $2',
      [avatarData, horseId]
    );
  }

  async updateHorseDetails(
    horseId: string,
    updates: Partial<Horse>
  ): Promise<Horse> {
    const allowedFields = [
      'name',
      'breed',
      'age',
      'color',
      'markings',
      'gender',
      'metadata',
    ];
    const updateFields: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key) && value !== undefined) {
        updateFields.push(`${key} = $${paramIndex}`);
        params.push(key === 'metadata' ? JSON.stringify(value) : value);
        paramIndex++;
      }
    }

    if (updateFields.length === 0) {
      const horse = await this.findById(horseId);
      if (!horse) {
        throw new Error(`Horse with id ${horseId} not found`);
      }
      return horse;
    }

    // Note: updated_at is auto-updated by database trigger if column exists
    params.push(horseId);

    const sql = `
      UPDATE horses
      SET ${updateFields.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await query(sql, params);

    if (result.rows.length === 0) {
      throw new Error(`Horse with id ${horseId} not found`);
    }

    return this.mapRowToHorse(result.rows[0]);
  }

  async findSimilarHorses(
    featureVector: number[],
    threshold = 0.7,
    maxResults = 10,
    streamId?: string,
    farmId?: string
  ): Promise<Array<{ horse: Horse; similarity: number }>> {
    const sql = `
      SELECT h.*, s.name as stream_name, f.name as farm_name, fs.similarity
      FROM find_similar_horses($1::vector, $2, $3, $4::uuid, $5::uuid) fs
      JOIN horses h ON h.id = fs.horse_id
      LEFT JOIN streams s ON h.stream_id = s.id
      LEFT JOIN farms f ON h.farm_id = f.id
      ORDER BY fs.similarity DESC
    `;

    const params = [
      `[${featureVector.join(',')}]`,
      threshold,
      maxResults,
      streamId || null,
      farmId || null,
    ];
    const result = await query(sql, params);

    return result.rows.map((row: any) => ({
      horse: this.mapRowToHorse(row),
      similarity: row.similarity,
    }));
  }

  async getHorseStatistics(id: string): Promise<any> {
    const result = await query('SELECT * FROM horse_statistics WHERE id = $1', [
      id,
    ]);

    return result.rows.length > 0 ? result.rows[0] : null;
  }

  async getActiveHorses(farmId?: string): Promise<Horse[]> {
    // Filter out soft-deleted horses
    const sql = farmId
      ? "SELECT * FROM horses WHERE activity_status = 'active' AND status != 'deleted' AND farm_id = $1"
      : "SELECT * FROM horses WHERE activity_status = 'active' AND status != 'deleted'";

    const params = farmId ? [farmId] : [];
    const result = await query(sql, params);

    return result.rows.map(this.mapRowToHorse);
  }

  async countOfficialHorses(farmId: string): Promise<number> {
    // Filter out soft-deleted horses
    const result = await query(
      "SELECT COUNT(*) FROM horses WHERE farm_id = $1 AND is_official = TRUE AND status != 'deleted'",
      [farmId]
    );

    return parseInt(result.rows[0].count, 10);
  }

  async update(id: string, updates: Partial<Horse>): Promise<Horse | null> {
    const allowedFields = [
      'farm_id',
      'stream_id',
      'name',
      'breed',
      'age',
      'color',
      'markings',
      'gender',
      'ui_color',
      'metadata',
      'is_official',
      'made_official_at',
      'made_official_by',
    ];
    const updateFields: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key) && value !== undefined) {
        updateFields.push(`${key} = $${paramIndex}`);
        params.push(key === 'metadata' ? JSON.stringify(value) : value);
        paramIndex++;
      }
    }

    if (updateFields.length === 0) {
      return this.findById(id);
    }

    // Note: updated_at is auto-updated by database trigger if column exists
    params.push(id);

    const sql = `
      UPDATE horses
      SET ${updateFields.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await query(sql, params);

    return result.rows.length > 0 ? this.mapRowToHorse(result.rows[0]) : null;
  }

  async delete(id: string): Promise<boolean> {
    // Soft delete: Set status to 'deleted' instead of removing the row
    // This preserves historical data and prevents re-identification
    const result = await query(
      "UPDATE horses SET status = 'deleted', updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND status != 'deleted'",
      [id]
    );
    return result.rowCount > 0;
  }

  async getTrackingInfo(id: string): Promise<{ tracking_id: string | null; stream_id: string | null } | null> {
    // Get tracking_id and stream_id for Redis cleanup
    const result = await query(
      'SELECT tracking_id, stream_id FROM horses WHERE id = $1',
      [id]
    );
    return result.rows.length > 0
      ? { tracking_id: result.rows[0].tracking_id, stream_id: result.rows[0].stream_id }
      : null;
  }

  async hardDelete(id: string): Promise<boolean> {
    // Hard delete for complete removal (use sparingly)
    const result = await query('DELETE FROM horses WHERE id = $1', [id]);
    return result.rowCount > 0;
  }

  private mapRowToHorse(row: any): Horse {
    return {
      id: row.id,
      farm_id: row.farm_id,
      stream_id: row.stream_id,
      name: row.name,
      breed: row.breed,
      age: row.age,
      color: row.color,
      markings: row.markings,
      gender: row.gender,
      tracking_id: row.tracking_id,
      ui_color: row.ui_color,
      feature_vector: row.feature_vector,
      thumbnail_url: row.thumbnail_url,
      avatar_thumbnail: row.avatar_thumbnail
        ? row.avatar_thumbnail.toString('base64')
        : undefined,
      first_detected: row.first_detected,
      last_seen: row.last_seen,
      total_detections: row.total_detections,
      confidence_score: row.confidence_score,
      metadata:
        typeof row.metadata === 'string'
          ? JSON.parse(row.metadata)
          : row.metadata,
      created_at: row.created_at,
      updated_at: row.updated_at,
      // Include stream and farm names when available (from JOINs)
      stream_name: row.stream_name,
      farm_name: row.farm_name,
      // Official horse fields
      is_official: row.is_official,
      made_official_at: row.made_official_at,
      made_official_by: row.made_official_by,
    };
  }
}
