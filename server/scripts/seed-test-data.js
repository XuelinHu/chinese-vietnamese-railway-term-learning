import bcrypt from 'bcryptjs';
import { initializeDatabase } from '../src/db/init.js';
import { getPool, query } from '../src/db/pool.js';

const MIN_ROWS = 100;

const zhTerms = ['铁路', '车站', '钢轨', '道岔', '机车', '客车', '信号机', '闭塞', '调度命令', '列车运行图'];
const viTerms = ['đường sắt', 'nhà ga', 'ray thép', 'ghi đường sắt', 'đầu máy', 'toa khách', 'tín hiệu', 'đóng đường', 'mệnh lệnh điều độ', 'biểu đồ chạy tàu'];
const enTerms = ['railway', 'station', 'rail', 'turnout', 'locomotive', 'coach', 'signal', 'block system', 'dispatching order', 'train diagram'];
const modules = ['auth', 'terms', 'practice', 'analysis', 'system'];
const actions = ['create', 'update', 'delete', 'query', 'export'];

function pad(num) {
  return String(num).padStart(3, '0');
}

async function count(table) {
  const rows = await query(`SELECT COUNT(*) AS count FROM ${table}`);
  return Number(rows[0].count);
}

async function ensureRoles() {
  for (let i = 1; i <= MIN_ROWS; i += 1) {
    await query(
      `INSERT IGNORE INTO sys_role (code, name_zh, name_en, name_vi)
       VALUES (:code, :zh, :en, :vi)`,
      {
        code: `role_${pad(i)}`,
        zh: `测试角色${pad(i)}`,
        en: `Test Role ${pad(i)}`,
        vi: `Vai trò kiểm thử ${pad(i)}`
      }
    );
  }
}

async function ensureUsers() {
  const hash = await bcrypt.hash('test123456', 10);
  const roles = await query('SELECT id FROM sys_role ORDER BY id LIMIT 100');
  for (let i = 1; i <= MIN_ROWS; i += 1) {
    await query(
      `INSERT IGNORE INTO sys_user (username, password_hash, real_name, email, role_id, status)
       VALUES (:username, :hash, :realName, :email, :roleId, 'enabled')`,
      {
        username: `test_user_${pad(i)}`,
        hash,
        realName: `测试用户${pad(i)}`,
        email: `test_user_${pad(i)}@example.com`,
        roleId: roles[(i - 1) % roles.length].id
      }
    );
  }
}

async function ensureCategories() {
  for (let i = 1; i <= MIN_ROWS; i += 1) {
    await query(
      `INSERT INTO term_category (name_zh, name_en, name_vi, sort_order, status)
       SELECT :zh, :en, :vi, :sortOrder, 'enabled'
       WHERE NOT EXISTS (SELECT 1 FROM term_category WHERE name_zh = :zh)`,
      {
        zh: `测试分类${pad(i)}`,
        en: `Test Category ${pad(i)}`,
        vi: `Danh mục kiểm thử ${pad(i)}`,
        sortOrder: 1000 + i
      }
    );
  }
}

async function ensureTerms() {
  const categories = await query('SELECT id FROM term_category ORDER BY id LIMIT 100');
  for (let i = 1; i <= MIN_ROWS; i += 1) {
    const idx = (i - 1) % zhTerms.length;
    await query(
      `INSERT INTO railway_term
       (category_id, term_zh, term_en, term_vi, pinyin, difficulty, definition_zh, definition_en, definition_vi,
        example_zh, example_en, example_vi, status, created_by)
       SELECT :categoryId, :zh, :en, :vi, :pinyin, :difficulty, :defZh, :defEn, :defVi, :exZh, :exEn, :exVi, 'enabled', 1
       WHERE NOT EXISTS (SELECT 1 FROM railway_term WHERE term_zh = :zh)`,
      {
        categoryId: categories[(i - 1) % categories.length].id,
        zh: `${zhTerms[idx]}测试${pad(i)}`,
        en: `${enTerms[idx]} test ${pad(i)}`,
        vi: `${viTerms[idx]} kiểm thử ${pad(i)}`,
        pinyin: `pin yin ${pad(i)}`,
        difficulty: ['easy', 'medium', 'hard'][(i - 1) % 3],
        defZh: `测试术语${pad(i)}的中文释义。`,
        defEn: `English definition for test term ${pad(i)}.`,
        defVi: `Định nghĩa tiếng Việt cho thuật ngữ kiểm thử ${pad(i)}.`,
        exZh: `这是测试术语${pad(i)}的示例句。`,
        exEn: `This is an example sentence for test term ${pad(i)}.`,
        exVi: `Đây là câu ví dụ cho thuật ngữ kiểm thử ${pad(i)}.`
      }
    );
  }
}

async function ensureLoginLogs() {
  for (let i = 1; i <= MIN_ROWS; i += 1) {
    await query(
      `INSERT INTO sys_login_log (username, ip, user_agent, success, message)
       SELECT :username, :ip, 'seed-test-agent', :success, :message
       WHERE (SELECT COUNT(*) FROM sys_login_log) < :minRows`,
      {
        username: `test_user_${pad(i)}`,
        ip: `192.168.1.${(i % 200) + 1}`,
        success: i % 7 === 0 ? 0 : 1,
        message: i % 7 === 0 ? '测试登录失败' : '测试登录成功',
        minRows: MIN_ROWS
      }
    );
  }
}

