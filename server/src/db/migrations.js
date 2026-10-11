import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const baselinePath = new URL('./postgres/schema.sql', import.meta.url);
const migrationsPath = fileURLToPath(new URL('./postgres/migrations/', import.meta.url));

async function loadMigrations() {
  const migrations = [{
    version: '001_initial_schema',
    description: 'Initial PostgreSQL schema',
    source: await readFile(baselinePath, 'utf8')
  }];
  const files = (await readdir(migrationsPath)).filter((file) => /^\d{3}_[a-z0-9_]+\.sql$/i.test(file)).sort();
  for (const file of files) {
    migrations.push({
      version: basename(file, '.sql'),
      description: basename(file, '.sql').replace(/^\d{3}_/, '').replaceAll('_', ' '),
      source: await readFile(join(migrationsPath, file), 'utf8')
    });
  }
  return migrations;
}

export async function applyMigrations({ pool, database }) {
  const connection = await pool.connect();
  let locked = false;
  try {
    const lock = await connection.query(
      "SELECT pg_try_advisory_lock(hashtext('railway-term-learning'), hashtext($1)) AS acquired",
      [database]
    );
    if (!lock.rows[0]?.acquired) throw new Error('Timed out waiting for the PostgreSQL migration lock');
    locked = true;

    await connection.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      version VARCHAR(64) PRIMARY KEY,
      description VARCHAR(255) NOT NULL,
      checksum CHAR(64) NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);

    const applied = await connection.query('SELECT version, checksum FROM schema_migrations');
    const migrations = await loadMigrations();
    const knownVersions = new Set(migrations.map((migration) => migration.version));
    const unknownVersion = applied.rows.find((row) => !knownVersions.has(row.version));
    if (unknownVersion) throw new Error(`Database contains unknown migration ${unknownVersion.version}`);
    for (const migration of migrations) {
      const checksum = createHash('sha256').update(migration.source).digest('hex');
      const existing = applied.rows.find((row) => row.version === migration.version);
      if (existing && existing.checksum !== checksum) throw new Error(`Migration checksum mismatch for ${migration.version}`);
      if (existing) continue;
      await connection.query('BEGIN');
      try {
        await connection.query(migration.source);
        await connection.query(
          'INSERT INTO schema_migrations (version, description, checksum) VALUES ($1, $2, $3)',
          [migration.version, migration.description, checksum]
        );
        await connection.query('COMMIT');
      } catch (error) {
        await connection.query('ROLLBACK').catch(() => {});
        throw error;
      }
    }
  } finally {
    try {
      if (locked) await connection.query("SELECT pg_advisory_unlock(hashtext('railway-term-learning'), hashtext($1))", [database]);
    } finally {
      connection.release();
    }
  }
}
