const BASE_URL = process.env.BASE_URL || 'http://localhost:8031/api';

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

/**
 * 非 JSON 端点（SSE / 音频）专用。
 * 不能复用 http()：它硬编码 JSON 请求头、强制 JSON.stringify，并且无条件 JSON.parse。
 */
async function httpRaw(path, options = {}, token = '') {
  const headers = { ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${BASE_URL}${path}`, { ...options, headers });
  return response;
}

/** 收完一个 SSE 流，返回解析后的事件数组。 */
async function sseCollect(path, body, token) {
  const response = await httpRaw(
    path,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify(body ?? {})
    },
    token
  );
  if (!response.ok) throw new Error(`POST ${path} failed: ${response.status}`);
  const text = await response.text();
  return text
    .split(/\r?\n\r?\n/)
    .map((frame) => frame.split(/\r?\n/).filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trim()).join('\n'))
    .filter(Boolean)
    .map((raw) => {
      try {
        return JSON.parse(raw);
      } catch {
        return { raw };
      }
    });
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
  assertPage(categories, 1, 10, 100, 'categories default pagination');
  const categoryOptions = await http('/terms/categories/options?page=1&pageSize=10', {}, token);
  assertPage(categoryOptions, 1, 10, 100, 'category options pagination');
  assert(categoryOptions.rows.every((row) => row.id && row.name_zh), 'category options fields missing');

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

  /* ---------------- 公共服务全流程：注册 → 改密 → 找回密码 ---------------- */

  const stamp = Date.now();
  const tempUser = `smoke_${stamp}`;
  const tempEmail = `${tempUser}@example.com`;
  const passwordA = 'smoke123456';
  const passwordB = 'smoke654321';

  const registered = await http('/auth/register', {
    method: 'POST',
    body: { username: tempUser, password: passwordA, realName: '冒烟测试', email: tempEmail, phone: '13800000000' }
  });
  assert(registered.id || registered.token, 'register did not return id/token');

  const userLogin = await http('/auth/login', {
    method: 'POST',
    body: { username: tempUser, password: passwordA }
  });
  assert(userLogin.token, 'registered user cannot log in');
  assert(userLogin.user.roleCode === 'student', `new user should default to student, got ${userLogin.user.roleCode}`);
  const userToken = userLogin.token;

  // 注册即得学生菜单，且不含管理台入口
  const userMenus = await http('/auth/menus', {}, userToken);
  assert(Array.isArray(userMenus.menus) && userMenus.codes.length > 0, 'student menu tree missing');
  assert(!userMenus.codes.includes('admin.users'), 'student must not receive admin menus');

  // 个人资料读写
  await http('/auth/profile', {
    method: 'PUT',
    body: { realName: '冒烟测试改名', email: tempEmail, phone: '13900000000' }
  }, userToken);
  const updatedProfile = await http('/auth/profile', {}, userToken);
  assert(updatedProfile.realName === '冒烟测试改名', 'profile update did not persist');

  // 改密后旧密码必须失效
  await http('/auth/password', {
    method: 'PUT',
    body: { oldPassword: passwordA, newPassword: passwordB }
  }, userToken);
  await assertRejects(
    http('/auth/login', { method: 'POST', body: { username: tempUser, password: passwordA } }),
    'old password still works after change'
  );
  const relogin = await http('/auth/login', { method: 'POST', body: { username: tempUser, password: passwordB } });
  assert(relogin.token, 'cannot log in with the new password');

  // 找回密码：SMTP 未配置时后端会在非生产环境回显验证码
  const forgot = await http('/auth/forgot-password', {
    method: 'POST',
    body: { username: tempUser, email: tempEmail }
  });
  assert(forgot.message, 'forgot-password did not respond');
  assert(forgot.devCode, 'no devCode returned — set SMTP or run in non-production to smoke-test this flow');

  await http('/auth/reset-password', {
    method: 'POST',
    body: { username: tempUser, code: forgot.devCode, newPassword: passwordA }
  });
  const afterReset = await http('/auth/login', { method: 'POST', body: { username: tempUser, password: passwordA } });
  assert(afterReset.token, 'cannot log in after password reset');

  // 重置过的验证码不能再用
  await assertRejects(
    http('/auth/reset-password', {
      method: 'POST',
      body: { username: tempUser, code: forgot.devCode, newPassword: 'whatever123' }
    }),
    'a used reset code was accepted twice'
  );

  /* ---------------------- 管理台：每个菜单都要分页 ---------------------- */

  // 新建一个教师账号，验证「按角色下发菜单」而不是写死
  const teacherName = `smoke_t_${stamp}`;
  const studentRoleId = (await http('/system/roles/options', {}, token)).find((r) => r.code === 'student').id;
  const teacher = await http('/system/users', {
    method: 'POST',
    body: {
      username: teacherName,
      password: passwordA,
      realName: '冒烟教师',
      email: `${teacherName}@example.com`,
      phone: '',
      roleId: (await http('/system/roles/options', {}, token)).find((r) => r.code === 'teacher').id,
      status: 'enabled'
    }
  }, token);
  const teacherLogin = await http('/auth/login', { method: 'POST', body: { username: teacherName, password: passwordA } });
  const teacherMenus = await http('/auth/menus', {}, teacherLogin.token);
  assert(teacherMenus.codes.includes('admin.terms'), 'teacher should reach term management');
  assert(!teacherMenus.codes.includes('admin.users'), 'teacher must not reach user management');

  // 用户管理是「读放给 staff、写只给 admin」的既有设计：
  // GET /system/users 有意允许 teacher（备课要看学员名单），所以这里只断言写操作被挡住。
  await assertRejects(
    http('/system/users', {
      method: 'POST',
      body: { username: `nope_${stamp}`, password: passwordA, realName: 'x', email: `nope_${stamp}@example.com`, roleId: studentRoleId, status: 'enabled' }
    }, teacherLogin.token),
    'teacher was able to create a user'
  );
  await assertRejects(
    http(`/system/users/${teacher.id}`, { method: 'DELETE' }, teacherLogin.token),
    'teacher was able to delete a user'
  );

  const menuPage = await http('/system/menus?page=1&pageSize=10', {}, token);
  assertPage(menuPage, 1, 10, 10, 'menus pagination');

  const menuTree = await http('/system/menus/tree', {}, token);
  assert(Array.isArray(menuTree) && menuTree.length > 0, 'menu tree empty');
  assert(menuTree.some((node) => Array.isArray(node.children) && node.children.length), 'menu tree has no children');

  const rolesOptions = await http('/system/roles/options', {}, token);
  const studentRole = rolesOptions.find((r) => r.code === 'student');
  const grantedMenus = await http(`/system/roles/${studentRole.id}/menus`, {}, token);
  assert(Array.isArray(grantedMenus.menuIds) && grantedMenus.menuIds.length > 0, 'student role has no menus granted');

  const dashboard = await http('/analysis/dashboard', {}, token);
  assert(dashboard.summary, 'admin dashboard summary missing');

  // 术语批量启停（放在 /:id 之前注册的那个接口）
  const batchTerm = await http('/terms', {
    method: 'POST',
    body: {
      category_id: categories[0].id,
      term_zh: `冒烟批量术语${stamp}`,
      term_en: 'smoke batch term',
      term_vi: 'thuật ngữ hàng loạt',
      pinyin: 'mao yan pi liang',
      difficulty: 'easy',
      definition_zh: '批量测试',
      definition_en: 'batch test',
      definition_vi: 'kiểm thử hàng loạt',
      example_zh: '',
      example_en: '',
      example_vi: '',
      status: 'enabled'
    }
  }, token);
  const batchResult = await http('/terms/batch/status', {
    method: 'PUT',
    body: { ids: [batchTerm.id], status: 'disabled' }
  }, token);
  assert(batchResult.count === 1, 'batch status did not update exactly one term');
  await http(`/terms/${batchTerm.id}`, { method: 'DELETE' }, token);

  // 13 个管理台菜单逐一验证分页信封（minTotal 取 0：空表也应返回合法信封）
  const pagedEndpoints = [
    ['/system/users', 'admin users'],
    ['/system/roles', 'admin roles'],
    ['/system/menus', 'admin menus'],
    ['/system/logs/login', 'admin login logs'],
    ['/system/logs/operation', 'admin operation logs'],
    ['/terms/categories', 'admin categories'],
    ['/terms', 'admin terms'],
    ['/practice/records', 'admin practice records'],
    ['/practice/wrong-questions', 'admin wrong questions'],
    ['/practice/favorites', 'admin favorites'],
    ['/agent/sessions', 'admin agent sessions']
  ];
  for (const [path, name] of pagedEndpoints) {
    const joiner = path.includes('?') ? '&' : '?';
    const data = await http(`${path}${joiner}page=1&pageSize=5`, {}, token);
    assertPage(data, 1, 5, 0, name);
  }

  // 关键字筛选后仍应是合法信封，且总数不超过未筛选时
  const filteredUsers = await http('/system/users?page=1&pageSize=5&keyword=admin', {}, token);
  assertPage(filteredUsers, 1, 5, 0, 'admin users (keyword)');
  assert(filteredUsers.total <= users.total, 'keyword filter did not narrow the result set');

  /* ---------------------------- 智能体接口 ---------------------------- */

  const agentHealth = await http('/agent/health', {}, token);
  assert(agentHealth.llm && typeof agentHealth.llm.available === 'boolean', 'agent health: llm.available missing');
  assert(typeof agentHealth.asr === 'boolean' && typeof agentHealth.tts === 'boolean', 'agent health: asr/tts missing');

  const models = await http('/agent/models', {}, token);
  assert(Array.isArray(models.models), 'agent models list missing');
  assert(models.models.length > 0, 'agent model catalog is empty — run npm run db:init --workspace server');

  if (agentHealth.llm.available) {
    // 对话测试默认挑最小模型：0.5b 冷启动一两秒，不跟正在跑的业务抢显存，
    // 也不会因为 14b 被别人挤掉而把加载失败误报成流式缺陷。
    // 要覆盖大模型路径时，用 SMOKE_CHAT_MODEL=qwen3:14b 再跑一次。
    const preferred = process.env.SMOKE_CHAT_MODEL;
    const target =
      (preferred && models.models.find((m) => m.name === preferred)) ||
      models.models.find((m) => m.name === 'qwen2.5:0.5b' && m.installed) ||
      models.models.find((m) => m.installed) ||
      models.models[0];
    console.log(`  · chat smoke using model: ${target.name}`);
    const events = await sseCollect('/agent/chat', {
      model: target.name,
      message: '用一句话说明什么是道岔。',
      lang: 'zh',
      useRag: true
    }, token);

    assert(events.some((e) => e.type === 'start'), 'chat stream has no start event');
    assert(events.some((e) => e.type === 'done'), 'chat stream has no done event');
    assert(!events.some((e) => e.type === 'error'), `chat stream errored: ${events.find((e) => e.type === 'error')?.message}`);
    const answer = events.filter((e) => e.type === 'delta').map((e) => e.content).join('');
    assert(answer.trim().length > 0, 'chat stream produced no content (is think:false set for qwen3?)');

    const sessionId = events.find((e) => e.type === 'start').sessionId;
    const sessionMessages = await http(`/agent/sessions/${sessionId}/messages?page=1&pageSize=10`, {}, token);
    assertPage(sessionMessages, 1, 10, 2, 'agent session messages');
  } else {
    console.log('! Ollama unreachable — skipped live chat streaming assertions.');
  }

  if (agentHealth.tts) {
    const tts = await httpRaw('/agent/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: '冒烟测试语音', lang: 'zh' })
    }, token);
    assert(tts.ok, `tts failed: ${tts.status}`);
    assert(
      (tts.headers.get('content-type') || '').startsWith('audio/'),
      `tts content-type is not audio: ${tts.headers.get('content-type')}`
    );
    const audio = Buffer.from(await tts.arrayBuffer());
    assert(audio.length > 1000, `tts returned suspiciously small audio (${audio.length} bytes)`);

    // 把刚合成的音频原样喂回 ASR，跑通「音频 -> 文本」整条链。
    // 这样不用麦克风也能验证语音对话；同时也覆盖了领域提示词（见 rag.domainPrompt）
    // ——没有它，「道岔」会被听成同音词，下面的关键词断言就会挂。
    if (agentHealth.asr) {
      const spoken = '道岔是铁路轨道的关键部件';
      const synth = await httpRaw('/agent/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: spoken, lang: 'zh' })
      }, token);
      assert(synth.ok, `tts (round-trip) failed: ${synth.status}`);
      const clip = Buffer.from(await synth.arrayBuffer());

      const asr = await httpRaw('/agent/asr?language=zh', {
        method: 'POST',
        headers: { 'Content-Type': 'audio/mpeg' },
        body: clip
      }, token);
      assert(asr.ok, `asr failed: ${asr.status}`);
      const { text: heard } = await asr.json();
      assert(typeof heard === 'string' && heard.length > 0, 'asr returned empty text');
      // 只断言关键术语，不比对整句：语气、标点、繁简都可能随模型规模变化。
      assert(heard.includes('道岔'), `asr did not hear the domain term 道岔 (heard: ${heard})`);
      assert(heard.includes('铁路'), `asr did not hear 铁路 (heard: ${heard})`);
    } else {
      console.log('! AI sidecar ASR unavailable — skipped speech recognition assertions.');
    }
  } else {
    console.log('! AI sidecar TTS unavailable — skipped audio synthesis assertions.');
  }

  /* ------------------------------ 清理 ------------------------------ */

  await http(`/system/users/${teacher.id}`, { method: 'DELETE' }, token);
  const tempUserRow = await http(`/system/users?page=1&pageSize=5&keyword=${tempUser}`, {}, token);
  if (tempUserRow.rows.length) await http(`/system/users/${tempUserRow.rows[0].id}`, { method: 'DELETE' }, token);

  console.log('Smoke test passed: auth, paginated terms/categories/users/roles/menus/logs/practice/favorites/agent-sessions, analysis.');
  console.log('Smoke test passed: register → login → profile → change password → forgot/reset password.');
  console.log('Smoke test passed: role-scoped menus, admin dashboard, term batch status, agent health/models/chat, TTS→ASR round-trip.');
}

/** 断言一个 promise 必须失败——用于「旧密码应失效」这类负向用例。 */
async function assertRejects(promise, message) {
  try {
    await promise;
  } catch {
    return;
  }
  throw new Error(message);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
