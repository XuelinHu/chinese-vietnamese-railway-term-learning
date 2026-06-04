const BASE_URL = process.env.BASE_URL || 'http://localhost:3000/api';

async function http(path, options = {}, token = '') {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(`${options.method || 'GET'} ${path} failed: ${response.status} ${data.message || text}`);
  }
  return data;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertPage(data, page, pageSize, minTotal, name) {
  assert(Array.isArray(data.rows), `${name} rows missing`);
  assert(data.page === page, `${name} page mismatch`);
  assert(data.pageSize === pageSize, `${name} pageSize mismatch`);
  assert(data.total >= minTotal, `${name} total below ${minTotal}`);
  assert(data.rows.length <= pageSize, `${name} returned too many rows`);
}

async function main() {
  const health = await http('/health');
  assert(health.status === 'ok', 'health check failed');

  const login = await http('/auth/login', {
    method: 'POST',
    body: { username: 'admin', password: 'admin123' }
  });
  assert(login.token, 'login token missing');
  const token = login.token;

  const profile = await http('/auth/profile', {}, token);
  assert(profile.username === 'admin', 'profile mismatch');

  const categoryPage = await http('/terms/categories?page=2&pageSize=10', {}, token);
  assertPage(categoryPage, 2, 10, 100, 'categories pagination');
  const categories = await http('/terms/categories', {}, token);
  assert(categories.length >= 100, 'category rows below 100');

  const category = await http('/terms/categories', {
    method: 'POST',
    body: {
      name_zh: `接口测试分类${Date.now()}`,
      name_en: 'API Test Category',
      name_vi: 'Danh mục kiểm thử API',
      sort_order: 9999,
      status: 'enabled'
    }
  }, token);
  await http(`/terms/categories/${category.id}`, {
    method: 'PUT',
    body: {
      name_zh: `接口测试分类更新${Date.now()}`,
      name_en: 'API Test Category Updated',
      name_vi: 'Danh mục kiểm thử API cập nhật',
      sort_order: 9999,
      status: 'enabled'
    }
  }, token);

  const terms = await http('/terms?page=2&pageSize=10', {}, token);
  assertPage(terms, 2, 10, 100, 'terms pagination');

  const term = await http('/terms', {
    method: 'POST',
    body: {
      category_id: categories[0].id,
      term_zh: `接口测试术语${Date.now()}`,
      term_en: 'api test term',
      term_vi: 'thuật ngữ kiểm thử api',
      pinyin: 'jie kou ce shi shu yu',
      difficulty: 'easy',
      definition_zh: '接口测试中文释义',
      definition_en: 'API test English definition',
      definition_vi: 'Định nghĩa tiếng Việt kiểm thử API',
      example_zh: '接口测试示例句',
      example_en: 'API test example',
      example_vi: 'Ví dụ kiểm thử API',
      status: 'enabled'
    }
  }, token);
  await http(`/terms/${term.id}`, {
    method: 'PUT',
    body: {
      category_id: categories[0].id,
      term_zh: `接口测试术语更新${Date.now()}`,
      term_en: 'api test term updated',
      term_vi: 'thuật ngữ kiểm thử api cập nhật',
      pinyin: 'jie kou ce shi shu yu',
      difficulty: 'medium',
      definition_zh: '接口测试中文释义更新',
      definition_en: 'API test English definition updated',
      definition_vi: 'Định nghĩa tiếng Việt kiểm thử API cập nhật',
      example_zh: '接口测试示例句更新',
      example_en: 'API test example updated',
      example_vi: 'Ví dụ kiểm thử API cập nhật',
      status: 'enabled'
    }
  }, token);
  await http(`/terms/${term.id}/favorite`, { method: 'POST' }, token);
  await http(`/terms/${term.id}`, { method: 'DELETE' }, token);
  await http(`/terms/categories/${category.id}`, { method: 'DELETE' }, token);

  const practice = await http('/practice/start', {
    method: 'POST',
    body: { type: 'choice', count: 5, categoryId: null, difficulty: null }
  }, token);
  assert(practice.questions.length > 0, 'practice question generation failed');
  const result = await http('/practice/submit', {
    method: 'POST',
    body: {
      type: 'choice',
      categoryId: null,
      difficulty: null,
      answers: practice.questions.map((question) => ({
        ...question,
        userAnswer: question.correctAnswer
      }))
    }
  }, token);
  assert(Number(result.score) === 100, 'practice scoring failed');

  const records = await http('/practice/records?page=1&pageSize=10', {}, token);
  assertPage(records, 1, 10, 1, 'practice records pagination');
  const wrongPage = await http('/practice/wrong-questions?page=1&pageSize=10', {}, token);
  assertPage(wrongPage, 1, 10, 1, 'wrong questions pagination');

  const studentAnalysis = await http('/analysis/student', {}, token);
  assert(studentAnalysis.summary, 'student analysis missing');
  const adminAnalysis = await http('/analysis/admin', {}, token);
  assert(adminAnalysis.summary, 'admin analysis missing');

  const users = await http('/system/users?page=2&pageSize=10', {}, token);
  assertPage(users, 2, 10, 100, 'users pagination');
  const roles = await http('/system/roles?page=2&pageSize=10', {}, token);
  assertPage(roles, 2, 10, 100, 'roles pagination');
  const loginLogs = await http('/system/logs/login?page=2&pageSize=10', {}, token);
  assertPage(loginLogs, 2, 10, 100, 'login logs pagination');
  const operationLogs = await http('/system/logs/operation?page=2&pageSize=10', {}, token);
  assertPage(operationLogs, 2, 10, 100, 'operation logs pagination');

  console.log('Smoke test passed: auth, paginated terms/categories/users/roles/logs/practice, analysis.');
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
