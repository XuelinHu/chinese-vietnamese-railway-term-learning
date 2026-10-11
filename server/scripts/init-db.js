import { initializeDatabase } from '../src/db/init.js';
import { closePool } from '../src/db/pool.js';

try {
  await initializeDatabase();
  console.log('[db] initialization completed');
} catch (error) {
  console.error(`[db] initialization failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  await closePool();
}
