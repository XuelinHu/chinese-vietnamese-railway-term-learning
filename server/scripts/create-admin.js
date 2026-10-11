import bcrypt from 'bcryptjs';
import { initializeDatabase } from '../src/db/init.js';
import { getPool, query } from '../src/db/pool.js';

const username = process.env.ADMIN_USERNAME?.trim() || '';
const password = process.env.ADMIN_PASSWORD || '';

if (!/^[A-Za-z0-9_.-]{3,50}$/.test(username)) {
  throw new Error('ADMIN_USERNAME must be 3-50 characters: letters, numbers, dot, underscore, or hyphen');
}
if (password.length < 12) throw new Error('ADMIN_PASSWORD must be at least 12 characters');

const connection = await getPool().connect();
let lockAcquired = false;
try {
  await initializeDatabase({ seedDemoUsers: false });
  const lock = await connection.query("SELECT pg_try_advisory_lock(hashtext('railway-term-admin-bootstrap')) AS acquired");
  lockAcquired = lock.rows[0]?.acquired === true;
  if (!lockAcquired) throw new Error('Could not acquire the administrator bootstrap lock');

  const existing = await query(
    'SELECT u.id FROM sys_user u JOIN sys_role r ON r.id = u.role_id WHERE r.code = :role LIMIT 1',
    { role: 'admin' }
  );
  if (existing.length) throw new Error('An administrator already exists; bootstrap refused');

  const roles = await query('SELECT id FROM sys_role WHERE code = :role LIMIT 1', { role: 'admin' });
  if (!roles.length) throw new Error('The admin role is missing');

  const passwordHash = await bcrypt.hash(password, 12);
  await query(
    `INSERT INTO sys_user (username, password_hash, real_name, email, role_id)
     VALUES (:username, :passwordHash, :username, NULL, :roleId)`,
    { username, passwordHash, roleId: roles[0].id }
  );
  console.log(`Administrator '${username}' created.`);
} finally {
  if (lockAcquired) await connection.query("SELECT pg_advisory_unlock(hashtext('railway-term-admin-bootstrap'))");
  connection.release();
  await getPool().end();
}
