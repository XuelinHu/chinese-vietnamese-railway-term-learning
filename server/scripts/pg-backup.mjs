import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { chmod, link, mkdtemp, open, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';
import dotenv from 'dotenv';

dotenv.config();

const MAGIC = Buffer.from('RVLPG001');
const NONCE_BYTES = 12;
const TAG_BYTES = 16;
const MAX_METADATA_BYTES = 4096;

export function parseEncryptionKey(value) {
  if (!/^[\da-f]{64}$/i.test(String(value || ''))) throw new Error('DB_BACKUP_ENCRYPTION_KEY must contain 64 hexadecimal characters.');
  return Buffer.from(value, 'hex');
}

export function assertDatabaseName(value) {
  if (!/^[A-Za-z][A-Za-z0-9_]{0,62}$/.test(String(value || ''))) throw new Error('PostgreSQL database name is invalid.');
  return value;
}

export function assertSafeRestoreTarget({ sourceDatabase, targetDatabase, replace }) {
  assertDatabaseName(sourceDatabase);
  assertDatabaseName(targetDatabase);
  if (sourceDatabase === targetDatabase) throw new Error('Restore target must differ from the source database.');
  if (!targetDatabase.endsWith('_test')) throw new Error('Restore target must end in _test.');
  if (replace !== true) throw new Error('Restore requires explicit --replace confirmation.');
}

function makePrefix(metadata, nonce) {
  const bytes = Buffer.from(JSON.stringify(metadata));
  if (bytes.length > MAX_METADATA_BYTES) throw new Error('Backup metadata is too large.');
  const prefix = Buffer.alloc(MAGIC.length + 4 + bytes.length + NONCE_BYTES + TAG_BYTES);
  MAGIC.copy(prefix);
  prefix.writeUInt32BE(bytes.length, MAGIC.length);
  bytes.copy(prefix, MAGIC.length + 4);
  nonce.copy(prefix, MAGIC.length + 4 + bytes.length);
  return { prefix, bytes, tagOffset: prefix.length - TAG_BYTES };
}

export async function encryptFile(source, destination, metadata, key) {
  const nonce = randomBytes(NONCE_BYTES);
  const { prefix, bytes, tagOffset } = makePrefix(metadata, nonce);
  const partial = `${destination}.${process.pid}.${randomBytes(6).toString('hex')}.partial`;
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  cipher.setAAD(Buffer.concat([MAGIC, bytes]));
  try {
    await writeFile(partial, prefix, { flag: 'wx', mode: 0o600 });
    await pipeline(createReadStream(source), cipher, createWriteStream(partial, { flags: 'a', mode: 0o600 }));
    const handle = await open(partial, 'r+');
    try {
      await handle.write(cipher.getAuthTag(), 0, TAG_BYTES, tagOffset);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await link(partial, destination);
  } finally {
    await unlink(partial).catch(() => {});
  }
}

export async function decryptFile(source, directory, key) {
  const handle = await open(source, 'r');
  let metadata;
  let nonce;
  let tag;
  let offset;
  let metadataBytes;
  try {
    const fixed = Buffer.alloc(MAGIC.length + 4);
    const first = await handle.read(fixed, 0, fixed.length, 0);
    if (first.bytesRead !== fixed.length || !fixed.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error('Invalid PostgreSQL backup format.');
    const length = fixed.readUInt32BE(MAGIC.length);
    if (length < 2 || length > MAX_METADATA_BYTES) throw new Error('Invalid backup metadata length.');
    metadataBytes = Buffer.alloc(length);
    nonce = Buffer.alloc(NONCE_BYTES);
    tag = Buffer.alloc(TAG_BYTES);
    offset = fixed.length;
    for (const [buffer, size] of [[metadataBytes, length], [nonce, NONCE_BYTES], [tag, TAG_BYTES]]) {
      const part = await handle.read(buffer, 0, size, offset);
      if (part.bytesRead !== size) throw new Error('Backup file is truncated.');
      offset += size;
    }
    try { metadata = JSON.parse(metadataBytes.toString('utf8')); } catch { throw new Error('Backup metadata is invalid.'); }
  } finally {
    await handle.close();
  }
  if (metadata?.format !== 1 || metadata?.project !== 'chinese-vietnamese-railway-term-learning') throw new Error('Backup belongs to another project or uses an unsupported version.');
  assertDatabaseName(metadata.database);
  const workDir = await mkdtemp(join(directory, 'railway-term-restore-'));
  await chmod(workDir, 0o700).catch(() => {});
  const archive = join(workDir, 'database.dump');
  const decipher = createDecipheriv('aes-256-gcm', key, nonce);
  decipher.setAAD(Buffer.concat([MAGIC, metadataBytes]));
  decipher.setAuthTag(tag);
  try {
    await pipeline(createReadStream(source, { start: offset }), decipher, createWriteStream(archive, { flags: 'wx', mode: 0o600 }));
    return { archive, workDir, metadata };
  } catch (error) {
    await rm(workDir, { recursive: true, force: true });
    if (/authenticate data|bad decrypt/i.test(error.message)) throw new Error('Backup authentication failed; restore was not started.');
    throw error;
  }
}

function run(command, args, env) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { env, stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
    let stderr = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => { stderr = (stderr + chunk).slice(-4000); });
    child.on('error', (error) => reject(new Error(`${basename(command)} could not start: ${error.message}`)));
    child.on('close', (code) => code === 0
      ? resolvePromise()
      : reject(new Error(`${basename(command)} failed with exit code ${code}${stderr ? `: ${stderr.trim()}` : ''}`)));
  });
}

