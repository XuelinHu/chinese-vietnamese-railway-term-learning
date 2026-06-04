import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { authRequired, requireRole } from '../middleware/auth.js';
import { query } from '../db/pool.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { getPagination, paged } from '../utils/pagination.js';

export const systemRouter = Router();
systemRouter.use(authRequired);

systemRouter.get('/roles', asyncHandler(async (req, res) => {
  if (!req.query.page && !req.query.pageSize) return res.json(await query('SELECT * FROM sys_role ORDER BY id'));
  const { page, pageSize, limit, offset } = getPagination(req.query);
  const total = await query('SELECT COUNT(*) AS count FROM sys_role');
  const rows = await query(`SELECT * FROM sys_role ORDER BY id LIMIT ${limit} OFFSET ${offset}`);
  res.json(paged(rows, total[0].count, page, pageSize));
}));

systemRouter.get('/users', requireRole('admin', 'teacher'), asyncHandler(async (req, res) => {
  const { page, pageSize, limit, offset } = getPagination(req.query);
  const total = await query('SELECT COUNT(*) AS count FROM sys_user');
  const rows = await query(
    `SELECT u.id, u.username, u.real_name, u.email, u.status, u.created_at, r.code AS role_code, r.name_zh AS role_name
     FROM sys_user u JOIN sys_role r ON u.role_id = r.id ORDER BY u.id LIMIT ${limit} OFFSET ${offset}`
  );
  res.json(paged(rows, total[0].count, page, pageSize));
}));

systemRouter.post('/users', requireRole('admin'), asyncHandler(async (req, res) => {
  const { username, password = '123456', real_name, email, role_id, status = 'enabled' } = req.body;
  const hash = await bcrypt.hash(password, 10);
  const result = await query(
    'INSERT INTO sys_user (username, password_hash, real_name, email, role_id, status) VALUES (:username, :hash, :real_name, :email, :role_id, :status)',
    { username, hash, real_name, email, role_id, status }
  );
  res.status(201).json({ id: result.insertId });
}));

systemRouter.put('/users/:id', requireRole('admin'), asyncHandler(async (req, res) => {
  await query(
    'UPDATE sys_user SET real_name=:real_name, email=:email, role_id=:role_id, status=:status WHERE id=:id',
    { ...req.body, id: req.params.id }
  );
  res.json({ message: 'ok' });
}));

systemRouter.get('/logs/login', requireRole('admin', 'teacher'), asyncHandler(async (req, res) => {
  const { page, pageSize, limit, offset } = getPagination(req.query);
  const total = await query('SELECT COUNT(*) AS count FROM sys_login_log');
  const rows = await query(`SELECT * FROM sys_login_log ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`);
  res.json(paged(rows, total[0].count, page, pageSize));
}));

systemRouter.get('/logs/operation', requireRole('admin', 'teacher'), asyncHandler(async (req, res) => {
  const { page, pageSize, limit, offset } = getPagination(req.query);
  const total = await query('SELECT COUNT(*) AS count FROM sys_operation_log');
  const rows = await query(`SELECT * FROM sys_operation_log ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`);
  res.json(paged(rows, total[0].count, page, pageSize));
}));
