import test from 'node:test';
import assert from 'node:assert/strict';
import { assertDatabaseName, productionConfigErrors } from '../src/config/validate-env.js';
import { shouldSeedDemoUsers } from '../src/db/seed-policy.js';
import { applyMigrations } from '../src/db/migrations.js';

const validProduction = {
  NODE_ENV: 'production',
  DB_PASSWORD: 'correct-horse-battery-staple',
  JWT_SECRET: 'a'.repeat(48),
  SMTP_HOST: 'smtp.example.com',
  SMTP_USER: 'service@example.com',
  SMTP_PASSWORD: 'smtp-secret'
};

test('production requires strong database and JWT secrets plus SMTP delivery', () => {
  assert.deepEqual(productionConfigErrors(validProduction), []);
  assert.deepEqual(productionConfigErrors({ NODE_ENV: 'production' }), [
    'DB_PASSWORD must be set and at least 16 characters long',
    'JWT_SECRET must be set and at least 32 characters long',
    'SMTP_HOST, SMTP_USER, and SMTP_PASSWORD are required'
  ]);
});

test('development and test environments retain local defaults', () => {
  assert.deepEqual(productionConfigErrors({ NODE_ENV: 'development' }), []);
  assert.deepEqual(productionConfigErrors({ NODE_ENV: 'test' }), []);
});

test('database names are safe SQL identifiers in every environment', () => {
  assert.doesNotThrow(() => assertDatabaseName('railway_term_learning_test'));
  assert.throws(() => assertDatabaseName('railway-term-learning'), /DB_NAME may contain only/);
  assert.throws(() => assertDatabaseName('`); DROP DATABASE app; --'), /DB_NAME may contain only/);
  assert.throws(() => assertDatabaseName('a'.repeat(65)), /DB_NAME may contain only/);
});

test('demo users are seeded only outside production', () => {
  assert.equal(shouldSeedDemoUsers(false), true);
  assert.equal(shouldSeedDemoUsers(true), false);
});

function createMigrationHarness({ lockAcquired = 1 } = {}) {
  const applied = [];
  let upCalls = 0;
  let released = false;
  const query = async (sql, params = {}) => {
    if (sql.startsWith('SELECT version, checksum')) return applied;
    if (sql.startsWith('INSERT INTO schema_migrations')) applied.push(params);
    return [];
  };
  const pool = {
    async getConnection() {
      return {
        async query(sql) {
          if (sql.includes('GET_LOCK')) return [[{ acquired: lockAcquired }]];
          if (sql.includes('RELEASE_LOCK')) released = true;
          return [[]];
        },
        release() {}
      };
    }
  };
  const migrations = [{
    version: '001_test', description: 'test migration', checksum: 'a'.repeat(64),
    async up() { upCalls += 1; }
  }];
  return { applied, get upCalls() { return upCalls; }, get released() { return released; }, query, pool, migrations };
}

test('schema migrations are recorded once and validated on repeat startup', async () => {
  const harness = createMigrationHarness();
  const options = { ...harness, lockName: 'railway-terms-test' };
  await applyMigrations(options);
  await applyMigrations(options);
  assert.equal(harness.upCalls, 1);
  assert.equal(harness.applied.length, 1);
  assert.equal(harness.released, true);
});

test('schema migration failures are not recorded and the advisory lock is released', async () => {
  const harness = createMigrationHarness();
  harness.migrations[0].up = async () => { throw new Error('DDL failed'); };
  await assert.rejects(applyMigrations({ ...harness, lockName: 'railway-terms-test' }), /DDL failed/);
  assert.equal(harness.applied.length, 0);
  assert.equal(harness.released, true);
});

test('schema migration checksum drift and lock timeout fail closed', async () => {
  const drift = createMigrationHarness();
  drift.applied.push({ version: '001_test', checksum: 'b'.repeat(64) });
  await assert.rejects(applyMigrations({ ...drift, lockName: 'railway-terms-test' }), /checksum mismatch/);

  const timeout = createMigrationHarness({ lockAcquired: 0 });
  await assert.rejects(applyMigrations({ ...timeout, lockName: 'railway-terms-test' }), /Timed out/);
  assert.equal(timeout.released, false);
});

test('schema migration runner rejects unknown versions and duplicate definitions', async () => {
  const unknown = createMigrationHarness();
  unknown.applied.push({ version: '999_future', checksum: 'c'.repeat(64) });
  await assert.rejects(applyMigrations({ ...unknown, lockName: 'railway-terms-test' }), /unknown migration/);

  const duplicate = createMigrationHarness();
  duplicate.migrations.push({ ...duplicate.migrations[0] });
  await assert.rejects(applyMigrations({ ...duplicate, lockName: 'railway-terms-test' }), /must be unique/);
});
