import { Router } from 'express';
import { z } from 'zod';
import { authRequired, requireRole } from '../middleware/auth.js';
import { query } from '../db/pool.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { getPagination, paged } from '../utils/pagination.js';
import { validateBody } from '../utils/validate.js';
import { logOperation } from '../services/audit.js';

export const termsRouter = Router();

termsRouter.use(authRequired);

const editor = requireRole('admin', 'teacher');

/* ------------------------------ 术语分类 ------------------------------ */

/**
 * 分页查询分类。不带 page/pageSize 时返回全量数组，
 * 保持与既有前端下拉、冒烟测试的兼容。
 */
termsRouter.get('/categories', asyncHandler(async (req, res) => {
  if (!req.query.page && !req.query.pageSize) {
    const rows = await query('SELECT * FROM term_category ORDER BY sort_order, id');
    return res.json(rows);
  }
  const { page, pageSize, limit, offset } = getPagination(req.query);
  const keyword = (req.query.keyword || '').trim();
  const status = req.query.status || null;
  const params = { keyword: `%${keyword}%`, status, limit, offset };
  const where = `WHERE (:status IS NULL OR status = :status)
       AND (:keyword = '%%' OR name_zh LIKE :keyword OR name_en LIKE :keyword OR name_vi LIKE :keyword)`;

  const total = await query(`SELECT COUNT(*) AS count FROM term_category ${where}`, params);
  const rows = await query(
    `SELECT c.*, (SELECT COUNT(*) FROM railway_term t WHERE t.category_id = c.id) AS term_count
     FROM term_category c ${where}
     ORDER BY c.sort_order, c.id LIMIT ${limit} OFFSET ${offset}`,
    params
  );
  res.json(paged(rows, total[0].count, page, pageSize));
}));

/** 下拉用的全量分类。 */
termsRouter.get('/categories/options', asyncHandler(async (req, res) => {
  res.json(await query("SELECT id, name_zh, name_en, name_vi FROM term_category WHERE status = 'enabled' ORDER BY sort_order, id"));
}));

termsRouter.post('/categories', editor, validateBody(z.object({
  name_zh: z.string().trim().min(1, '请填写中文名称').max(100),
  name_en: z.string().trim().min(1, '请填写英文名称').max(100),
  name_vi: z.string().trim().min(1, '请填写越南语名称').max(100),
  sort_order: z.coerce.number().int().optional().default(0),
  status: z.enum(['enabled', 'disabled']).optional().default('enabled')
})), asyncHandler(async (req, res) => {
  const { name_zh, name_en, name_vi, sort_order, status } = req.body;
  const result = await query(
    'INSERT INTO term_category (name_zh, name_en, name_vi, sort_order, status) VALUES (:name_zh, :name_en, :name_vi, :sort_order, :status)',
    { name_zh, name_en, name_vi, sort_order, status }
  );
  await logOperation({ req, module: 'terms', action: 'create-category', detail: `新增分类 ${name_zh}` });
  res.status(201).json({ id: result.insertId });
}));

termsRouter.put('/categories/:id', editor, asyncHandler(async (req, res) => {
  await query(
    'UPDATE term_category SET name_zh=:name_zh, name_en=:name_en, name_vi=:name_vi, sort_order=:sort_order, status=:status WHERE id=:id',
    { ...req.body, id: req.params.id }
  );
  await logOperation({ req, module: 'terms', action: 'update-category', detail: `更新分类 id=${req.params.id}` });
  res.json({ message: 'ok' });
}));

termsRouter.delete('/categories/:id', editor, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const used = await query('SELECT COUNT(*) AS count FROM railway_term WHERE category_id = :id', { id });
  if (used[0].count > 0) {
    return res.status(400).json({ message: `该分类下还有 ${used[0].count} 条术语，无法删除` });
  }
  await query('DELETE FROM term_category WHERE id = :id', { id });
  await logOperation({ req, module: 'terms', action: 'delete-category', detail: `删除分类 id=${id}` });
  res.json({ message: 'ok' });
}));

/* ------------------------------- 术语 ------------------------------- */

