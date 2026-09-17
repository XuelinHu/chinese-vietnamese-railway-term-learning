import { Router } from 'express';
import { authRequired, requireRole } from '../middleware/auth.js';
import { query } from '../db/pool.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { getPagination, paged } from '../utils/pagination.js';
import { logOperation } from '../services/audit.js';

export const practiceRouter = Router();
practiceRouter.use(authRequired);

const staff = requireRole('admin', 'teacher');

function shuffle(items) {
  return [...items].sort(() => Math.random() - 0.5);
}

function buildQuestion(term, allTerms, type) {
  if (type === 'judge') {
    const shouldBeTrue = Math.random() > 0.35;
    const other = shuffle(allTerms.filter((item) => item.id !== term.id))[0] || term;
    return {
      termId: term.id,
      type,
      questionText: `${term.term_zh} = ${shouldBeTrue ? term.term_vi : other.term_vi}`,
      options: ['true', 'false'],
      correctAnswer: shouldBeTrue ? 'true' : 'false',
      explanation: term.definition_zh
    };
  }
  if (type === 'fill') {
    return {
      termId: term.id,
      type,
      questionText: `请填写中文术语“${term.term_zh}”对应的越南语翻译。`,
      options: [],
      correctAnswer: term.term_vi,
      explanation: term.definition_vi
    };
  }
  if (type === 'translate') {
    return {
      termId: term.id,
      type,
      questionText: `请翻译：${term.term_vi}`,
      options: [],
      correctAnswer: term.term_zh,
      explanation: term.definition_zh
    };
  }
  const options = shuffle([term, ...shuffle(allTerms.filter((item) => item.id !== term.id)).slice(0, 3)])
    .map((item) => item.term_vi);
  return {
    termId: term.id,
    type: 'choice',
    questionText: `“${term.term_zh}” 的越南语翻译是？`,
    options,
    correctAnswer: term.term_vi,
    explanation: term.definition_zh
  };
}

practiceRouter.post('/start', asyncHandler(async (req, res) => {
  const { categoryId = null, difficulty = null, count = 5, type = 'choice' } = req.body;
  const allTerms = await query(
    `SELECT * FROM railway_term
     WHERE status = 'enabled'
       AND (:categoryId IS NULL OR category_id = :categoryId)
       AND (:difficulty IS NULL OR difficulty = :difficulty)`,
    { categoryId, difficulty }
  );
  const selected = shuffle(allTerms).slice(0, Number(count));
  res.json({
    questions: selected.map((term) => buildQuestion(term, allTerms, type)),
    total: selected.length
  });
}));

practiceRouter.post('/submit', asyncHandler(async (req, res) => {
  const { type = 'choice', categoryId = null, difficulty = null, answers = [], durationSeconds = 0 } = req.body;
  let correct = 0;
  const normalized = answers.map((item) => {
    const isCorrect = String(item.userAnswer || '').trim().toLowerCase() === String(item.correctAnswer || '').trim().toLowerCase();
    if (isCorrect) correct += 1;
    return { ...item, isCorrect };
  });
  const score = normalized.length ? Number(((correct / normalized.length) * 100).toFixed(2)) : 0;
  const result = await query(
    `INSERT INTO practice_record (user_id, practice_type, category_id, difficulty, total_count, correct_count, score, duration_seconds)
     VALUES (:userId, :type, :categoryId, :difficulty, :total, :correct, :score, :durationSeconds)`,
    { userId: req.user.id, type, categoryId, difficulty, total: normalized.length, correct, score, durationSeconds }
  );
  for (const answer of normalized) {
    await query(
      `INSERT INTO practice_answer (record_id, term_id, question_type, question_text, user_answer, correct_answer, is_correct)
       VALUES (:recordId, :termId, :questionType, :questionText, :userAnswer, :correctAnswer, :isCorrect)`,
      {
        recordId: result.insertId,
        termId: answer.termId,
        questionType: answer.type,
        questionText: answer.questionText,
        userAnswer: answer.userAnswer,
        correctAnswer: answer.correctAnswer,
        isCorrect: answer.isCorrect ? 1 : 0
      }
    );
    if (!answer.isCorrect) {
      await query(
        `INSERT INTO wrong_question (user_id, term_id, wrong_count)
         VALUES (:userId, :termId, 1)
         ON DUPLICATE KEY UPDATE wrong_count = wrong_count + 1, last_wrong_at = CURRENT_TIMESTAMP`,
        { userId: req.user.id, termId: answer.termId }
      );
    }
  }
  res.json({ recordId: result.insertId, total: normalized.length, correct, score, answers: normalized });
}));

