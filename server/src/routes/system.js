import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { z } from 'zod';
import { authRequired, requireRole } from '../middleware/auth.js';
import { query } from '../db/pool.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { getPagination, paged } from '../utils/pagination.js';
import { validateBody } from '../utils/validate.js';
import { logOperation } from '../services/audit.js';

export const systemRouter = Router();
systemRouter.use(authRequired);

const adminOnly = requireRole('admin');
const staff = requireRole('admin', 'teacher');

/* ------------------------------ 用户管理 ------------------------------ */

systemRouter.get('/users', staff, asyncHandler(async (req, res) => {
  const { page, pageSize, limit, offset } = getPagination(req.query);
  const keyword = (req.query.keyword || '').trim();
  const roleId = req.query.roleId ? Number(req.query.roleId) : null;
  const status = req.query.status || null;

  const params = { keyword: `%${keyword}%`, roleId, status, limit, offset };
  const where = `WHERE (:roleId IS NULL OR u.role_id = :roleId)
       AND (:status IS NULL OR u.status = :status)
       AND (:keyword = '%%' OR u.username LIKE :keyword OR u.real_name LIKE :keyword
            OR u.email LIKE :keyword OR u.phone LIKE :keyword)`;

  const total = await query(`SELECT COUNT(*) AS count FROM sys_user u ${where}`, params);
  const rows = await query(
    `SELECT u.id, u.username, u.real_name, u.email, u.phone, u.status,
            u.last_login_at, u.created_at, r.code AS role_code, r.name_zh AS role_name
     FROM sys_user u JOIN sys_role r ON u.role_id = r.id
     ${where}
     ORDER BY u.id DESC LIMIT ${limit} OFFSET ${offset}`,
    params
  );
  res.json(paged(rows, total[0].count, page, pageSize));
}));

systemRouter.post('/users', adminOnly, validateBody(z.object({
  username: z.string().trim().min(3).max(50).regex(/^[A-Za-z0-9_.-]+$/, '用户名只能包含字母、数字、下划线、点和横线'),
  password: z.string().min(6, '密码至少 6 位').max(64).optional().default('123456'),
  realName: z.string().trim().min(1, '请填写真实姓名').max(80),
  email: z.string().trim().email('邮箱格式不正确').max(120).optional().or(z.literal('')),
  phone: z.string().trim().max(30).optional().default(''),
  roleId: z.coerce.number().int().positive('请选择角色'),
  status: z.enum(['enabled', 'disabled']).optional().default('enabled')
})), asyncHandler(async (req, res) => {
  const { username, password, realName, email, phone, roleId, status } = req.body;

  const existing = await query('SELECT id FROM sys_user WHERE username = :username', { username });
  if (existing.length) return res.status(409).json({ message: '用户名已存在' });

  const hash = await bcrypt.hash(password, 10);
  const result = await query(
    `INSERT INTO sys_user (username, password_hash, real_name, email, phone, role_id, status)
     VALUES (:username, :hash, :realName, :email, :phone, :roleId, :status)`,
    { username, hash, realName, email: email || null, phone: phone || null, roleId, status }
  );
  await logOperation({ req, module: 'system', action: 'create-user', detail: `新增用户 ${username} (id=${result.insertId})` });
  res.status(201).json({ id: result.insertId });
}));

systemRouter.put('/users/:id', adminOnly, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const { real_name, realName, email, phone, role_id, roleId, status } = req.body;
  if (id === req.user.id && status === 'disabled') {
    return res.status(400).json({ message: '不能停用当前登录账号' });
  }
  await query(
    `UPDATE sys_user SET real_name = :realName, email = :email, phone = :phone,
            role_id = :roleId, status = :status WHERE id = :id`,
    {
      realName: realName ?? real_name,
      email: email || null,
      phone: phone || null,
      roleId: roleId ?? role_id,
      status: status || 'enabled',
      id
    }
  );
  await logOperation({ req, module: 'system', action: 'update-user', detail: `更新用户 id=${id}` });
  res.json({ message: 'ok' });
}));

