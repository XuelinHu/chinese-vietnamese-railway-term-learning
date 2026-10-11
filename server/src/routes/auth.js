import bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { env, smtpConfigured } from '../config/env.js';
import { query, withTransaction } from '../db/pool.js';
import { authRequired } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { validateBody } from '../utils/validate.js';
import { sendResetCode } from '../services/mailer.js';
import { logOperation } from '../services/audit.js';
import { OIDC_CLIENT_ID, OIDC_ISSUER, verifyOidcIdToken } from '../auth/oidc.js';

export const authRouter = Router();
const oidcTransactions = new Map();

// 认证类接口是暴力破解的首要目标，单独收紧限流
const authLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: '操作过于频繁，请稍后再试' }
});

const resetLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: '验证码请求过于频繁，请稍后再试' }
});

const usernameRule = z.string().trim().min(3, '用户名至少 3 个字符').max(50).regex(/^[A-Za-z0-9_.-]+$/, '用户名只能包含字母、数字、下划线、点和横线');
const passwordRule = z.string().min(12, '密码至少 12 位').max(64, '密码最长 64 位');

const registerSchema = z.object({
  username: usernameRule,
  password: passwordRule,
  realName: z.string().trim().min(1, '请填写真实姓名').max(80),
  email: z.string().trim().email('邮箱格式不正确').max(120),
  phone: z.string().trim().max(30).optional().default('')
});

const loginSchema = z.object({
  username: z.string().trim().min(1, '请填写用户名'),
  password: z.string().min(1, '请填写密码')
});

const passwordSchema = z.object({
  oldPassword: z.string().min(1, '请填写原密码'),
  newPassword: passwordRule
});

const profileSchema = z.object({
  realName: z.string().trim().min(1, '请填写真实姓名').max(80),
  email: z.string().trim().email('邮箱格式不正确').max(120),
  phone: z.string().trim().max(30).optional().default('')
});

const forgotSchema = z.object({
  username: z.string().trim().min(1, '请填写用户名'),
  email: z.string().trim().email('邮箱格式不正确')
});

const resetSchema = z.object({
  username: z.string().trim().min(1, '请填写用户名'),
  code: z.string().trim().length(6, '验证码为 6 位数字'),
  newPassword: passwordRule
});

function signToken(user) {
  return jwt.sign({ id: user.id, role: user.role_code }, env.jwtSecret, { expiresIn: env.jwtExpiresIn });
}

function shapeUser(user) {
  return {
    id: user.id,
    username: user.username,
    realName: user.real_name,
    email: user.email,
    phone: user.phone || '',
    avatar: user.avatar || '',
    roleCode: user.role_code,
    roleName: { zh: user.role_name_zh, en: user.role_name_en, vi: user.role_name_vi }
  };
}

async function writeLoginLog({ username, req, success, message }) {
  await query(
    'INSERT INTO sys_login_log (username, ip, user_agent, success, message) VALUES (:username, :ip, :userAgent, :success, :message)',
    {
      username: username || '',
      ip: req.ip,
      userAgent: (req.headers['user-agent'] || '').slice(0, 255),
      success: success ? 1 : 0,
      message
    }
  );
}

function randomUrlToken() {
  return randomBytes(32).toString('base64url');
}

function transactionCookie(req) {
  const parts = String(req.headers.cookie || '').split(';').map((part) => part.trim());
  const value = parts.find((part) => part.startsWith('oidc_tx='))?.slice('oidc_tx='.length) || '';
  return /^[A-Za-z0-9_-]{40,60}$/.test(value) ? value : '';
}

function clearTransactionCookie(req, res) {
  const secure = req.secure || process.env.OIDC_COOKIE_SECURE === '1';
  res.append('Set-Cookie', `oidc_tx=; HttpOnly; SameSite=Lax; Path=/api/auth/oidc; Max-Age=0${secure ? '; Secure' : ''}`);
}