/**
 * 练习记录分页查询。
 * 教师/管理员可用 userId 查任意学员，普通用户只能看自己（忽略传入的 userId）。
 */
practiceRouter.get('/records', asyncHandler(async (req, res) => {
  const { page, pageSize, limit, offset } = getPagination(req.query);
  const isStaff = ['admin', 'teacher'].includes(req.user.role_code);
  const userId = isStaff && req.query.userId ? Number(req.query.userId) : (isStaff ? null : req.user.id);
  const keyword = (req.query.keyword || '').trim();
  const type = req.query.practiceType || null;
  const categoryId = req.query.categoryId ? Number(req.query.categoryId) : null;
  const from = req.query.from || null;
  const to = req.query.to || null;

  const params = { userId, type, categoryId, from, to, keyword: `%${keyword}%`, limit, offset };
  const where = `WHERE (:userId IS NULL OR r.user_id = :userId)
       AND (:type IS NULL OR r.practice_type = :type)
       AND (:categoryId IS NULL OR r.category_id = :categoryId)
       AND (:from IS NULL OR r.created_at >= :from)
       AND (:to IS NULL OR r.created_at <= :to)
       AND (:keyword = '%%' OR u.username LIKE :keyword OR u.real_name LIKE :keyword)`;

  const total = await query(
    `SELECT COUNT(*) AS count FROM practice_record r JOIN sys_user u ON u.id = r.user_id ${where}`,
    params
  );
  const rows = await query(
    `SELECT r.*, u.username, u.real_name, c.name_zh AS category_zh
     FROM practice_record r
     JOIN sys_user u ON u.id = r.user_id
     LEFT JOIN term_category c ON c.id = r.category_id
     ${where}
     ORDER BY r.id DESC LIMIT ${limit} OFFSET ${offset}`,
    params
  );
  res.json(paged(rows, total[0].count, page, pageSize));
}));

/** 单条记录的答题明细。 */
practiceRouter.get('/records/:id/answers', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const isStaff = ['admin', 'teacher'].includes(req.user.role_code);
  const owner = await query('SELECT user_id FROM practice_record WHERE id = :id', { id });
  if (!owner.length) return res.status(404).json({ message: '记录不存在' });
  if (!isStaff && owner[0].user_id !== req.user.id) return res.status(403).json({ message: '无权访问' });

  const { page, pageSize, limit, offset } = getPagination(req.query);
  const total = await query('SELECT COUNT(*) AS count FROM practice_answer WHERE record_id = :id', { id });
  const rows = await query(
    `SELECT a.*, t.term_zh, t.term_vi, t.term_en
     FROM practice_answer a LEFT JOIN railway_term t ON t.id = a.term_id
     WHERE a.record_id = :id ORDER BY a.id LIMIT ${limit} OFFSET ${offset}`,
    { id }
  );
  res.json(paged(rows, total[0].count, page, pageSize));
}));

practiceRouter.delete('/records/:id', staff, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  await query('DELETE FROM practice_answer WHERE record_id = :id', { id });
  await query('DELETE FROM practice_record WHERE id = :id', { id });
  await logOperation({ req, module: 'practice', action: 'delete-record', detail: `删除练习记录 id=${id}` });
  res.json({ message: 'ok' });
}));