function pgTool(name, env) {
  return env.PG_BIN_DIR ? join(env.PG_BIN_DIR, process.platform === 'win32' ? `${name}.exe` : name) : name;
}

function parseArgs(argv) {
  const [action, ...rest] = argv;
  const options = {};
  for (let index = 0; index < rest.length; index += 1) {
    const item = rest[index];
    if (item === '--replace') options.replace = true;
    else if (item === '--help') options.help = true;
    else if (item.startsWith('--')) {
      const value = rest[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`Missing value for ${item}.`);
      options[item.slice(2)] = value;
      index += 1;
    } else throw new Error(`Unknown argument: ${item}.`);
  }
  return { action, options };
}

export async function runCli(argv, env = process.env) {
  const { action, options } = parseArgs(argv);
  if (options.help || !action) {
    console.log('Usage: npm run db:backup [-- --destination <file>]');
    console.log('       npm run db:restore -- --source <file> --database <distinct_name_test> --replace');
    return;
  }
  const key = parseEncryptionKey(env.DB_BACKUP_ENCRYPTION_KEY);
  const database = assertDatabaseName(env.PGDATABASE);
  const pgEnv = {
    ...env,
    PGDATABASE: database,
    ...(env.PGSSL === '1' && !env.PGSSLMODE ? { PGSSLMODE: 'require' } : {})
  };
  if (action === 'backup') {
    const destination = resolve(options.destination || join('backups', `railway-term-${database}-${new Date().toISOString().replace(/[:.]/g, '-')}.pgbak`));
    const tempDir = await mkdtemp(join(tmpdir(), 'railway-term-dump-'));
    try {
      await run(pgTool('pg_dump', env), ['--format=custom', '--no-owner', '--no-acl', '--file', join(tempDir, 'database.dump')], pgEnv);
      const { mkdir } = await import('node:fs/promises');
      await mkdir(dirname(destination), { recursive: true });
      await encryptFile(join(tempDir, 'database.dump'), destination, {
        format: 1, project: 'chinese-vietnamese-railway-term-learning', database, createdAt: new Date().toISOString()
      }, key);
      console.log(`Encrypted PostgreSQL backup created: ${destination}`);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
    return;
  }
  if (action === 'restore') {
    if (!options.source || !options.database || !options.replace) throw new Error('restore requires --source, --database, and explicit --replace.');
    const targetDatabase = assertDatabaseName(options.database);
    const { archive, workDir, metadata } = await decryptFile(resolve(options.source), tmpdir(), key);
    try {
      assertSafeRestoreTarget({ sourceDatabase: metadata.database, targetDatabase, replace: options.replace });
      const targetEnv = { ...pgEnv, PGDATABASE: targetDatabase };
      await run(pgTool('pg_restore', env), ['--list', archive], targetEnv);
      await run(pgTool('pg_restore', env), ['--exit-on-error', '--single-transaction', '--clean', '--if-exists', '--no-owner', '--no-acl', '--dbname', targetDatabase, archive], targetEnv);
      console.log(`Restored ${metadata.database} snapshot to isolated database ${targetDatabase}.`);
    } finally {
      await rm(workDir, { recursive: true, force: true });
    }
    return;
  }
  throw new Error(`Unknown action: ${action}.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
