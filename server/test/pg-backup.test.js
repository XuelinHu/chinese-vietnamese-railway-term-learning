import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  assertDatabaseName,
  assertSafeRestoreTarget,
  decryptFile,
  encryptFile,
  parseEncryptionKey
} from '../scripts/pg-backup.mjs';

const key = Buffer.alloc(32, 11);

test('backup key, PostgreSQL names, and isolated restore target are validated', () => {
  assert.equal(parseEncryptionKey(key.toString('hex')).length, 32);
  assert.throws(() => parseEncryptionKey('invalid'), /64 hexadecimal/);
  assert.equal(assertDatabaseName('railway_test'), 'railway_test');
  assert.throws(() => assertDatabaseName('not-safe-name'), /PostgreSQL database name/);
  assert.doesNotThrow(() => assertSafeRestoreTarget({ sourceDatabase: 'railway_prod', targetDatabase: 'railway_restore_test', replace: true }));
  assert.throws(() => assertSafeRestoreTarget({ sourceDatabase: 'railway_restore_test', targetDatabase: 'railway_restore_test', replace: true }), /differ from the source/);
  assert.throws(() => assertSafeRestoreTarget({ sourceDatabase: 'railway_prod', targetDatabase: 'railway_restore', replace: true }), /end in _test/);
  assert.throws(() => assertSafeRestoreTarget({ sourceDatabase: 'railway_prod', targetDatabase: 'railway_restore_test', replace: false }), /explicit --replace/);
});

test('encrypted PG archive refuses overwrite and authenticates encrypted bytes', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'railway-pg-backup-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const source = join(directory, 'source.dump');
  const destination = join(directory, 'snapshot.pgbak');
  await writeFile(source, 'synthetic PostgreSQL custom archive');
  await encryptFile(source, destination, {
    format: 1, project: 'chinese-vietnamese-railway-term-learning', database: 'railway_test'
  }, key);
  await assert.rejects(encryptFile(source, destination, {
    format: 1, project: 'chinese-vietnamese-railway-term-learning', database: 'railway_test'
  }, key), { code: 'EEXIST' });
  const decoded = await decryptFile(destination, directory, key);
  try {
    assert.deepEqual(await readFile(decoded.archive), await readFile(source));
  } finally {
    await rm(decoded.workDir, { recursive: true, force: true });
  }
  const encrypted = await readFile(destination);
  encrypted[encrypted.length - 1] ^= 1;
  await writeFile(destination, encrypted);
  await assert.rejects(decryptFile(destination, directory, key), /authentication failed/);
});