function buildTermFilter(q) {
  const keyword = (q.keyword || '').trim();
  return {
    params: {
      keyword: `%${keyword}%`,
      categoryId: q.categoryId ? Number(q.categoryId) : null,
      difficulty: q.difficulty || null,
      status: q.status || null
    },
    where: `WHERE (:categoryId IS NULL OR t.category_id = :categoryId)
       AND (:difficulty IS NULL OR t.difficulty = :difficulty)
       AND (:status IS NULL OR t.status = :status)
       AND (:keyword = '%%' OR t.term_zh LIKE :keyword OR t.term_en LIKE :keyword
            OR t.term_vi LIKE :keyword OR t.pinyin LIKE :keyword)`
  };
}

termsRouter.get('/', asyncHandler(async (req, res) => {
  const { page, pageSize, limit, offset } = getPagination(req.query);
  const { params, where } = buildTermFilter(req.query);
  Object.assign(params, { limit, offset });

  const total = await query(
    `SELECT COUNT(*) AS count FROM railway_term t JOIN term_category c ON t.category_id = c.id ${where}`,
    params
  );
  const rows = await query(
    `SELECT t.*, c.name_zh AS category_zh, c.name_en AS category_en, c.name_vi AS category_vi
     FROM railway_term t JOIN term_category c ON t.category_id = c.id
     ${where}
     ORDER BY t.updated_at DESC, t.id DESC
     LIMIT ${limit} OFFSET ${offset}`,
    params
  );
  res.json(paged(rows, total[0].count, page, pageSize));
}));

termsRouter.post('/', editor, asyncHandler(async (req, res) => {
  const data = { ...req.body, created_by: req.user.id };
  const result = await query(
    `INSERT INTO railway_term
     (category_id, term_zh, term_en, term_vi, pinyin, difficulty, definition_zh, definition_en, definition_vi, example_zh, example_en, example_vi, status, created_by)
     VALUES (:category_id, :term_zh, :term_en, :term_vi, :pinyin, :difficulty, :definition_zh, :definition_en, :definition_vi, :example_zh, :example_en, :example_vi, :status, :created_by)`,
    data
  );
  await logOperation({ req, module: 'terms', action: 'create', detail: `新增术语 ${data.term_zh}` });
  res.status(201).json({ id: result.insertId });
}));

/** 批量启停用。放在 /:id 之前注册，否则会被 /:id 捕获。 */
termsRouter.put('/batch/status', editor, validateBody(z.object({
  ids: z.array(z.coerce.number().int().positive()).min(1, '请选择至少一条术语').max(500),
  status: z.enum(['enabled', 'disabled'])
})), asyncHandler(async (req, res) => {
  const { ids, status } = req.body;
  const params = { status };
  const keys = ids.map((id, i) => {
    params[`id${i}`] = id;
    return `:id${i}`;
  });
  await query(`UPDATE railway_term SET status = :status WHERE id IN (${keys.join(',')})`, params);
  await logOperation({ req, module: 'terms', action: 'batch-status', detail: `批量${status === 'enabled' ? '启用' : '停用'} ${ids.length} 条术语` });
  res.json({ message: 'ok', count: ids.length });
}));

termsRouter.put('/:id', editor, asyncHandler(async (req, res) => {
  await query(
    `UPDATE railway_term SET category_id=:category_id, term_zh=:term_zh, term_en=:term_en, term_vi=:term_vi,
     pinyin=:pinyin, difficulty=:difficulty, definition_zh=:definition_zh, definition_en=:definition_en, definition_vi=:definition_vi,
     example_zh=:example_zh, example_en=:example_en, example_vi=:example_vi, status=:status WHERE id=:id`,
    { ...req.body, id: req.params.id }
  );
  await logOperation({ req, module: 'terms', action: 'update', detail: `更新术语 id=${req.params.id}` });
  res.json({ message: 'ok' });
}));

termsRouter.delete('/:id', editor, asyncHandler(async (req, res) => {
  await query('DELETE FROM railway_term WHERE id = :id', { id: req.params.id });
  await logOperation({ req, module: 'terms', action: 'delete', detail: `删除术语 id=${req.params.id}` });
  res.json({ message: 'ok' });
}));

termsRouter.post('/:id/favorite', asyncHandler(async (req, res) => {
  await query('INSERT IGNORE INTO favorite_term (user_id, term_id) VALUES (:userId, :termId)', {
    userId: req.user.id, termId: req.params.id
  });
  res.json({ message: 'ok' });
}));

termsRouter.delete('/:id/favorite', asyncHandler(async (req, res) => {
  await query('DELETE FROM favorite_term WHERE user_id = :userId AND term_id = :termId', {
    userId: req.user.id, termId: req.params.id
  });
  res.json({ message: 'ok' });
}));
