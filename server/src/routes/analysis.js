import { Router } from 'express';
import { authRequired, requireRole } from '../middleware/auth.js';
import { query } from '../db/pool.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const analysisRouter = Router();
analysisRouter.use(authRequired);

analysisRouter.get('/student', asyncHandler(async (req, res) => {
  // 学员只能看自己；教师/管理员可以按 userId 查看他人
  const isStaff = ['admin', 'teacher'].includes(req.user.role_code);
  const userId = isStaff && req.query.userId ? Number(req.query.userId) : req.user.id;

  const summary = await query(
    `SELECT COUNT(*) AS practice_count,
            COALESCE(SUM(total_count),0) AS answer_count,
            COALESCE(SUM(correct_count),0) AS correct_count,
            COALESCE(ROUND(AVG(score),2),0) AS avg_score
     FROM practice_record WHERE user_id = :userId`,
    { userId }
  );
  const wrong = await query('SELECT COUNT(*) AS wrong_count FROM wrong_question WHERE user_id = :userId', { userId });
  const favorite = await query('SELECT COUNT(*) AS favorite_count FROM favorite_term WHERE user_id = :userId', { userId });
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
  res.json({
    summary: {
      ...summary[0],
      wrong_count: wrong[0].wrong_count,
      favorite_count: favorite[0].favorite_count
    },
    trend: trend.reverse(),
    category
  });
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

/** 数据看板：全站统计。教师及以上可见。 */
analysisRouter.get('/dashboard', requireRole('admin', 'teacher'), asyncHandler(async (req, res) => {
  const days = Math.min(Math.max(Number(req.query.days || 14), 7), 90);

  const [summary, userGrowth, practiceTrend, categoryDist, topWrong, agentUsage, roleDist] = await Promise.all([
    query(`SELECT
        (SELECT COUNT(*) FROM sys_user) AS users,
        (SELECT COUNT(*) FROM sys_user WHERE status = 'enabled') AS active_users,
        (SELECT COUNT(*) FROM railway_term) AS terms,
        (SELECT COUNT(*) FROM term_category) AS categories,
        (SELECT COUNT(*) FROM practice_record) AS practices,
        (SELECT COALESCE(ROUND(AVG(score),2),0) FROM practice_record) AS avg_score,
        (SELECT COUNT(*) FROM agent_session) AS agent_sessions,
        (SELECT COUNT(*) FROM agent_message) AS agent_messages,
        (SELECT COUNT(*) FROM sys_login_log WHERE created_at >= now() - (${days} * INTERVAL '1 day')) AS recent_logins`),
    query(`SELECT DATE(created_at) AS date, COUNT(*) AS count
           FROM sys_user WHERE created_at >= now() - (${days} * INTERVAL '1 day')
           GROUP BY DATE(created_at) ORDER BY date`),
    query(`SELECT DATE(created_at) AS date, COUNT(*) AS count, COALESCE(ROUND(AVG(score),2),0) AS score
           FROM practice_record WHERE created_at >= now() - (${days} * INTERVAL '1 day')
           GROUP BY DATE(created_at) ORDER BY date`),
    query(`SELECT c.name_zh, c.name_en, c.name_vi, COUNT(t.id) AS term_count
           FROM term_category c LEFT JOIN railway_term t ON t.category_id = c.id
           GROUP BY c.id ORDER BY term_count DESC`),
    query(`SELECT t.term_zh, t.term_vi, t.term_en, SUM(w.wrong_count) AS wrong_count, COUNT(DISTINCT w.user_id) AS user_count
           FROM wrong_question w JOIN railway_term t ON w.term_id = t.id
           GROUP BY t.id ORDER BY wrong_count DESC LIMIT 10`),
    query(`SELECT DATE(m.created_at) AS date, COUNT(*) AS count,
                  COALESCE(SUM(m.tokens),0) AS tokens
           FROM agent_message m WHERE m.role = 'assistant'
             AND m.created_at >= now() - (${days} * INTERVAL '1 day')
           GROUP BY DATE(m.created_at) ORDER BY date`),
    query(`SELECT r.code, r.name_zh, COUNT(u.id) AS user_count
           FROM sys_role r LEFT JOIN sys_user u ON u.role_id = r.id
           GROUP BY r.id ORDER BY r.id`)
  ]);

  const difficulty = await query(
    `SELECT difficulty, COUNT(*) AS count FROM railway_term GROUP BY difficulty`
  );

  res.json({
    days,
    summary: summary[0],
    userGrowth,
    practiceTrend,
    categoryDist,
    topWrong,
    agentUsage,
    roleDist,
    difficulty
  });
}));