async function ensureOperationLogs() {
  for (let i = 1; i <= MIN_ROWS; i += 1) {
    await query(
      `INSERT INTO sys_operation_log (user_id, module, action, detail)
       SELECT :userId, :module, :action, :detail
       WHERE (SELECT COUNT(*) FROM sys_operation_log) < :minRows`,
      {
        userId: ((i - 1) % MIN_ROWS) + 1,
        module: modules[(i - 1) % modules.length],
        action: actions[(i - 1) % actions.length],
        detail: `测试操作日志${pad(i)}`,
        minRows: MIN_ROWS
      }
    );
  }
}

async function ensurePracticeRecords() {
  const categories = await query('SELECT id FROM term_category ORDER BY id LIMIT 100');
  for (let i = 1; i <= MIN_ROWS; i += 1) {
    const total = 5 + (i % 6);
    const correct = i % (total + 1);
    await query(
      `INSERT INTO practice_record (user_id, practice_type, category_id, difficulty, total_count, correct_count, score, duration_seconds)
       SELECT :userId, :type, :categoryId, :difficulty, :total, :correct, :score, :duration
       WHERE (SELECT COUNT(*) FROM practice_record) < :minRows`,
      {
        userId: ((i - 1) % MIN_ROWS) + 1,
        type: ['choice', 'judge', 'fill', 'translate'][(i - 1) % 4],
        categoryId: categories[(i - 1) % categories.length].id,
        difficulty: ['easy', 'medium', 'hard'][(i - 1) % 3],
        total,
        correct,
        score: Number(((correct / total) * 100).toFixed(2)),
        duration: 30 + i,
        minRows: MIN_ROWS
      }
    );
  }
}

async function ensurePracticeAnswers() {
  const records = await query('SELECT id FROM practice_record ORDER BY id LIMIT 100');
  const terms = await query('SELECT id, term_zh, term_vi FROM railway_term ORDER BY id LIMIT 100');
  for (let i = 1; i <= MIN_ROWS; i += 1) {
    const term = terms[(i - 1) % terms.length];
    const isCorrect = i % 4 !== 0;
    await query(
      `INSERT INTO practice_answer (record_id, term_id, question_type, question_text, user_answer, correct_answer, is_correct)
       SELECT :recordId, :termId, :type, :question, :userAnswer, :correctAnswer, :isCorrect
       WHERE (SELECT COUNT(*) FROM practice_answer) < :minRows`,
      {
        recordId: records[(i - 1) % records.length].id,
        termId: term.id,
        type: ['choice', 'judge', 'fill', 'translate'][(i - 1) % 4],
        question: `测试题目${pad(i)}：${term.term_zh}`,
        userAnswer: isCorrect ? term.term_vi : '错误答案',
        correctAnswer: term.term_vi,
        isCorrect: isCorrect ? 1 : 0,
        minRows: MIN_ROWS
      }
    );
  }
}

async function ensureWrongQuestions() {
  const terms = await query('SELECT id FROM railway_term ORDER BY id LIMIT 100');
  for (let i = 1; i <= MIN_ROWS; i += 1) {
    await query(
      `INSERT IGNORE INTO wrong_question (user_id, term_id, wrong_count)
       VALUES (:userId, :termId, :wrongCount)`,
      {
        userId: ((i - 1) % MIN_ROWS) + 1,
        termId: terms[(i - 1) % terms.length].id,
        wrongCount: (i % 5) + 1
      }
    );
  }
}

async function ensureFavorites() {
  const terms = await query('SELECT id FROM railway_term ORDER BY id LIMIT 100');
  for (let i = 1; i <= MIN_ROWS; i += 1) {
    await query(
      `INSERT IGNORE INTO favorite_term (user_id, term_id)
       VALUES (:userId, :termId)`,
      {
        userId: ((i - 1) % MIN_ROWS) + 1,
        termId: terms[(MIN_ROWS - i) % terms.length].id
      }
    );
  }
}

async function main() {
  await initializeDatabase();
  await ensureRoles();
  await ensureUsers();
  await ensureCategories();
  await ensureTerms();
  await ensureLoginLogs();
  await ensureOperationLogs();
  await ensurePracticeRecords();
  await ensurePracticeAnswers();
  await ensureWrongQuestions();
  await ensureFavorites();

  const tables = [
    'sys_role',
    'sys_user',
    'sys_login_log',
    'sys_operation_log',
    'term_category',
    'railway_term',
    'practice_record',
    'practice_answer',
    'wrong_question',
    'favorite_term'
  ];
  const rows = [];
  for (const table of tables) rows.push({ table, count: await count(table) });
  console.table(rows);
  const failures = rows.filter((row) => row.count < MIN_ROWS);
  await getPool().end();
  if (failures.length) {
    console.error('Tables below minimum rows:', failures);
    process.exit(1);
  }
}

main().catch(async (error) => {
  console.error(error);
  await getPool().end();
  process.exit(1);
});
