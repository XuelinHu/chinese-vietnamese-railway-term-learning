import { Router } from 'express';
import { authRequired } from '../middleware/auth.js';
import { query } from '../db/pool.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { getPagination, paged } from '../utils/pagination.js';

export const practiceRouter = Router();
practiceRouter.use(authRequired);

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

practiceRouter.get('/records', asyncHandler(async (req, res) => {
  const { page, pageSize, limit, offset } = getPagination(req.query);
  const total = await query('SELECT COUNT(*) AS count FROM practice_record WHERE user_id = :userId', { userId: req.user.id });
  const rows = await query(`SELECT * FROM practice_record WHERE user_id = :userId ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`, {
    userId: req.user.id
  });
  res.json(paged(rows, total[0].count, page, pageSize));
}));

practiceRouter.get('/wrong-questions', asyncHandler(async (req, res) => {
  const { page, pageSize, limit, offset } = getPagination(req.query);
  const total = await query('SELECT COUNT(*) AS count FROM wrong_question WHERE user_id = :userId', { userId: req.user.id });
  const rows = await query(
    `SELECT w.*, t.term_zh, t.term_en, t.term_vi, t.definition_zh, c.name_zh AS category_zh
     FROM wrong_question w
     JOIN railway_term t ON w.term_id = t.id
     JOIN term_category c ON t.category_id = c.id
     WHERE w.user_id = :userId
     ORDER BY w.last_wrong_at DESC
     LIMIT ${limit} OFFSET ${offset}`,
    { userId: req.user.id }
  );
  res.json(paged(rows, total[0].count, page, pageSize));
}));
