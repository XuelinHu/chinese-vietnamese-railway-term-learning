import { Router } from 'express';
import { authRequired } from '../middleware/auth.js';
import { query } from '../db/pool.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const analysisRouter = Router();
analysisRouter.use(authRequired);

analysisRouter.get('/student', asyncHandler(async (req, res) => {
  const userId = req.query.userId || req.user.id;
  const summary = await query(
    `SELECT COUNT(*) AS practice_count,
            COALESCE(SUM(total_count),0) AS answer_count,
            COALESCE(SUM(correct_count),0) AS correct_count,
            COALESCE(ROUND(AVG(score),2),0) AS avg_score
     FROM practice_record WHERE user_id = :userId`,
    { userId }
  );
  const wrong = await query('SELECT COUNT(*) AS wrong_count FROM wrong_question WHERE user_id = :userId', { userId });
  const trend = await query(
    `SELECT DATE(created_at) AS date, COUNT(*) AS count, ROUND(AVG(score),2) AS score
     FROM practice_record WHERE user_id = :userId GROUP BY DATE(created_at) ORDER BY date DESC LIMIT 14`,
    { userId }
  );
  const category = await query(
    `SELECT c.name_zh, c.name_en, c.name_vi, ROUND(AVG(r.score),2) AS score, COUNT(*) AS count
     FROM practice_record r JOIN term_category c ON r.category_id = c.id
     WHERE r.user_id = :userId AND r.category_id IS NOT NULL
     GROUP BY c.id ORDER BY score DESC`,
    { userId }
  );
  res.json({ summary: { ...summary[0], wrong_count: wrong[0].wrong_count }, trend: trend.reverse(), category });
}));

analysisRouter.get('/admin', asyncHandler(async (req, res) => {
  const users = await query('SELECT COUNT(*) AS count FROM sys_user');
  const terms = await query('SELECT COUNT(*) AS count FROM railway_term');
  const practices = await query('SELECT COUNT(*) AS count, COALESCE(ROUND(AVG(score),2),0) AS avg_score FROM practice_record');
  const wrongTerms = await query(
    `SELECT t.term_zh, t.term_vi, SUM(w.wrong_count) AS wrong_count
     FROM wrong_question w JOIN railway_term t ON w.term_id = t.id
     GROUP BY t.id ORDER BY wrong_count DESC LIMIT 8`
  );
  const categories = await query(
    `SELECT c.name_zh, COUNT(t.id) AS term_count
     FROM term_category c LEFT JOIN railway_term t ON c.id = t.category_id
     GROUP BY c.id ORDER BY c.sort_order`
  );
  res.json({
    summary: {
      users: users[0].count,
      terms: terms[0].count,
      practices: practices[0].count,
      avg_score: practices[0].avg_score
    },
    wrongTerms,
    categories
  });
}));