function requireOidcCallbackSession(req, res, next) {
  const key = transactionCookie(req);
  const transaction = oidcTransactions.get(key);
  if (!transaction || transaction.expiresAt <= Date.now() || req.body?.state !== transaction.state) {
    if (key) oidcTransactions.delete(key);
    clearTransactionCookie(req, res);
    return res.status(400).json({ message: '统一账号登录状态无效或已过期' });
  }
  oidcTransactions.delete(key);
  clearTransactionCookie(req, res);
  req.oidcTransaction = transaction;
  if (transaction.mode === 'link') {
    return authRequired(req, res, () => {
      if (Number(req.user.id) !== Number(transaction.userId)) {
        return res.status(403).json({ message: '发起绑定的本地账号已变化，请重新开始' });
      }
      next();
    });
  }
  next();
}

authRouter.get('/oidc/config', (req, res) => {
  res.json({ enabled: true, issuer: OIDC_ISSUER, clientId: OIDC_CLIENT_ID });
});

authRouter.post('/oidc/start', authLimiter,
  (req, res, next) => req.body?.mode === 'link' ? authRequired(req, res, next) : next(),
  (req, res) => {
    const { mode, redirectUri } = req.body || {};
    if (!['login', 'link'].includes(mode)) return res.status(400).json({ message: '统一账号流程无效' });
    let redirect;
    try { redirect = new URL(redirectUri); }
    catch { return res.status(400).json({ message: '回调地址无效' }); }
    if (!req.get('origin') || redirect.origin !== req.get('origin') || redirect.pathname !== '/oidc/callback' || redirect.search || redirect.hash) {
      return res.status(400).json({ message: '回调地址必须是当前站点的统一登录回调' });
    }

    const now = Date.now();
    for (const [key, value] of oidcTransactions) {
      if (value.expiresAt <= now) oidcTransactions.delete(key);
    }
    if (oidcTransactions.size >= 1000) return res.status(503).json({ message: '统一登录暂不可用，请稍后重试' });

    const state = randomUrlToken();
    const nonce = randomUrlToken();
    const verifier = randomUrlToken();
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    const key = randomUrlToken();
    oidcTransactions.set(key, {
      mode, state, nonce, verifier, redirectUri: redirect.toString(),
      userId: mode === 'link' ? req.user.id : null,
      expiresAt: now + 10 * 60 * 1000
    });
    const secureCookie = req.secure || process.env.OIDC_COOKIE_SECURE === '1';
    res.append('Set-Cookie', `oidc_tx=${key}; HttpOnly; SameSite=Lax; Path=/api/auth/oidc; Max-Age=600${secureCookie ? '; Secure' : ''}`);

    const authorize = new URL(`${OIDC_ISSUER}/protocol/openid-connect/auth`);
    authorize.search = new URLSearchParams({
      client_id: OIDC_CLIENT_ID, redirect_uri: redirect.toString(), response_type: 'code',
      scope: 'openid profile email', state, nonce,
      code_challenge: challenge, code_challenge_method: 'S256'
    });
    res.json({ authorizeUrl: authorize.toString() });
  }
);

async function linkOidcSubject(userId, subject) {
  await withTransaction(async (txQuery) => {
    const users = await txQuery(
      "SELECT id, oidc_subject FROM sys_user WHERE id = :id AND status = 'enabled' FOR UPDATE",
      { id: userId }
    );
    const user = users[0];
    if (!user) throw Object.assign(new Error('本项目账号不可用'), { status: 403 });
    if (user.oidc_subject && user.oidc_subject !== subject) {
      throw Object.assign(new Error('本项目账号已绑定其他统一身份'), { status: 409 });
    }
    const existing = await txQuery('SELECT id FROM sys_user WHERE oidc_subject = :subject AND id <> :id', { subject, id: userId });
    if (existing.length) throw Object.assign(new Error('此统一身份已绑定其他本项目账号'), { status: 409 });
    await txQuery('UPDATE sys_user SET oidc_subject = :subject WHERE id = :id', { subject, id: userId });
  });
}

