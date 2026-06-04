import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { query } from '../db/pool.js';

export async function authRequired(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token) return res.status(401).json({ message: 'Unauthorized' });
    const payload = jwt.verify(token, env.jwtSecret);
    const users = await query(
      `SELECT u.id, u.username, u.real_name, u.email, u.status, r.code AS role_code, r.name_zh AS role_name
       FROM sys_user u JOIN sys_role r ON u.role_id = r.id WHERE u.id = :id`,
      { id: payload.id }
    );
    if (!users.length || users[0].status !== 'enabled') return res.status(401).json({ message: 'Unauthorized' });
    req.user = users[0];
    next();
  } catch (error) {
    res.status(401).json({ message: 'Unauthorized' });
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role_code)) return res.status(403).json({ message: 'Forbidden' });
    next();
  };
}
