import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Router } from 'express';
import { env } from '../config/env.js';
import { query } from '../db/pool.js';
import { authRequired } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const authRouter = Router();

authRouter.post('/login', asyncHandler(async (req, res) => {
  const { username, password } = req.body;
  const ip = req.ip;
  const userAgent = req.headers['user-agent'] || '';
  const users = await query(
    `SELECT u.*, r.code AS role_code, r.name_zh AS role_name_zh, r.name_en AS role_name_en, r.name_vi AS role_name_vi
     FROM sys_user u JOIN sys_role r ON u.role_id = r.id WHERE u.username = :username`,
    { username }
  );
  const user = users[0];
  const ok = user && user.status === 'enabled' && await bcrypt.compare(password || '', user.password_hash);
  await query(
    'INSERT INTO sys_login_log (username, ip, user_agent, success, message) VALUES (:username, :ip, :userAgent, :success, :message)',
    { username: username || '', ip, userAgent, success: ok ? 1 : 0, message: ok ? '登录成功' : '用户名或密码错误' }
  );
  if (!ok) return res.status(401).json({ message: '用户名或密码错误' });
  const token = jwt.sign({ id: user.id, role: user.role_code }, env.jwtSecret, { expiresIn: env.jwtExpiresIn });
  res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      realName: user.real_name,
      email: user.email,
      roleCode: user.role_code,
      roleName: {
        zh: user.role_name_zh,
        en: user.role_name_en,
        vi: user.role_name_vi
      }
    }
  });
}));

authRouter.get('/profile', authRequired, asyncHandler(async (req, res) => {
  res.json(req.user);
}));

authRouter.put('/password', authRequired, asyncHandler(async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  const rows = await query('SELECT password_hash FROM sys_user WHERE id = :id', { id: req.user.id });
  const ok = await bcrypt.compare(oldPassword || '', rows[0].password_hash);
  if (!ok) return res.status(400).json({ message: '原密码不正确' });
  const hash = await bcrypt.hash(newPassword, 10);
  await query('UPDATE sys_user SET password_hash = :hash WHERE id = :id', { hash, id: req.user.id });
  res.json({ message: 'ok' });
}));

authRouter.post('/logout', authRequired, asyncHandler(async (req, res) => {
  res.json({ message: 'ok' });
}));