authRouter.post('/oidc/callback', authLimiter, requireOidcCallbackSession, asyncHandler(async (req, res) => {
  if (req.body?.error || typeof req.body?.code !== 'string' || req.body.code.length > 4096) {
    return res.status(400).json({ message: '统一账号授权未完成' });
  }
  const transaction = req.oidcTransaction;
  const tokenResponse = await fetch(`${OIDC_ISSUER}/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code', client_id: OIDC_CLIENT_ID,
      redirect_uri: transaction.redirectUri, code: req.body.code, code_verifier: transaction.verifier
    }),
    signal: AbortSignal.timeout(15_000)
  });
  const tokens = await tokenResponse.json();
  if (!tokenResponse.ok || !tokens.id_token) return res.status(401).json({ message: '统一账号授权失败或授权码已过期' });

  let identity;
  try { identity = await verifyOidcIdToken(tokens.id_token, transaction.nonce); }
  catch { return res.status(401).json({ message: '统一身份令牌无效或已过期' }); }

  if (transaction.mode === 'link') {
    try { await linkOidcSubject(req.user.id, identity.subject); }
    catch (error) {
      if (error.status) return res.status(error.status).json({ message: error.message });
      if (error.code === '23505') return res.status(409).json({ message: '此统一身份已绑定其他本项目账号' });
      throw error;
    }
    return res.json({ linked: true });
  }

  const users = await query(
    `SELECT u.*, r.code AS role_code, r.name_zh AS role_name_zh, r.name_en AS role_name_en, r.name_vi AS role_name_vi
     FROM sys_user u JOIN sys_role r ON u.role_id = r.id WHERE u.oidc_subject = :subject`,
    { subject: identity.subject }
  );
  const user = users[0];
  if (!user) return res.status(403).json({ message: '此统一身份尚未绑定本项目账号，请先使用本地账号登录并绑定' });
  if (user.status !== 'enabled') return res.status(403).json({ message: '本项目账号已停用，请联系管理员' });

  await writeLoginLog({ username: user.username, req, success: true, message: '统一身份登录成功' });
  await query('UPDATE sys_user SET last_login_at = CURRENT_TIMESTAMP WHERE id = :id', { id: user.id });
  res.json({ token: signToken(user), user: shapeUser(user) });
}));

authRouter.get('/oidc/status', authRequired, asyncHandler(async (req, res) => {
  const users = await query('SELECT oidc_subject IS NOT NULL AS linked FROM sys_user WHERE id = :id', { id: req.user.id });
  if (!users.length) return res.status(404).json({ message: '用户不存在' });
  res.json({ linked: users[0].linked });
}));

/* ------------------------------- 注册 ------------------------------- */

authRouter.post('/register', authLimiter, validateBody(registerSchema), asyncHandler(async (req, res) => {
  const { username, password, realName, email, phone } = req.body;

  const existing = await query('SELECT id FROM sys_user WHERE username = :username', { username });
  if (existing.length) return res.status(409).json({ message: '用户名已被占用' });

  const emailTaken = await query('SELECT id FROM sys_user WHERE email = :email', { email });
  if (emailTaken.length) return res.status(409).json({ message: '邮箱已被注册' });

  // 注册一律给最低权限角色，提权只能由管理员在后台操作
  const roles = await query("SELECT id FROM sys_role WHERE code = 'student'");
  if (!roles.length) return res.status(500).json({ message: '系统角色未初始化' });

  const hash = await bcrypt.hash(password, 10);
  const result = await query(
    `INSERT INTO sys_user (username, password_hash, real_name, email, phone, role_id, status)
     VALUES (:username, :hash, :realName, :email, :phone, :roleId, 'enabled')`,
    { username, hash, realName, email, phone: phone || null, roleId: roles[0].id }
  );

  await logOperation({ req, userId: result.insertId, username, module: 'auth', action: 'register', detail: `新用户注册：${username}` });
  res.status(201).json({ id: result.insertId, username, message: '注册成功' });
}));

/* ------------------------------- 登录 ------------------------------- */

authRouter.post('/login', authLimiter, validateBody(loginSchema), asyncHandler(async (req, res) => {
  const { username, password } = req.body;
  const users = await query(
    `SELECT u.*, r.code AS role_code, r.name_zh AS role_name_zh, r.name_en AS role_name_en, r.name_vi AS role_name_vi
     FROM sys_user u JOIN sys_role r ON u.role_id = r.id WHERE u.username = :username`,
    { username }
  );
  const user = users[0];

  if (!user) {
    await writeLoginLog({ username, req, success: false, message: '用户名或密码错误' });
    return res.status(401).json({ message: '用户名或密码错误' });
  }
  if (user.status !== 'enabled') {
    await writeLoginLog({ username, req, success: false, message: '账号已被停用' });
    return res.status(403).json({ message: '账号已被停用，请联系管理员' });
  }

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) {
    await writeLoginLog({ username, req, success: false, message: '用户名或密码错误' });
    return res.status(401).json({ message: '用户名或密码错误' });
  }

  await writeLoginLog({ username, req, success: true, message: '登录成功' });
  await query('UPDATE sys_user SET last_login_at = CURRENT_TIMESTAMP WHERE id = :id', { id: user.id });

  res.json({ token: signToken(user), user: shapeUser(user) });
}));

authRouter.post('/logout', authRequired, asyncHandler(async (req, res) => {
  await logOperation({ req, module: 'auth', action: 'logout', detail: `${req.user.username} 退出登录` });
  res.json({ message: 'ok' });
}));

/* --------------------------- 个人资料 / 密码 --------------------------- */

authRouter.get('/profile', authRequired, asyncHandler(async (req, res) => {
  const rows = await query(
    `SELECT u.id, u.username, u.real_name, u.email, u.phone, u.avatar, u.status, u.last_login_at, u.created_at,
            r.code AS role_code, r.name_zh AS role_name_zh, r.name_en AS role_name_en, r.name_vi AS role_name_vi
     FROM sys_user u JOIN sys_role r ON u.role_id = r.id WHERE u.id = :id`,
    { id: req.user.id }
  );
  if (!rows.length) return res.status(404).json({ message: '用户不存在' });
  res.json(shapeUser(rows[0]));
}));

authRouter.put('/profile', authRequired, validateBody(profileSchema), asyncHandler(async (req, res) => {
  const { realName, email, phone } = req.body;
  const taken = await query('SELECT id FROM sys_user WHERE email = :email AND id <> :id', { email, id: req.user.id });
  if (taken.length) return res.status(409).json({ message: '邮箱已被其他账号使用' });

  await query(
    'UPDATE sys_user SET real_name = :realName, email = :email, phone = :phone WHERE id = :id',
    { realName, email, phone: phone || null, id: req.user.id }
  );
  await logOperation({ req, module: 'auth', action: 'update-profile', detail: `${req.user.username} 更新个人资料` });
  res.json({ message: 'ok' });
}));

authRouter.put('/password', authRequired, validateBody(passwordSchema), asyncHandler(async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  const rows = await query('SELECT password_hash FROM sys_user WHERE id = :id', { id: req.user.id });
  if (!rows.length) return res.status(404).json({ message: '用户不存在' });

  const ok = await bcrypt.compare(oldPassword, rows[0].password_hash);
  if (!ok) return res.status(400).json({ message: '原密码不正确' });

  if (oldPassword === newPassword) {
    return res.status(400).json({ message: '新密码不能与原密码相同' });
  }

  const hash = await bcrypt.hash(newPassword, 10);
  await query('UPDATE sys_user SET password_hash = :hash WHERE id = :id', { hash, id: req.user.id });
  await logOperation({ req, module: 'auth', action: 'change-password', detail: `${req.user.username} 修改密码` });
  res.json({ message: '密码修改成功' });
}));

/* ----------------------------- 忘记密码 ----------------------------- */

authRouter.post('/forgot-password', resetLimiter, validateBody(forgotSchema), asyncHandler(async (req, res) => {
  const { username, email } = req.body;

  // 无论账号是否存在都返回同样的提示，避免用户名/邮箱枚举
  const generic = { message: '若账号与邮箱匹配，验证码已发送' };

  const users = await query(
    `SELECT u.id, u.username, u.email, u.status FROM sys_user u WHERE u.username = :username AND u.email = :email`,
    { username, email }
  );
  const user = users[0];
  if (!user || user.status !== 'enabled') return res.json(generic);

  await query('UPDATE sys_password_reset SET used = 1 WHERE user_id = :id AND used = 0', { id: user.id });

  const code = String(Math.floor(100000 + Math.random() * 900000));
  const codeHash = await bcrypt.hash(code, 10);
  await query(
    `INSERT INTO sys_password_reset (user_id, username, email, code_hash, expires_at)
     VALUES (:id, :username, :email, :codeHash, now() + (:ttl * INTERVAL '1 minute'))`,
    { id: user.id, username: user.username, email: user.email, codeHash, ttl: env.resetCodeTtlMinutes }
  );

  const mail = await sendResetCode({
    to: user.email,
    username: user.username,
    code,
    ttlMinutes: env.resetCodeTtlMinutes
  });

  await logOperation({
    req, userId: user.id, username: user.username, module: 'auth', action: 'forgot-password',
    detail: mail.sent ? '已发送密码重置验证码邮件' : `SMTP 未配置，验证码：${code}`
  });

  // SMTP 没配时，仅非生产环境把验证码回显出来，保证功能可用；
  // 生产环境必须配置 SMTP，否则验证码只落日志。
  const payload = { ...generic, delivered: mail.sent, ttlMinutes: env.resetCodeTtlMinutes };
  if (!mail.sent && !env.isProduction) {
    payload.devCode = code;
    payload.notice = smtpConfigured ? '邮件发送失败，已回显验证码（非生产环境）' : 'SMTP 未配置，已回显验证码（非生产环境）';
  }
  res.json(payload);
}));

authRouter.post('/reset-password', resetLimiter, validateBody(resetSchema), asyncHandler(async (req, res) => {
  const { username, code, newPassword } = req.body;

  const rows = await query(
    `SELECT * FROM sys_password_reset
     WHERE username = :username AND used = 0 AND expires_at > now()
     ORDER BY id DESC LIMIT 1`,
    { username }
  );
  const record = rows[0];
  if (!record) return res.status(400).json({ message: '验证码不存在或已过期，请重新获取' });

  if (record.attempts >= 5) {
    await query('UPDATE sys_password_reset SET used = 1 WHERE id = :id', { id: record.id });
    return res.status(429).json({ message: '尝试次数过多，请重新获取验证码' });
  }

  const ok = await bcrypt.compare(code, record.code_hash);
  if (!ok) {
    await query('UPDATE sys_password_reset SET attempts = attempts + 1 WHERE id = :id', { id: record.id });
    return res.status(400).json({ message: '验证码不正确' });
  }

  const hash = await bcrypt.hash(newPassword, 10);
  await query('UPDATE sys_user SET password_hash = :hash WHERE id = :id', { hash, id: record.user_id });
  await query('UPDATE sys_password_reset SET used = 1 WHERE id = :id', { id: record.id });

  await logOperation({
    req, userId: record.user_id, username, module: 'auth', action: 'reset-password',
    detail: `${username} 通过验证码重置密码`
  });
  res.json({ message: '密码重置成功，请用新密码登录' });
}));

/* ------------------------------ 菜单权限 ------------------------------ */

authRouter.get('/menus', authRequired, asyncHandler(async (req, res) => {
  const rows = await query(
    `SELECT m.id, m.parent_id, m.code, m.path, m.icon, m.name_zh, m.name_en, m.name_vi, m.sort_order
     FROM sys_menu m
     JOIN sys_role_menu rm ON rm.menu_id = m.id
     JOIN sys_role r ON r.id = rm.role_id
     WHERE r.code = :roleCode AND m.status = 'enabled'
     ORDER BY m.sort_order, m.id`,
    { roleCode: req.user.role_code }
  );
  const byId = new Map(rows.map((r) => [r.id, { ...r, children: [] }]));
  const tree = [];
  for (const item of byId.values()) {
    if (item.parent_id && byId.has(item.parent_id)) byId.get(item.parent_id).children.push(item);
    else tree.push(item);
  }
  res.json({ role: req.user.role_code, menus: tree, codes: rows.map((r) => r.code) });
}));