systemRouter.delete('/users/:id', adminOnly, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (id === req.user.id) return res.status(400).json({ message: '不能删除当前登录账号' });
  await query('DELETE FROM sys_user WHERE id = :id', { id });
  await logOperation({ req, module: 'system', action: 'delete-user', detail: `删除用户 id=${id}` });
  res.json({ message: 'ok' });
}));

systemRouter.post('/users/:id/reset-password', adminOnly, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const password = String(req.body?.password || '123456');
  if (password.length < 6) return res.status(400).json({ message: '密码至少 6 位' });
  const hash = await bcrypt.hash(password, 10);
  await query('UPDATE sys_user SET password_hash = :hash WHERE id = :id', { hash, id });
  await logOperation({ req, module: 'system', action: 'reset-user-password', detail: `重置用户密码 id=${id}` });
  res.json({ message: '密码已重置', password });
}));

/* ------------------------------ 角色管理 ------------------------------ */

systemRouter.get('/roles', staff, asyncHandler(async (req, res) => {
  const { page, pageSize, limit, offset } = getPagination(req.query);
  const keyword = (req.query.keyword || '').trim();
  const params = { keyword: `%${keyword}%` };
  const where = `WHERE (:keyword = '%%' OR r.code LIKE :keyword OR r.name_zh LIKE :keyword OR r.name_en LIKE :keyword)`;

  const total = await query(`SELECT COUNT(*) AS count FROM sys_role r ${where}`, params);
  const rows = await query(
    `SELECT r.*,
            (SELECT COUNT(*) FROM sys_user u WHERE u.role_id = r.id) AS user_count,
            (SELECT COUNT(*) FROM sys_role_menu rm WHERE rm.role_id = r.id) AS menu_count
     FROM sys_role r ${where}
     ORDER BY r.id LIMIT ${limit} OFFSET ${offset}`,
    params
  );
  res.json(paged(rows, total[0].count, page, pageSize));
}));

/** 下拉用的全量角色（不分页）。 */
systemRouter.get('/roles/options', staff, asyncHandler(async (req, res) => {
  res.json(await query('SELECT id, code, name_zh, name_en, name_vi FROM sys_role ORDER BY id'));
}));

systemRouter.post('/roles', adminOnly, validateBody(z.object({
  code: z.string().trim().min(2).max(40).regex(/^[a-z][a-z0-9_-]*$/, '角色编码只能是小写字母、数字、下划线或横线'),
  nameZh: z.string().trim().min(1, '请填写中文名称').max(80),
  nameEn: z.string().trim().min(1, '请填写英文名称').max(80),
  nameVi: z.string().trim().min(1, '请填写越南语名称').max(80),
  remark: z.string().trim().max(255).optional().default('')
})), asyncHandler(async (req, res) => {
  const { code, nameZh, nameEn, nameVi, remark } = req.body;
  const existing = await query('SELECT id FROM sys_role WHERE code = :code', { code });
  if (existing.length) return res.status(409).json({ message: '角色编码已存在' });

  const result = await query(
    `INSERT INTO sys_role (code, name_zh, name_en, name_vi, remark)
     VALUES (:code, :nameZh, :nameEn, :nameVi, :remark)`,
    { code, nameZh, nameEn, nameVi, remark }
  );
  await logOperation({ req, module: 'system', action: 'create-role', detail: `新增角色 ${code}` });
  res.status(201).json({ id: result.insertId });
}));

systemRouter.put('/roles/:id', adminOnly, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const { name_zh, name_en, name_vi, remark } = req.body;
  await query(
    'UPDATE sys_role SET name_zh = :name_zh, name_en = :name_en, name_vi = :name_vi, remark = :remark WHERE id = :id',
    { name_zh, name_en, name_vi, remark: remark || null, id }
  );
  await logOperation({ req, module: 'system', action: 'update-role', detail: `更新角色 id=${id}` });
  res.json({ message: 'ok' });
}));

