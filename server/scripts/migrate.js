import { env } from '../src/config/env.js';
import { applyMigrations } from '../src/db/migrations.js';
import { closePool, getPool } from '../src/db/pool.js';

try {
  await applyMigrations({ pool: getPool(), database: env.db.database });
  console.log('PostgreSQL migrations are up to date.');
} catch (error) {
  console.error(`Database migration failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  await closePool();
}
