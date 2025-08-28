import { query } from '../connection';
import type { Horse, CreateHorseRequest } from '@barnhand/shared';

export class HorseRepository {
  async findAll(farmId?: string): Promise<Horse[]> {
    const sql = farmId
      ? 'SELECT * FROM horses WHERE farm_id = $1 ORDER BY created_at DESC'
      : 'SELECT * FROM horses ORDER BY created_at DESC';
    
    const params = farmId ? [farmId] : [];
    const result = await query(sql, params);
    
    return result.rows.map(this.mapRowToHorse);
  }

  async findById(id: string): Promise<Horse | null> {
    const result = await query('SELECT * FROM horses WHERE id = $1', [id]);
    
    return result.rows.length > 0 ? this.mapRowToHorse(result.rows[0]) : null;
  }

  async findByTrackingId(trackingId: string): Promise<Horse | null> {
    const result = await query('SELECT * FROM horses WHERE tracking_id = $1', [trackingId]);
    
    return result.rows.length > 0 ? this.mapRowToHorse(result.rows[0]) : null;
  }

  async create(horseData: CreateHorseRequest): Promise<Horse> {
    const sql = `
      INSERT INTO horses (farm_id, name, breed, age, color, markings, gender, tracking_id, ui_color, metadata)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `;
    
    const params = [
      horseData.farm_id,
      horseData.name,
      horseData.breed,
      horseData.age,
      horseData.color,
      horseData.markings,
      horseData.gender,
      horseData.tracking_id,
      horseData.ui_color,
      JSON.stringify(horseData.metadata || {})
    ];
    
    const result = await query(sql, params);
    return this.mapRowToHorse(result.rows[0]);
  }

  async updateFeatureVector(id: string, featureVector: number[]): Promise<void> {
    await query(
      'UPDATE horses SET feature_vector = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [`[${featureVector.join(',')}]`, id]
    );
  }

  async updateLastSeen(id: string, timestamp?: Date): Promise<void> {
    const time = timestamp || new Date();
    await query(
      'UPDATE horses SET last_seen = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [time, id]
    );
  }

  async incrementDetectionCount(id: string): Promise<void> {
    await query(
      'UPDATE horses SET total_detections = total_detections + 1, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
      [id]
    );
  }

  async updateConfidenceScore(id: string, confidence: number): Promise<void> {
    await query(
      'UPDATE horses SET confidence_score = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [confidence, id]
    );
  }

  async findSimilarHorses(
    featureVector: number[],
    threshold = 0.7,
    maxResults = 10
  ): Promise<Array<{ horse: Horse; similarity: number }>> {
    const sql = `
      SELECT h.*, similarity
      FROM find_similar_horses($1::vector, $2, $3) fs
      JOIN horses h ON h.id = fs.horse_id
      ORDER BY similarity DESC
    `;
    
    const params = [`[${featureVector.join(',')}]`, threshold, maxResults];
    const result = await query(sql, params);
    
    return result.rows.map((row: any) => ({
      horse: this.mapRowToHorse(row),
      similarity: row.similarity
    }));
  }

  async getHorseStatistics(id: string): Promise<any> {
    const result = await query('SELECT * FROM horse_statistics WHERE id = $1', [id]);
    
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  async getActiveHorses(farmId?: string): Promise<Horse[]> {
    const sql = farmId
      ? "SELECT * FROM horses WHERE activity_status = 'active' AND farm_id = $1"
      : "SELECT * FROM horses WHERE activity_status = 'active'";
    
    const params = farmId ? [farmId] : [];
    const result = await query(sql, params);
    
    return result.rows.map(this.mapRowToHorse);
  }

  async delete(id: string): Promise<boolean> {
    const result = await query('DELETE FROM horses WHERE id = $1', [id]);
    return result.rowCount > 0;
  }

  private mapRowToHorse(row: any): Horse {
    return {
      id: row.id,
      farm_id: row.farm_id,
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
      first_detected: row.first_detected,
      last_seen: row.last_seen,
      total_detections: row.total_detections,
      confidence_score: row.confidence_score,
      metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata,
      created_at: row.created_at,
      updated_at: row.updated_at
    };
  }
}