systemRouter.delete('/roles/:id', adminOnly, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const users = await query('SELECT COUNT(*) AS count FROM sys_user WHERE role_id = :id', { id });
  if (users[0].count > 0) return res.status(400).json({ message: '该角色下仍有用户，无法删除' });

  await query('DELETE FROM sys_role_menu WHERE role_id = :id', { id });
  await query('DELETE FROM sys_role WHERE id = :id', { id });
  await logOperation({ req, module: 'system', action: 'delete-role', detail: `删除角色 id=${id}` });
  res.json({ message: 'ok' });
}));

systemRouter.get('/roles/:id/menus', staff, asyncHandler(async (req, res) => {
  const rows = await query('SELECT menu_id FROM sys_role_menu WHERE role_id = :id', { id: Number(req.params.id) });
  res.json({ menuIds: rows.map((r) => r.menu_id) });
}));

systemRouter.put('/roles/:id/menus', adminOnly, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const menuIds = Array.isArray(req.body?.menuIds) ? req.body.menuIds.map(Number).filter(Number.isInteger) : [];

  await query('DELETE FROM sys_role_menu WHERE role_id = :id', { id });
  for (const menuId of menuIds) {
    await query('INSERT IGNORE INTO sys_role_menu (role_id, menu_id) VALUES (:id, :menuId)', { id, menuId });
  }
  await logOperation({ req, module: 'system', action: 'grant-role-menus', detail: `角色 id=${id} 授权 ${menuIds.length} 个菜单` });
  res.json({ message: 'ok', count: menuIds.length });
}));

/* ------------------------------ 菜单管理 ------------------------------ */

systemRouter.get('/menus', staff, asyncHandler(async (req, res) => {
  const { page, pageSize, limit, offset } = getPagination(req.query);
  const keyword = (req.query.keyword || '').trim();
  const params = { keyword: `%${keyword}%` };
  const where = `WHERE (:keyword = '%%' OR m.code LIKE :keyword OR m.path LIKE :keyword
       OR m.name_zh LIKE :keyword OR m.name_en LIKE :keyword OR m.name_vi LIKE :keyword)`;

  const total = await query(`SELECT COUNT(*) AS count FROM sys_menu m ${where}`, params);
  const rows = await query(
    `SELECT m.*, p.name_zh AS parent_name FROM sys_menu m
     LEFT JOIN sys_menu p ON p.id = m.parent_id
     ${where}
     ORDER BY m.sort_order, m.id LIMIT ${limit} OFFSET ${offset}`,
    params
  );
  res.json(paged(rows, total[0].count, page, pageSize));
}));

/** 菜单树全量，供角色授权界面勾选（不分页）。 */
systemRouter.get('/menus/tree', staff, asyncHandler(async (req, res) => {
  const rows = await query('SELECT * FROM sys_menu ORDER BY sort_order, id');
  const byId = new Map(rows.map((r) => [r.id, { ...r, children: [] }]));
  const tree = [];
  for (const item of byId.values()) {
    if (item.parent_id && byId.has(item.parent_id)) byId.get(item.parent_id).children.push(item);
    else tree.push(item);
  }
  res.json(tree);
}));

systemRouter.post('/menus', adminOnly, validateBody(z.object({
  parentId: z.coerce.number().int().min(0).optional().default(0),
  code: z.string().trim().min(2).max(60).regex(/^[a-z][a-z0-9._-]*$/, '菜单编码只能是小写字母、数字、点、下划线或横线'),
  path: z.string().trim().min(1).max(120),
  icon: z.string().trim().max(40).optional().default(''),
  nameZh: z.string().trim().min(1).max(80),
  nameEn: z.string().trim().min(1).max(80),
  nameVi: z.string().trim().min(1).max(80),
  sortOrder: z.coerce.number().int().optional().default(0)
})), asyncHandler(async (req, res) => {
  const { parentId, code, path, icon, nameZh, nameEn, nameVi, sortOrder } = req.body;
  const existing = await query('SELECT id FROM sys_menu WHERE code = :code', { code });
  if (existing.length) return res.status(409).json({ message: '菜单编码已存在' });

  const result = await query(
    `INSERT INTO sys_menu (parent_id, code, path, icon, name_zh, name_en, name_vi, sort_order)
     VALUES (:parentId, :code, :path, :icon, :nameZh, :nameEn, :nameVi, :sortOrder)`,
    { parentId, code, path, icon, nameZh, nameEn, nameVi, sortOrder }
  );
  await logOperation({ req, module: 'system', action: 'create-menu', detail: `新增菜单 ${code}` });
  res.status(201).json({ id: result.insertId });
}));

