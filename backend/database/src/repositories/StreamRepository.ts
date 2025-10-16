import { query } from '../connection';
import type { Stream, StreamConfig, CreateStreamRequest } from '../types';

export class StreamRepository {
  async findAll(farmId?: string): Promise<Stream[]> {
    const sql = farmId 
      ? 'SELECT * FROM streams WHERE farm_id = $1 ORDER BY created_at DESC'
      : 'SELECT * FROM streams ORDER BY created_at DESC';
    
    const params = farmId ? [farmId] : [];
    const result = await query(sql, params);
    
    return result.rows.map(this.mapRowToStream);
  }

  async findById(id: string): Promise<Stream | null> {
    const result = await query('SELECT * FROM streams WHERE id = $1', [id]);

    return result.rows.length > 0 ? this.mapRowToStream(result.rows[0]) : null;
  }

  async findByFarmId(farmId: string): Promise<Stream[]> {
    return this.findAll(farmId);
  }

  async create(streamData: CreateStreamRequest): Promise<Stream> {
    const sql = `
      INSERT INTO streams (farm_id, name, source_type, source_url, processing_delay, chunk_duration, config)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;
    
    const params = [
      streamData.farm_id,
      streamData.name,
      streamData.source_type,
      streamData.source_url,
      streamData.processing_delay || 20,
      streamData.chunk_duration || 10,
      JSON.stringify(streamData.config || {})
    ];
    
    const result = await query(sql, params);
    return this.mapRowToStream(result.rows[0]);
  }

  async update(id: string, updates: Partial<Stream>): Promise<Stream | null> {
    const allowedFields = ['farm_id', 'name', 'source_type', 'source_url', 'status', 'processing_delay', 'chunk_duration', 'config'];
    const updateFields: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key) && value !== undefined) {
        updateFields.push(`${key} = $${paramIndex}`);
        params.push(key === 'config' ? JSON.stringify(value) : value);
        paramIndex++;
      }
    }

    if (updateFields.length === 0) {
      return this.findById(id);
    }

    updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
    params.push(id);

    const sql = `
      UPDATE streams
      SET ${updateFields.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await query(sql, params);

    return result.rows.length > 0 ? this.mapRowToStream(result.rows[0]) : null;
  }

  async updateStatus(id: string, status: string): Promise<void> {
    await query(
      'UPDATE streams SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [status, id]
    );
  }

  async updateHealthCheck(id: string): Promise<void> {
    await query(
      'UPDATE streams SET last_health_check = CURRENT_TIMESTAMP WHERE id = $1',
      [id]
    );
  }

  async delete(id: string): Promise<boolean> {
    const result = await query('DELETE FROM streams WHERE id = $1', [id]);
    return result.rowCount > 0;
  }

  async getActiveStreams(): Promise<Stream[]> {
    const result = await query(
      "SELECT * FROM streams WHERE status = 'active' ORDER BY created_at"
    );
    
    return result.rows.map(this.mapRowToStream);
  }

  private mapRowToStream(row: any): Stream {
    return {
      id: row.id,
      farm_id: row.farm_id,
      name: row.name,
      source_type: row.source_type,
      source_url: row.source_url,
      status: row.status,
      processing_delay: row.processing_delay,
      chunk_duration: row.chunk_duration,
      config: typeof row.config === 'string' ? JSON.parse(row.config) : row.config,
      health_check_url: row.health_check_url,
      last_health_check: row.last_health_check,
      created_at: row.created_at,
      updated_at: row.updated_at
    };
  }
}