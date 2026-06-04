import mysql from 'mysql2/promise';
import { env } from '../config/env.js';

let pool;

export async function ensureDatabase() {
  const server = await mysql.createConnection({
    host: env.db.host,
    port: env.db.port,
    user: env.db.user,
    password: env.db.password,
    multipleStatements: true
  });
  await server.query(`CREATE DATABASE IF NOT EXISTS \`${env.db.database}\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await server.end();
}

export function getPool() {
  if (!pool) {
    pool = mysql.createPool({
      ...env.db,
      waitForConnections: true,
      connectionLimit: 10,
      namedPlaceholders: true,
      timezone: '+08:00'
    });
  }
  return pool;
}

export async function query(sql, params = {}) {
  const [rows] = await getPool().execute(sql, params);
  return rows;
}