systemRouter.put('/menus/:id', adminOnly, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const { parent_id, parentId, code, path, icon, name_zh, name_en, name_vi, sort_order, sortOrder, status } = req.body;
  await query(
    `UPDATE sys_menu SET parent_id = :parentId, code = :code, path = :path, icon = :icon,
            name_zh = :name_zh, name_en = :name_en, name_vi = :name_vi,
            sort_order = :sortOrder, status = :status
     WHERE id = :id`,
    {
      parentId: parentId ?? parent_id ?? 0,
      code, path, icon: icon || '',
      name_zh, name_en, name_vi,
      sortOrder: sortOrder ?? sort_order ?? 0,
      status: status || 'enabled',
      id
    }
  );
  await logOperation({ req, module: 'system', action: 'update-menu', detail: `更新菜单 id=${id}` });
  res.json({ message: 'ok' });
}));

systemRouter.delete('/menus/:id', adminOnly, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const children = await query('SELECT COUNT(*) AS count FROM sys_menu WHERE parent_id = :id', { id });
  if (children[0].count > 0) return res.status(400).json({ message: '请先删除子菜单' });

  await query('DELETE FROM sys_role_menu WHERE menu_id = :id', { id });
  await query('DELETE FROM sys_menu WHERE id = :id', { id });
  await logOperation({ req, module: 'system', action: 'delete-menu', detail: `删除菜单 id=${id}` });
  res.json({ message: 'ok' });
}));

/* ------------------------------ 日志查询 ------------------------------ */

systemRouter.get('/logs/login', staff, asyncHandler(async (req, res) => {
  const { page, pageSize, limit, offset } = getPagination(req.query);
  const keyword = (req.query.keyword || '').trim();
  const success = req.query.success === '' || req.query.success === undefined ? null : Number(req.query.success);
  const params = { keyword: `%${keyword}%`, success, limit, offset };
  const where = `WHERE (:success IS NULL OR success = :success)
       AND (:keyword = '%%' OR username LIKE :keyword OR ip LIKE :keyword OR message LIKE :keyword)`;

  const total = await query(`SELECT COUNT(*) AS count FROM sys_login_log ${where}`, params);
  const rows = await query(
    `SELECT * FROM sys_login_log ${where} ORDER BY id DESC LIMIT ${limit} OFFSET ${offset}`,
    params
  );
  res.json(paged(rows, total[0].count, page, pageSize));
}));

systemRouter.get('/logs/operation', staff, asyncHandler(async (req, res) => {
  const { page, pageSize, limit, offset } = getPagination(req.query);
  const keyword = (req.query.keyword || '').trim();
  const module = req.query.module || null;
  const params = { keyword: `%${keyword}%`, module, limit, offset };
  const where = `WHERE (:module IS NULL OR module = :module)
       AND (:keyword = '%%' OR username LIKE :keyword OR action LIKE :keyword
            OR detail LIKE :keyword OR path LIKE :keyword)`;

  const total = await query(`SELECT COUNT(*) AS count FROM sys_operation_log ${where}`, params);
  const rows = await query(
    `SELECT * FROM sys_operation_log ${where} ORDER BY id DESC LIMIT ${limit} OFFSET ${offset}`,
    params
  );
  res.json(paged(rows, total[0].count, page, pageSize));
}));

/** 操作日志的模块清单，供筛选下拉使用。 */
systemRouter.get('/logs/modules', staff, asyncHandler(async (req, res) => {
  const rows = await query('SELECT DISTINCT module FROM sys_operation_log ORDER BY module');
  res.json(rows.map((r) => r.module));
}));