/** 错题本。教师/管理员可查任意学员。 */
practiceRouter.get('/wrong-questions', asyncHandler(async (req, res) => {
  const { page, pageSize, limit, offset } = getPagination(req.query);
  const isStaff = ['admin', 'teacher'].includes(req.user.role_code);
  const userId = isStaff && req.query.userId ? Number(req.query.userId) : (isStaff ? null : req.user.id);
  const keyword = (req.query.keyword || '').trim();
  const categoryId = req.query.categoryId ? Number(req.query.categoryId) : null;

  const params = { userId, categoryId, keyword: `%${keyword}%`, limit, offset };
  const where = `WHERE (:userId IS NULL OR w.user_id = :userId)
       AND (:categoryId IS NULL OR t.category_id = :categoryId)
       AND (:keyword = '%%' OR t.term_zh LIKE :keyword OR t.term_vi LIKE :keyword
            OR t.term_en LIKE :keyword OR u.username LIKE :keyword)`;

  const total = await query(
    `SELECT COUNT(*) AS count FROM wrong_question w
     JOIN railway_term t ON w.term_id = t.id
     JOIN sys_user u ON u.id = w.user_id ${where}`,
    params
  );
  const rows = await query(
    `SELECT w.*, t.term_zh, t.term_en, t.term_vi, t.definition_zh,
            c.name_zh AS category_zh, u.username, u.real_name
     FROM wrong_question w
     JOIN railway_term t ON w.term_id = t.id
     JOIN term_category c ON t.category_id = c.id
     JOIN sys_user u ON u.id = w.user_id
     ${where}
     ORDER BY w.last_wrong_at DESC LIMIT ${limit} OFFSET ${offset}`,
    params
  );
  res.json(paged(rows, total[0].count, page, pageSize));
}));

practiceRouter.delete('/wrong-questions/:id', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const isStaff = ['admin', 'teacher'].includes(req.user.role_code);
  const owner = await query('SELECT user_id FROM wrong_question WHERE id = :id', { id });
  if (!owner.length) return res.status(404).json({ message: '记录不存在' });
  if (!isStaff && owner[0].user_id !== req.user.id) return res.status(403).json({ message: '无权删除' });

  await query('DELETE FROM wrong_question WHERE id = :id', { id });
  res.json({ message: 'ok' });
}));

/** 收藏夹。教师/管理员可查任意学员。 */
practiceRouter.get('/favorites', asyncHandler(async (req, res) => {
  const { page, pageSize, limit, offset } = getPagination(req.query);
  const isStaff = ['admin', 'teacher'].includes(req.user.role_code);
  const userId = isStaff && req.query.userId ? Number(req.query.userId) : (isStaff ? null : req.user.id);
  const keyword = (req.query.keyword || '').trim();
  const categoryId = req.query.categoryId ? Number(req.query.categoryId) : null;

  const params = { userId, categoryId, keyword: `%${keyword}%`, limit, offset };
  const where = `WHERE (:userId IS NULL OR f.user_id = :userId)
       AND (:categoryId IS NULL OR t.category_id = :categoryId)
       AND (:keyword = '%%' OR t.term_zh LIKE :keyword OR t.term_vi LIKE :keyword
            OR t.term_en LIKE :keyword OR u.username LIKE :keyword)`;

  const total = await query(
    `SELECT COUNT(*) AS count FROM favorite_term f
     JOIN railway_term t ON f.term_id = t.id
     JOIN sys_user u ON u.id = f.user_id ${where}`,
    params
  );
  const rows = await query(
    `SELECT f.*, t.term_zh, t.term_en, t.term_vi, t.difficulty,
            c.name_zh AS category_zh, u.username, u.real_name
     FROM favorite_term f
     JOIN railway_term t ON f.term_id = t.id
     JOIN term_category c ON t.category_id = c.id
     JOIN sys_user u ON u.id = f.user_id
     ${where}
     ORDER BY f.id DESC LIMIT ${limit} OFFSET ${offset}`,
    params
  );
  res.json(paged(rows, total[0].count, page, pageSize));
}));

practiceRouter.delete('/favorites/:id', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const isStaff = ['admin', 'teacher'].includes(req.user.role_code);
  const owner = await query('SELECT user_id FROM favorite_term WHERE id = :id', { id });
  if (!owner.length) return res.status(404).json({ message: '记录不存在' });
  if (!isStaff && owner[0].user_id !== req.user.id) return res.status(403).json({ message: '无权删除' });

  await query('DELETE FROM favorite_term WHERE id = :id', { id });
  res.json({ message: 'ok' });
}));
