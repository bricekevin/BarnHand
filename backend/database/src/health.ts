import { pool } from './connection';

export interface HealthStatus {
  database: {
    connected: boolean;
    activeConnections: number;
    totalConnections: number;
    errors?: string;
  };
  timescaledb: {
    available: boolean;
    version?: string;
    errors?: string;
  };
  pgvector: {
    available: boolean;
    version?: string;
    errors?: string;
  };
}

export async function checkDatabaseHealth(): Promise<HealthStatus> {
  const status: HealthStatus = {
    database: { connected: false, activeConnections: 0, totalConnections: 0 },
    timescaledb: { available: false },
    pgvector: { available: false }
  };

  try {
    // Check basic connection
    await pool.query('SELECT NOW() as current_time');
    status.database.connected = true;
    
    // Get connection stats
    const statsResult = await pool.query(`
      SELECT 
        state,
        COUNT(*) as count
      FROM pg_stat_activity 
      WHERE datname = current_database()
      GROUP BY state
    `);
    
    statsResult.rows.forEach(row => {
      if (row.state === 'active') {
        status.database.activeConnections = parseInt(row.count);
      }
      status.database.totalConnections += parseInt(row.count);
    });

  } catch (error) {
    status.database.errors = error instanceof Error ? error.message : 'Unknown database error';
  }

  try {
    // Check TimescaleDB extension
    const timescaleResult = await pool.query(`
      SELECT extversion 
      FROM pg_extension 
      WHERE extname = 'timescaledb'
    `);
    
    if (timescaleResult.rows.length > 0) {
      status.timescaledb.available = true;
      status.timescaledb.version = timescaleResult.rows[0].extversion;
    }
  } catch (error) {
    status.timescaledb.errors = error instanceof Error ? error.message : 'TimescaleDB not available';
  }

  try {
    // Check pgvector extension
    const vectorResult = await pool.query(`
      SELECT extversion 
      FROM pg_extension 
      WHERE extname = 'vector'
    `);
    
    if (vectorResult.rows.length > 0) {
      status.pgvector.available = true;
      status.pgvector.version = vectorResult.rows[0].extversion;
    }
  } catch (error) {
    status.pgvector.errors = error instanceof Error ? error.message : 'pgvector not available';
  }

  return status;
}

export async function waitForDatabase(timeoutMs = 30000): Promise<void> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeoutMs) {
    try {
      const health = await checkDatabaseHealth();
      
      if (health.database.connected && health.timescaledb.available && health.pgvector.available) {
        console.log('✅ Database health check passed');
        return;
      }
      
      console.log('⏳ Waiting for database to be ready...');
      await new Promise(resolve => setTimeout(resolve, 2000));
      
    } catch (error) {
      console.log('⏳ Database not ready, retrying...');
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  throw new Error(`Database not ready after ${timeoutMs}ms timeout`);
}