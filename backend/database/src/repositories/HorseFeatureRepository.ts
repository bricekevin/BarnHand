import { query } from '../connection';

export interface HorseFeature {
  id: string;
  horse_id: string;
  stream_id: string;
  timestamp: Date;
  feature_vector: number[];
  confidence: number;
  bbox: any;
  image_snapshot?: Buffer;
  created_at: Date;
}

export interface CreateHorseFeatureRequest {
  horse_id: string;
  stream_id: string;
  timestamp?: Date;
  feature_vector: number[];
  confidence: number;
  bbox: any;
  image_snapshot?: Buffer;
}

export class HorseFeatureRepository {
  async create(feature: CreateHorseFeatureRequest): Promise<HorseFeature> {
    const sql = `
      INSERT INTO horse_features (horse_id, stream_id, timestamp, feature_vector, confidence, bbox, image_snapshot)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;
    
    const params = [
      feature.horse_id,
      feature.stream_id,
      feature.timestamp || new Date(),
      `[${feature.feature_vector.join(',')}]`, // Convert to PostgreSQL vector format
      feature.confidence,
      JSON.stringify(feature.bbox),
      feature.image_snapshot
    ];
    
    const result = await query(sql, params);
    return this.mapRowToFeature(result.rows[0]);
  }

  async findByHorseId(horseId: string, limit = 50): Promise<HorseFeature[]> {
    const result = await query(
      `SELECT * FROM horse_features 
       WHERE horse_id = $1 
       ORDER BY timestamp DESC 
       LIMIT $2`,
      [horseId, limit]
    );
    
    return result.rows.map(this.mapRowToFeature);
  }

  async findSimilarFeatures(
    queryVector: number[],
    threshold = 0.7,
    maxResults = 10,
    excludeHorseId?: string
  ): Promise<Array<{ feature: HorseFeature; similarity: number }>> {
    let sql = `
      SELECT hf.*, 
             1 - (hf.feature_vector <=> $1::vector) as similarity
      FROM horse_features hf
      WHERE 1 - (hf.feature_vector <=> $1::vector) >= $2
    `;
    
    const params: any[] = [`[${queryVector.join(',')}]`, threshold];
    
    if (excludeHorseId) {
      sql += ` AND hf.horse_id != $3`;
      params.push(excludeHorseId);
      sql += ` ORDER BY hf.feature_vector <=> $1::vector LIMIT $4`;
      params.push(maxResults);
    } else {
      sql += ` ORDER BY hf.feature_vector <=> $1::vector LIMIT $3`;
      params.push(maxResults);
    }
    
    const result = await query(sql, params);
    
    return result.rows.map((row: any) => ({
      feature: this.mapRowToFeature(row),
      similarity: row.similarity
    }));
  }

  async getAverageFeatureVector(horseId: string): Promise<number[] | null> {
    const result = await query(
      `SELECT AVG(feature_vector) as avg_vector
       FROM horse_features 
       WHERE horse_id = $1`,
      [horseId]
    );
    
    if (result.rows.length === 0 || !result.rows[0].avg_vector) {
      return null;
    }
    
    // Parse PostgreSQL vector format back to number array
    const vectorStr = result.rows[0].avg_vector;
    return this.parseVectorString(vectorStr);
  }

  async updateHorseMainFeatureVector(horseId: string): Promise<void> {
    // Update the main horses table with the averaged feature vector
    const sql = `
      UPDATE horses 
      SET feature_vector = (
        SELECT AVG(feature_vector)
        FROM horse_features 
        WHERE horse_id = $1
      ),
      updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
    `;
    
    await query(sql, [horseId]);
  }

  async cleanupOldFeatures(daysToKeep = 30): Promise<void> {
    const result = await query(
      `DELETE FROM horse_features 
       WHERE created_at < CURRENT_TIMESTAMP - INTERVAL '${daysToKeep} days'`,
      []
    );
    
    console.log(`🧹 Cleaned up ${result.rowCount} old horse features`);
  }

  async getBestFeatureForHorse(horseId: string): Promise<HorseFeature | null> {
    const result = await query(
      `SELECT * FROM horse_features 
       WHERE horse_id = $1 
       ORDER BY confidence DESC, timestamp DESC 
       LIMIT 1`,
      [horseId]
    );
    
    return result.rows.length > 0 ? this.mapRowToFeature(result.rows[0]) : null;
  }

  private mapRowToFeature(row: any): HorseFeature {
    return {
      id: row.id,
      horse_id: row.horse_id,
      stream_id: row.stream_id,
      timestamp: row.timestamp,
      feature_vector: this.parseVectorString(row.feature_vector),
      confidence: row.confidence,
      bbox: typeof row.bbox === 'string' ? JSON.parse(row.bbox) : row.bbox,
      image_snapshot: row.image_snapshot,
      created_at: row.created_at
    };
  }

  private parseVectorString(vectorStr: string): number[] {
    if (!vectorStr) return [];
    
    // Remove brackets and split by comma
    return vectorStr
      .replace(/^\[|\]$/g, '')
      .split(',')
      .map(val => parseFloat(val.trim()));
  }
}