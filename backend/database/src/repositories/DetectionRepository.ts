import { query } from '../connection';
import type { HorseDetection, CreateDetectionRequest } from '@barnhand/shared';

export interface DetectionQueryOptions {
  streamId?: string;
  horseId?: string;
  startTime?: Date;
  endTime?: Date;
  limit?: number;
  offset?: number;
  includeMetrics?: boolean;
}

export class DetectionRepository {
  async findDetections(options: DetectionQueryOptions = {}): Promise<HorseDetection[]> {
    const {
      streamId,
      horseId,
      startTime,
      endTime,
      limit = 100,
      offset = 0,
      includeMetrics = true
    } = options;

    let sql = 'SELECT * FROM detections WHERE 1=1';
    const params: any[] = [];
    let paramIndex = 1;

    if (streamId) {
      sql += ` AND stream_id = $${paramIndex}`;
      params.push(streamId);
      paramIndex++;
    }

    if (horseId) {
      sql += ` AND horse_id = $${paramIndex}`;
      params.push(horseId);
      paramIndex++;
    }

    if (startTime) {
      sql += ` AND time >= $${paramIndex}`;
      params.push(startTime);
      paramIndex++;
    }

    if (endTime) {
      sql += ` AND time <= $${paramIndex}`;
      params.push(endTime);
      paramIndex++;
    }

    sql += ` ORDER BY time DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const result = await query(sql, params);
    return result.rows.map(this.mapRowToDetection);
  }

  async create(detection: CreateDetectionRequest): Promise<HorseDetection> {
    const sql = `
      INSERT INTO detections (
        time, stream_id, chunk_id, horse_id, tracking_id, bbox, 
        pose_keypoints, pose_angles, gait_type, velocity, acceleration,
        confidence, processing_time_ms, model_version, metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING *
    `;
    
    const params = [
      detection.time || new Date(),
      detection.stream_id,
      detection.chunk_id,
      detection.horse_id,
      detection.tracking_id,
      JSON.stringify(detection.bbox),
      JSON.stringify(detection.pose_keypoints),
      JSON.stringify(detection.pose_angles),
      detection.gait_type,
      detection.velocity,
      detection.acceleration,
      detection.confidence,
      detection.processing_time_ms,
      detection.model_version,
      JSON.stringify(detection.metadata || {})
    ];
    
    const result = await query(sql, params);
    return this.mapRowToDetection(result.rows[0]);
  }

  async bulkCreate(detections: CreateDetectionRequest[]): Promise<void> {
    if (detections.length === 0) return;

    const values = detections.map((detection, index) => {
      const baseIndex = index * 15;
      return `($${baseIndex + 1}, $${baseIndex + 2}, $${baseIndex + 3}, $${baseIndex + 4}, $${baseIndex + 5}, $${baseIndex + 6}, $${baseIndex + 7}, $${baseIndex + 8}, $${baseIndex + 9}, $${baseIndex + 10}, $${baseIndex + 11}, $${baseIndex + 12}, $${baseIndex + 13}, $${baseIndex + 14}, $${baseIndex + 15})`;
    }).join(', ');

    const sql = `
      INSERT INTO detections (
        time, stream_id, chunk_id, horse_id, tracking_id, bbox,
        pose_keypoints, pose_angles, gait_type, velocity, acceleration,
        confidence, processing_time_ms, model_version, metadata
      )
      VALUES ${values}
    `;

    const params = detections.flatMap(detection => [
      detection.time || new Date(),
      detection.stream_id,
      detection.chunk_id,
      detection.horse_id,
      detection.tracking_id,
      JSON.stringify(detection.bbox),
      JSON.stringify(detection.pose_keypoints),
      JSON.stringify(detection.pose_angles),
      detection.gait_type,
      detection.velocity,
      detection.acceleration,
      detection.confidence,
      detection.processing_time_ms,
      detection.model_version,
      JSON.stringify(detection.metadata || {})
    ]);

    await query(sql, params);
  }

  async getHorseTimeline(horseId: string, hours = 24): Promise<HorseDetection[]> {
    const sql = `
      SELECT * FROM detections 
      WHERE horse_id = $1 
        AND time >= CURRENT_TIMESTAMP - INTERVAL '${hours} hours'
      ORDER BY time ASC
    `;
    
    const result = await query(sql, [horseId]);
    return result.rows.map(this.mapRowToDetection);
  }

  async getStreamMetrics(streamId: string, hours = 24): Promise<any> {
    const sql = `
      SELECT 
        COUNT(*) as total_detections,
        COUNT(DISTINCT horse_id) as unique_horses,
        AVG(confidence) as avg_confidence,
        AVG(processing_time_ms) as avg_processing_time,
        MIN(time) as first_detection,
        MAX(time) as last_detection
      FROM detections 
      WHERE stream_id = $1 
        AND time >= CURRENT_TIMESTAMP - INTERVAL '${hours} hours'
    `;
    
    const result = await query(sql, [streamId]);
    return result.rows[0];
  }

  async getHourlyActivity(streamId: string, hours = 24): Promise<any[]> {
    const result = await query(
      `SELECT * FROM hourly_horse_activity 
       WHERE stream_id = $1 
         AND hour >= CURRENT_TIMESTAMP - INTERVAL '${hours} hours'
       ORDER BY hour DESC`,
      [streamId]
    );
    
    return result.rows;
  }

  private mapRowToDetection(row: any): HorseDetection {
    return {
      time: row.time,
      stream_id: row.stream_id,
      chunk_id: row.chunk_id,
      horse_id: row.horse_id,
      tracking_id: row.tracking_id,
      bbox: typeof row.bbox === 'string' ? JSON.parse(row.bbox) : row.bbox,
      pose_keypoints: typeof row.pose_keypoints === 'string' ? JSON.parse(row.pose_keypoints) : row.pose_keypoints,
      pose_angles: typeof row.pose_angles === 'string' ? JSON.parse(row.pose_angles) : row.pose_angles,
      gait_type: row.gait_type,
      velocity: row.velocity,
      acceleration: row.acceleration,
      confidence: row.confidence,
      processing_time_ms: row.processing_time_ms,
      model_version: row.model_version,
      metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata
    };
  }
}