import { Pool, PoolClient } from 'pg';
// Simple config validation for database layer
const config = {
  DATABASE_URL: process.env.DATABASE_URL || 'postgresql://admin:password@localhost:5432/barnhand',
  NODE_ENV: process.env.NODE_ENV || 'development'
};


export const pool = new Pool({
  connectionString: config.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

export async function getConnection(): Promise<PoolClient> {
  return await pool.connect();
}

export async function query(text: string, params?: unknown[]): Promise<any> {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  
  if (config.NODE_ENV === 'development') {
    console.log('Query executed', { text, duration, rows: res.rowCount });
  }
  
  return res;
}

export async function closePool(): Promise<void> {
  await pool.end();
}

export default pool;