import fs from 'fs';
import path from 'path';
import { query, getConnection } from '../connection';

interface Migration {
  id: string;
  filename: string;
  sql: string;
  checksum: string;
}

class MigrationRunner {
  private migrationsPath: string;

  constructor(migrationsPath = './sql') {
    this.migrationsPath = path.resolve(__dirname, migrationsPath);
  }

  async initMigrationsTable(): Promise<void> {
    const sql = `
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id SERIAL PRIMARY KEY,
        migration_id VARCHAR(255) UNIQUE NOT NULL,
        filename VARCHAR(255) NOT NULL,
        checksum VARCHAR(255) NOT NULL,
        executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;
    
    await query(sql);
  }

  async getExecutedMigrations(): Promise<Set<string>> {
    const result = await query(
      'SELECT migration_id FROM schema_migrations ORDER BY executed_at'
    );
    
    return new Set(result.rows.map((row: any) => row.migration_id));
  }

  async getPendingMigrations(): Promise<Migration[]> {
    const executed = await this.getExecutedMigrations();
    const allMigrations = this.loadMigrations();
    
    return allMigrations.filter(migration => !executed.has(migration.id));
  }

  loadMigrations(): Migration[] {
    if (!fs.existsSync(this.migrationsPath)) {
      console.log('No migrations directory found:', this.migrationsPath);
      return [];
    }

    const files = fs.readdirSync(this.migrationsPath)
      .filter(file => file.endsWith('.sql'))
      .sort();

    return files.map(filename => {
      const filepath = path.join(this.migrationsPath, filename);
      const sql = fs.readFileSync(filepath, 'utf-8');
      const id = filename.replace('.sql', '');
      const checksum = this.calculateChecksum(sql);

      return { id, filename, sql, checksum };
    });
  }

  calculateChecksum(content: string): string {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  async executeMigration(migration: Migration): Promise<void> {
    const client = await getConnection();
    
    try {
      await client.query('BEGIN');
      
      // Execute migration SQL
      await client.query(migration.sql);
      
      // Record migration as executed
      await client.query(
        `INSERT INTO schema_migrations (migration_id, filename, checksum) 
         VALUES ($1, $2, $3)`,
        [migration.id, migration.filename, migration.checksum]
      );
      
      await client.query('COMMIT');
      
      console.log(`✓ Executed migration: ${migration.filename}`);
      
    } catch (error) {
      await client.query('ROLLBACK');
      console.error(`✗ Failed migration: ${migration.filename}`, error);
      throw error;
    } finally {
      client.release();
    }
  }

  async runMigrations(): Promise<void> {
    console.log('🔧 Starting database migrations...');
    
    await this.initMigrationsTable();
    const pending = await this.getPendingMigrations();
    
    if (pending.length === 0) {
      console.log('✅ No pending migrations');
      return;
    }
    
    console.log(`📋 Found ${pending.length} pending migrations`);
    
    for (const migration of pending) {
      await this.executeMigration(migration);
    }
    
    console.log('✅ All migrations completed');
  }

  async status(): Promise<void> {
    await this.initMigrationsTable();
    
    const executed = await this.getExecutedMigrations();
    const all = this.loadMigrations();
    const pending = all.filter(m => !executed.has(m.id));
    
    console.log('\n📊 Migration Status:');
    console.log(`   Executed: ${executed.size}`);
    console.log(`   Pending:  ${pending.length}`);
    console.log(`   Total:    ${all.length}\n`);
    
    if (pending.length > 0) {
      console.log('⏳ Pending migrations:');
      pending.forEach(m => console.log(`   - ${m.filename}`));
    }
  }
}

// CLI interface
if (require.main === module) {
  const command = process.argv[2] || 'status';
  const runner = new MigrationRunner();
  
  (async () => {
    try {
      switch (command) {
        case 'run':
        case 'migrate':
          await runner.runMigrations();
          break;
        case 'status':
          await runner.status();
          break;
        default:
          console.log('Usage: npm run migrate [run|status]');
          process.exit(1);
      }
      process.exit(0);
    } catch (error) {
      console.error('Migration failed:', error);
      process.exit(1);
    }
  })();
}

export default MigrationRunner;