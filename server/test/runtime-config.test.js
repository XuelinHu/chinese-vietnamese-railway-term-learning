import test from 'node:test';
import assert from 'node:assert/strict';
import { assertDatabaseName, productionConfigErrors } from '../src/config/validate-env.js';
import { shouldSeedDemoUsers } from '../src/db/seed-policy.js';
import { bindNamedParameters } from '../src/db/pool.js';

const validProduction = {
  NODE_ENV: 'production',
  PGPASSWORD: 'correct-horse-battery-staple',
  JWT_SECRET: 'a'.repeat(48),
  SMTP_HOST: 'smtp.example.com',
  SMTP_USER: 'service@example.com',
  SMTP_PASSWORD: 'smtp-secret'
};

test('production requires PostgreSQL and JWT secrets plus SMTP delivery', () => {
  assert.deepEqual(productionConfigErrors(validProduction), []);
  assert.deepEqual(productionConfigErrors({ NODE_ENV: 'production' }), [
    'PGPASSWORD must be set and at least 16 characters long',
    'JWT_SECRET must be set and at least 32 characters long',
    'SMTP_HOST, SMTP_USER, and SMTP_PASSWORD are required'
  ]);
});

test('database names are valid PostgreSQL identifiers', () => {
  assert.equal(assertDatabaseName('railway_term_learning_test'), 'railway_term_learning_test');
  assert.throws(() => assertDatabaseName('railway-term-learning'), /PGDATABASE/);
  assert.throws(() => assertDatabaseName('`); DROP DATABASE app; --'), /PGDATABASE/);
  assert.throws(() => assertDatabaseName('a'.repeat(64)), /PGDATABASE/);
});

test('weak demo accounts require an explicit isolated test database opt-in', () => {
  assert.equal(shouldSeedDemoUsers(false, 'railway_term_learning_test', '1'), true);
  assert.equal(shouldSeedDemoUsers(false, 'railway_term_learning', '1'), false);
  assert.equal(shouldSeedDemoUsers(false, 'railway_term_learning_test', '0'), false);
  assert.equal(shouldSeedDemoUsers(true, 'railway_term_learning_test', '1'), false);
});

test('named PostgreSQL parameters bind repeated names once and ignore quoted text', () => {
  const query = bindNamedParameters("SELECT :id, ':ignored', :id -- :comment\nWHERE name = :name", { id: 7, name: 'test' });
  assert.equal(query.text, "SELECT $1, ':ignored', $1 -- :comment\nWHERE name = $2");
  assert.deepEqual(query.values, [7, 'test']);
  assert.throws(() => bindNamedParameters('SELECT :missing', {}), /Missing SQL parameter/);
});
