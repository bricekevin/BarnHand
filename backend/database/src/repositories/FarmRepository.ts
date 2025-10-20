import { query } from '../connection';
import type { Farm } from '../types';

export class FarmRepository {
  async findAll(): Promise<Farm[]> {
    const sql = 'SELECT * FROM farms ORDER BY name ASC';
    const result = await query(sql);

    return result.rows.map(this.mapRowToFarm);
  }

  async findById(id: string): Promise<Farm | null> {
    const result = await query('SELECT * FROM farms WHERE id = $1', [id]);

    return result.rows.length > 0 ? this.mapRowToFarm(result.rows[0]) : null;
  }

  async findByOwnerId(ownerId: string): Promise<Farm[]> {
    const sql = 'SELECT * FROM farms WHERE owner_id = $1 ORDER BY name ASC';
    const result = await query(sql, [ownerId]);

    return result.rows.map(this.mapRowToFarm);
  }

  async create(farmData: {
    name: string;
    owner_id: string;
    location?: any;
    timezone?: string;
    expected_horse_count?: number;
    metadata?: Record<string, any>;
  }): Promise<Farm> {
    const sql = `
      INSERT INTO farms (name, owner_id, location, timezone, expected_horse_count, metadata)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;

    const params = [
      farmData.name,
      farmData.owner_id,
      farmData.location ? JSON.stringify(farmData.location) : null,
      farmData.timezone || 'UTC',
      farmData.expected_horse_count || 0,
      JSON.stringify(farmData.metadata || {})
    ];

    const result = await query(sql, params);
    return this.mapRowToFarm(result.rows[0]);
  }

  async update(id: string, updates: Partial<Farm>): Promise<Farm | null> {
    const allowedFields = ['name', 'owner_id', 'location', 'timezone', 'expected_horse_count', 'metadata'];
    const updateFields: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key) && value !== undefined) {
        updateFields.push(`${key} = $${paramIndex}`);
        if (key === 'location' || key === 'metadata') {
          params.push(JSON.stringify(value));
        } else {
          params.push(value);
        }
        paramIndex++;
      }
    }

    if (updateFields.length === 0) {
      return this.findById(id);
    }

    updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
    params.push(id);

    const sql = `
      UPDATE farms
      SET ${updateFields.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await query(sql, params);

    return result.rows.length > 0 ? this.mapRowToFarm(result.rows[0]) : null;
  }

  async delete(id: string): Promise<boolean> {
    const result = await query('DELETE FROM farms WHERE id = $1', [id]);
    return result.rowCount > 0;
  }

  private mapRowToFarm(row: any): Farm {
    return {
      id: row.id,
      name: row.name,
      owner_id: row.owner_id,
      location: typeof row.location === 'string' ? JSON.parse(row.location) : row.location,
      timezone: row.timezone || 'UTC',
      expected_horse_count: row.expected_horse_count || 0,
      metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata,
      created_at: row.created_at,
      updated_at: row.updated_at
    };
  }
}
