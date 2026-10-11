import pg from 'pg';
import { env } from '../config/env.js';

const { Pool, types } = pg;
types.setTypeParser(20, (value) => {
  const number = Number(value);
  return Number.isSafeInteger(number) ? number : value;
});

const pool = new Pool({
  host: env.db.host,
  port: env.db.port,
  user: env.db.user,
  password: env.db.password,
  database: env.db.database,
  max: env.db.poolMax,
  ssl: env.db.ssl ? { rejectUnauthorized: true } : undefined,
  application_name: 'chinese-vietnamese-railway-term-learning'
});

export function bindNamedParameters(sql, params = {}) {
  if (Array.isArray(params)) {
    let index = 0;
    return { text: sql.replace(/\?/g, () => `$${++index}`), values: params };
  }
  const values = [];
  const indexes = new Map();
  let text = '';
  let quote = null;
  let lineComment = false;
  let blockComment = false;

  for (let index = 0; index < sql.length; index += 1) {
    const char = sql[index];
    const next = sql[index + 1];
    if (lineComment) {
      text += char;
      if (char === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      text += char;
      if (char === '*' && next === '/') {
        text += next;
        index += 1;
        blockComment = false;
      }
      continue;
    }
    if (quote) {
      text += char;
      if (char === quote && next === quote) {
        text += next;
        index += 1;
      } else if (char === quote && sql[index - 1] !== '\\') {
        quote = null;
      }
      continue;
    }
    if ((char === '-' && next === '-') || (char === '/' && next === '*')) {
      text += `${char}${next}`;
      index += 1;
      if (char === '-') lineComment = true;
      else blockComment = true;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      text += char;
      continue;
    }
    if (char === ':' && next !== ':' && /[A-Za-z_]/.test(sql[index + 1] || '')) {
      const match = sql.slice(index + 1).match(/^[A-Za-z_][A-Za-z0-9_]*/);
      const name = match[0];
      if (!Object.hasOwn(params, name)) throw new Error(`Missing SQL parameter: ${name}`);
      if (!indexes.has(name)) {
        values.push(params[name] ?? null);
        indexes.set(name, values.length);
      }
      text += `$${indexes.get(name)}`;
      index += name.length;
      continue;
    }
    text += char;
  }
  return { text, values };
}

function prepare(sql, params) {
  const ignoreConflict = /\bINSERT\s+IGNORE\s+INTO\b/i.test(sql);
  const insert = sql.match(/\bINSERT\s+(?:IGNORE\s+)?INTO\s+([A-Za-z_][A-Za-z0-9_]*)/i);
  let statement = sql.replace(/\bINSERT\s+IGNORE\s+INTO\b/i, 'INSERT INTO').trim().replace(/;$/, '');
  if (ignoreConflict) statement += ' ON CONFLICT DO NOTHING';
  const identityTables = new Set([
    'sys_role', 'sys_user', 'sys_menu', 'sys_password_reset', 'sys_login_log', 'sys_operation_log',
    'term_category', 'railway_term', 'practice_record', 'practice_answer', 'wrong_question',
    'favorite_term', 'agent_model', 'agent_session', 'agent_message'
  ]);
  if (insert && identityTables.has(insert[1]) && !/\bRETURNING\b/i.test(statement)) statement += ' RETURNING id';
  return bindNamedParameters(statement, params);
}

export async function query(sql, params = {}, executor = pool) {
  const { text, values } = prepare(sql, params);
  const result = await executor.query(text, values);
  const rows = Array.isArray(result) ? result.flatMap((item) => item.rows || []) : (result.rows || []);
  const first = rows[0];
  Object.defineProperties(rows, {
    insertId: { value: first?.id, enumerable: false },
    affectedRows: { value: Array.isArray(result) ? result.reduce((sum, item) => sum + (item.rowCount || 0), 0) : result.rowCount || 0, enumerable: false }
  });
  return rows;
}

export async function closePool() {
  await pool.end();
}

export function getPool() {
  return pool;
}

export async function withTransaction(work) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work((sql, params = {}) => query(sql, params, client));
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export { pool };
