import { Router } from 'express';
import { authRequired, requireRole } from '../middleware/auth.js';
import { query } from '../db/pool.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { getPagination, paged } from '../utils/pagination.js';

export const termsRouter = Router();

termsRouter.use(authRequired);

termsRouter.get('/categories', asyncHandler(async (req, res) => {
  if (!req.query.page && !req.query.pageSize) {
    const rows = await query('SELECT * FROM term_category ORDER BY sort_order, id');
    return res.json(rows);
  }
  const { page, pageSize, limit, offset } = getPagination(req.query);
  const total = await query('SELECT COUNT(*) AS count FROM term_category');
  const rows = await query(`SELECT * FROM term_category ORDER BY sort_order, id LIMIT ${limit} OFFSET ${offset}`);
  res.json(paged(rows, total[0].count, page, pageSize));
}));

termsRouter.post('/categories', requireRole('admin', 'teacher'), asyncHandler(async (req, res) => {
  const { name_zh, name_en, name_vi, sort_order = 0, status = 'enabled' } = req.body;
  const result = await query(
    'INSERT INTO term_category (name_zh, name_en, name_vi, sort_order, status) VALUES (:name_zh, :name_en, :name_vi, :sort_order, :status)',
    { name_zh, name_en, name_vi, sort_order, status }
  );
  res.status(201).json({ id: result.insertId });
}));

termsRouter.put('/categories/:id', requireRole('admin', 'teacher'), asyncHandler(async (req, res) => {
  await query(
    'UPDATE term_category SET name_zh=:name_zh, name_en=:name_en, name_vi=:name_vi, sort_order=:sort_order, status=:status WHERE id=:id',
    { ...req.body, id: req.params.id }
  );
  res.json({ message: 'ok' });
}));

termsRouter.delete('/categories/:id', requireRole('admin', 'teacher'), asyncHandler(async (req, res) => {
  await query('DELETE FROM term_category WHERE id = :id', { id: req.params.id });
  res.json({ message: 'ok' });
}));

termsRouter.get('/', asyncHandler(async (req, res) => {
  const { keyword = '', categoryId, difficulty, status } = req.query;
  const { page, pageSize, limit, offset } = getPagination(req.query);
  const params = {
    keyword: `%${keyword}%`,
    categoryId: categoryId || null,
    difficulty: difficulty || null,
    status: status || null,
    limit,
    offset
  };
  const total = await query(
    `SELECT COUNT(*) AS count
     FROM railway_term t JOIN term_category c ON t.category_id = c.id
     WHERE (:categoryId IS NULL OR t.category_id = :categoryId)
       AND (:difficulty IS NULL OR t.difficulty = :difficulty)
       AND (:status IS NULL OR t.status = :status)
       AND (t.term_zh LIKE :keyword OR t.term_en LIKE :keyword OR t.term_vi LIKE :keyword OR t.pinyin LIKE :keyword)`,
    params
  );
  const rows = await query(
    `SELECT t.*, c.name_zh AS category_zh, c.name_en AS category_en, c.name_vi AS category_vi
     FROM railway_term t JOIN term_category c ON t.category_id = c.id
     WHERE (:categoryId IS NULL OR t.category_id = :categoryId)
       AND (:difficulty IS NULL OR t.difficulty = :difficulty)
       AND (:status IS NULL OR t.status = :status)
       AND (t.term_zh LIKE :keyword OR t.term_en LIKE :keyword OR t.term_vi LIKE :keyword OR t.pinyin LIKE :keyword)
     ORDER BY t.updated_at DESC, t.id DESC
     LIMIT ${limit} OFFSET ${offset}`,
    params
  );
  res.json(paged(rows, total[0].count, page, pageSize));
}));

termsRouter.post('/', requireRole('admin', 'teacher'), asyncHandler(async (req, res) => {
  const data = { ...req.body, created_by: req.user.id };
  const result = await query(
    `INSERT INTO railway_term
     (category_id, term_zh, term_en, term_vi, pinyin, difficulty, definition_zh, definition_en, definition_vi, example_zh, example_en, example_vi, status, created_by)
     VALUES (:category_id, :term_zh, :term_en, :term_vi, :pinyin, :difficulty, :definition_zh, :definition_en, :definition_vi, :example_zh, :example_en, :example_vi, :status, :created_by)`,
    data
  );
  await query('INSERT INTO sys_operation_log (user_id, module, action, detail) VALUES (:userId, "terms", "create", :detail)', {
    userId: req.user.id, detail: data.term_zh
  });
  res.status(201).json({ id: result.insertId });
}));

termsRouter.put('/:id', requireRole('admin', 'teacher'), asyncHandler(async (req, res) => {
  await query(
    `UPDATE railway_term SET category_id=:category_id, term_zh=:term_zh, term_en=:term_en, term_vi=:term_vi,
     pinyin=:pinyin, difficulty=:difficulty, definition_zh=:definition_zh, definition_en=:definition_en, definition_vi=:definition_vi,
     example_zh=:example_zh, example_en=:example_en, example_vi=:example_vi, status=:status WHERE id=:id`,
    { ...req.body, id: req.params.id }
  );
  res.json({ message: 'ok' });
}));

termsRouter.delete('/:id', requireRole('admin', 'teacher'), asyncHandler(async (req, res) => {
  await query('DELETE FROM railway_term WHERE id = :id', { id: req.params.id });
  res.json({ message: 'ok' });
}));

termsRouter.post('/:id/favorite', asyncHandler(async (req, res) => {
  await query('INSERT IGNORE INTO favorite_term (user_id, term_id) VALUES (:userId, :termId)', { userId: req.user.id, termId: req.params.id });
  res.json({ message: 'ok' });
}));
