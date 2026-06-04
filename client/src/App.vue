<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { clearToken, request, setToken } from './api/http';
import { messages } from './locales/messages';

const lang = ref(localStorage.getItem('lang') || 'zh');
const page = ref('dashboard');
const loading = ref(false);
const error = ref('');
const loginForm = reactive({ username: 'admin', password: 'admin123' });
const user = ref(JSON.parse(localStorage.getItem('user') || 'null'));
const terms = ref([]);
const categories = ref([]);
const users = ref([]);
const roles = ref([]);
const loginLogs = ref([]);
const adminAnalysis = ref(null);
const studentAnalysis = ref(null);
const wrongQuestions = ref([]);
const filters = reactive({ keyword: '', categoryId: '', difficulty: '' });
const termPager = reactive({ page: 1, pageSize: 10, total: 0 });
const userPager = reactive({ page: 1, pageSize: 10, total: 0 });
const logPager = reactive({ page: 1, pageSize: 10, total: 0 });
const termForm = reactive(emptyTerm());
const editingId = ref(null);
const showTermForm = ref(false);
const practiceConfig = reactive({ type: 'choice', categoryId: '', difficulty: '', count: 5 });
const questions = ref([]);
const answers = reactive({});
const practiceResult = ref(null);

const t = computed(() => messages[lang.value]);
const isLoggedIn = computed(() => Boolean(user.value));
const canManage = computed(() => ['admin', 'teacher'].includes(user.value?.roleCode || user.value?.role_code));
const statsCards = computed(() => [
  { label: t.value.totalTerms, value: adminAnalysis.value?.summary?.terms ?? terms.value.length },
  { label: t.value.practiceCount, value: studentAnalysis.value?.summary?.practice_count ?? 0 },
  { label: t.value.avgScore, value: studentAnalysis.value?.summary?.avg_score ?? 0 },
  { label: t.value.correctRate, value: rateText.value }
]);
const rateText = computed(() => {
  const s = studentAnalysis.value?.summary;
  if (!s || Number(s.answer_count) === 0) return '0%';
  return `${Math.round((Number(s.correct_count) / Number(s.answer_count)) * 100)}%`;
});

function emptyTerm() {
  return {
    category_id: '',
    term_zh: '',
    term_en: '',
    term_vi: '',
    pinyin: '',
    difficulty: 'easy',
    definition_zh: '',
    definition_en: '',
    definition_vi: '',
    example_zh: '',
    example_en: '',
    example_vi: '',
    status: 'enabled'
  };
}

function setLanguage(value) {
  lang.value = value;
  localStorage.setItem('lang', value);
}

async function login() {
  error.value = '';
  loading.value = true;
  try {
    const data = await request('/auth/login', { method: 'POST', body: loginForm });
    setToken(data.token);
    user.value = data.user;
    localStorage.setItem('user', JSON.stringify(data.user));
    await bootstrap();
  } catch (err) {
    error.value = err.message;
  } finally {
    loading.value = false;
  }
}

function logout() {
  clearToken();
  user.value = null;
  questions.value = [];
  practiceResult.value = null;
}

async function bootstrap() {
  await Promise.all([loadCategories(), loadTerms(), loadAnalysis(), loadWrongQuestions()]);
  if (canManage.value) await Promise.all([loadUsers(), loadRoles(), loadLogs()]);
}

async function loadCategories() {
  categories.value = await request('/terms/categories');
}

async function loadTerms() {
  const params = new URLSearchParams();
  if (filters.keyword) params.set('keyword', filters.keyword);
  if (filters.categoryId) params.set('categoryId', filters.categoryId);
  if (filters.difficulty) params.set('difficulty', filters.difficulty);
  params.set('page', termPager.page);
  params.set('pageSize', termPager.pageSize);
  const data = await request(`/terms?${params.toString()}`);
  terms.value = data.rows || data;
  termPager.total = data.total ?? terms.value.length;
}

async function loadUsers() {
  const data = await request(`/system/users?page=${userPager.page}&pageSize=${userPager.pageSize}`);
  users.value = data.rows || data;
  userPager.total = data.total ?? users.value.length;
}

async function loadRoles() {
  roles.value = await request('/system/roles');
}

async function loadLogs() {
  const data = await request(`/system/logs/login?page=${logPager.page}&pageSize=${logPager.pageSize}`);
  loginLogs.value = data.rows || data;
  logPager.total = data.total ?? loginLogs.value.length;
}

async function loadAnalysis() {
  studentAnalysis.value = await request('/analysis/student');
  adminAnalysis.value = await request('/analysis/admin');
}

async function loadWrongQuestions() {
  const data = await request('/practice/wrong-questions?page=1&pageSize=20');
  wrongQuestions.value = data.rows || data;
}

function resetTermSearch() {
  termPager.page = 1;
  loadTerms();
}

function pageCount(pager) {
  return Math.max(Math.ceil(pager.total / pager.pageSize), 1);
}

async function changePage(pager, nextPage, loader) {
  pager.page = Math.min(Math.max(nextPage, 1), pageCount(pager));
  await loader();
}

function newTerm() {
  Object.assign(termForm, emptyTerm(), { category_id: categories.value[0]?.id || '' });
  editingId.value = null;
  showTermForm.value = true;
}

function editTerm(term) {
  Object.assign(termForm, term, { category_id: term.category_id });
  editingId.value = term.id;
  showTermForm.value = true;
}

async function saveTerm() {
  const path = editingId.value ? `/terms/${editingId.value}` : '/terms';
  const method = editingId.value ? 'PUT' : 'POST';
  await request(path, { method, body: termForm });
  showTermForm.value = false;
  await Promise.all([loadTerms(), loadAnalysis()]);
}

async function deleteTerm(id) {
  if (!confirm('Confirm delete?')) return;
  await request(`/terms/${id}`, { method: 'DELETE' });
  await loadTerms();
}

async function startPractice() {
  practiceResult.value = null;
  Object.keys(answers).forEach((key) => delete answers[key]);
  const data = await request('/practice/start', {
    method: 'POST',
    body: {
      ...practiceConfig,
      categoryId: practiceConfig.categoryId || null,
      difficulty: practiceConfig.difficulty || null
    }
  });
  questions.value = data.questions;
}

async function submitPractice() {
  const payload = questions.value.map((question, index) => ({
    ...question,
    userAnswer: answers[index] || ''
  }));
  practiceResult.value = await request('/practice/submit', {
    method: 'POST',
    body: {
      type: practiceConfig.type,
      categoryId: practiceConfig.categoryId || null,
      difficulty: practiceConfig.difficulty || null,
      answers: payload
    }
  });
  await Promise.all([loadAnalysis(), loadWrongQuestions()]);
}

onMounted(async () => {
  if (isLoggedIn.value) {
    try {
      await bootstrap();
    } catch (err) {
      error.value = err.message;
    }
  }
});
</script>

<template>
  <main v-if="!isLoggedIn" class="login-screen">
    <section class="login-panel">
      <div>
        <p class="eyebrow">Railway Terminology</p>
        <h1>{{ t.app }}</h1>
      </div>
      <div class="lang-row">
        <button v-for="item in ['zh','en','vi']" :key="item" :class="{ active: lang === item }" @click="setLanguage(item)">
          {{ item.toUpperCase() }}
        </button>
      </div>
      <form class="form-stack" @submit.prevent="login">
        <label>{{ t.username }}<input v-model="loginForm.username" autocomplete="username" /></label>
        <label>{{ t.password }}<input v-model="loginForm.password" type="password" autocomplete="current-password" /></label>
        <p v-if="error" class="error">{{ error }}</p>
        <button class="primary" :disabled="loading">{{ t.login }}</button>
      </form>
      <p class="hint">admin/admin123 · teacher/teacher123 · student/student123</p>
    </section>
  </main>

  <div v-else class="app-shell">
    <aside class="sidebar">
      <h2>{{ t.app }}</h2>
      <nav>
        <button :class="{ active: page === 'dashboard' }" @click="page = 'dashboard'">{{ t.dashboard }}</button>
        <button :class="{ active: page === 'terms' }" @click="page = 'terms'">{{ t.terms }}</button>
        <button :class="{ active: page === 'practice' }" @click="page = 'practice'">{{ t.practice }}</button>
        <button :class="{ active: page === 'analysis' }" @click="page = 'analysis'">{{ t.analysis }}</button>
        <button v-if="canManage" :class="{ active: page === 'system' }" @click="page = 'system'">{{ t.system }}</button>
      </nav>
    </aside>

    <section class="workspace">
      <header class="topbar">
        <div>
          <strong>{{ user.realName || user.real_name }}</strong>
          <span>{{ user.roleCode || user.role_code }}</span>
        </div>
        <div class="toolbar">
          <select :value="lang" @change="setLanguage($event.target.value)">
            <option value="zh">中文</option>
            <option value="en">English</option>
            <option value="vi">Tiếng Việt</option>
          </select>
          <button @click="logout">{{ t.logout }}</button>
        </div>
      </header>

      <section v-if="page === 'dashboard'" class="page">
        <div class="section-title">
          <h1>{{ t.dashboard }}</h1>
          <p>Chinese · Vietnamese · English railway terminology learning</p>
        </div>
        <div class="stats-grid">
          <article v-for="card in statsCards" :key="card.label">
            <span>{{ card.label }}</span>
            <strong>{{ card.value }}</strong>
          </article>
        </div>
        <div class="two-column">
          <section class="panel">
            <h3>{{ t.categories }}</h3>
            <div v-for="cat in adminAnalysis?.categories || []" :key="cat.name_zh" class="bar-row">
              <span>{{ cat.name_zh }}</span>
              <div><i :style="{ width: `${Math.min(100, cat.term_count * 12)}%` }"></i></div>
              <b>{{ cat.term_count }}</b>
            </div>
          </section>
          <section class="panel">
            <h3>Recent Terms</h3>
            <ul class="term-list">
              <li v-for="term in terms.slice(0, 6)" :key="term.id">
                <strong>{{ term.term_zh }}</strong>
                <span>{{ term.term_vi }} / {{ term.term_en }}</span>
              </li>
            </ul>
          </section>
        </div>
      </section>

      <section v-if="page === 'terms'" class="page">
        <div class="section-title">
          <h1>{{ t.terms }}</h1>
          <button v-if="canManage" class="primary" @click="newTerm">{{ t.addTerm }}</button>
        </div>
        <div class="filters">
          <input v-model="filters.keyword" :placeholder="t.keyword" @input="resetTermSearch" />
          <select v-model="filters.categoryId" @change="resetTermSearch">
            <option value="">{{ t.categories }}</option>
            <option v-for="cat in categories" :key="cat.id" :value="cat.id">{{ cat.name_zh }}</option>
          </select>
          <select v-model="filters.difficulty" @change="resetTermSearch">
            <option value="">All</option>
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>中文</th><th>Tiếng Việt</th><th>English</th><th>Category</th><th>Level</th><th></th></tr></thead>
            <tbody>
              <tr v-for="term in terms" :key="term.id">
                <td><strong>{{ term.term_zh }}</strong><small>{{ term.pinyin }}</small></td>
                <td>{{ term.term_vi }}</td>
                <td>{{ term.term_en }}</td>
                <td>{{ term.category_zh }}</td>
                <td><span class="tag">{{ term.difficulty }}</span></td>
                <td class="actions" v-if="canManage">
                  <button @click="editTerm(term)">Edit</button>
                  <button @click="deleteTerm(term.id)">Delete</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="pagination">
          <button :disabled="termPager.page <= 1" @click="changePage(termPager, termPager.page - 1, loadTerms)">Prev</button>
          <span>{{ termPager.page }} / {{ pageCount(termPager) }} · {{ termPager.total }}</span>
          <button :disabled="termPager.page >= pageCount(termPager)" @click="changePage(termPager, termPager.page + 1, loadTerms)">Next</button>
        </div>
      </section>

      <section v-if="page === 'practice'" class="page">
        <div class="section-title"><h1>{{ t.practice }}</h1></div>
        <div class="panel practice-config">
          <select v-model="practiceConfig.type">
            <option value="choice">Choice</option>
            <option value="judge">Judge</option>
            <option value="fill">Fill</option>
            <option value="translate">Translate</option>
          </select>
          <select v-model="practiceConfig.categoryId">
            <option value="">All Categories</option>
            <option v-for="cat in categories" :key="cat.id" :value="cat.id">{{ cat.name_zh }}</option>
          </select>
          <select v-model="practiceConfig.difficulty">
            <option value="">All Levels</option>
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>
          <input v-model.number="practiceConfig.count" type="number" min="1" max="20" />
          <button class="primary" @click="startPractice">{{ t.start }}</button>
        </div>
        <div class="question-stack">
          <article v-for="(question, index) in questions" :key="`${question.termId}-${index}`" class="question">
            <h3>{{ index + 1 }}. {{ question.questionText }}</h3>
            <div v-if="question.options.length" class="options">
              <label v-for="option in question.options" :key="option">
                <input v-model="answers[index]" type="radio" :name="`q-${index}`" :value="option" />
                {{ option === 'true' ? '正确 / True' : option === 'false' ? '错误 / False' : option }}
              </label>
            </div>
            <input v-else v-model="answers[index]" placeholder="Answer" />
            <p v-if="practiceResult" :class="practiceResult.answers[index]?.isCorrect ? 'ok' : 'error'">
              {{ practiceResult.answers[index]?.isCorrect ? 'Correct' : `Wrong: ${question.correctAnswer}` }}
            </p>
          </article>
        </div>
        <button v-if="questions.length && !practiceResult" class="primary submit" @click="submitPractice">{{ t.submit }}</button>
        <section v-if="practiceResult" class="result-panel">
          <strong>{{ practiceResult.score }}</strong>
          <span>{{ practiceResult.correct }} / {{ practiceResult.total }}</span>
        </section>
      </section>

      <section v-if="page === 'analysis'" class="page">
        <div class="section-title"><h1>{{ t.analysis }}</h1></div>
        <div class="stats-grid">
          <article v-for="card in statsCards" :key="card.label"><span>{{ card.label }}</span><strong>{{ card.value }}</strong></article>
        </div>
        <div class="two-column">
          <section class="panel">
            <h3>Trend</h3>
            <div v-for="item in studentAnalysis?.trend || []" :key="item.date" class="bar-row">
              <span>{{ item.date }}</span>
              <div><i :style="{ width: `${item.score || 0}%` }"></i></div>
              <b>{{ item.score }}</b>
            </div>
          </section>
          <section class="panel">
            <h3>{{ t.wrongBook }}</h3>
            <ul class="term-list">
              <li v-for="item in wrongQuestions" :key="item.id">
                <strong>{{ item.term_zh }} / {{ item.term_vi }}</strong>
                <span>{{ item.category_zh }} · {{ item.wrong_count }}</span>
              </li>
            </ul>
          </section>
        </div>
      </section>

      <section v-if="page === 'system' && canManage" class="page">
        <div class="section-title"><h1>{{ t.system }}</h1></div>
        <div class="two-column">
          <section class="panel">
            <h3>{{ t.users }}</h3>
            <table><tbody><tr v-for="item in users" :key="item.id"><td>{{ item.username }}</td><td>{{ item.real_name }}</td><td>{{ item.role_name }}</td><td>{{ item.status }}</td></tr></tbody></table>
            <div class="pagination compact">
              <button :disabled="userPager.page <= 1" @click="changePage(userPager, userPager.page - 1, loadUsers)">Prev</button>
              <span>{{ userPager.page }} / {{ pageCount(userPager) }} · {{ userPager.total }}</span>
              <button :disabled="userPager.page >= pageCount(userPager)" @click="changePage(userPager, userPager.page + 1, loadUsers)">Next</button>
            </div>
          </section>
          <section class="panel">
            <h3>{{ t.logs }}</h3>
            <ul class="log-list">
              <li v-for="log in loginLogs.slice(0, 12)" :key="log.id">
                <span>{{ log.username }}</span>
                <b :class="log.success ? 'ok' : 'error'">{{ log.success ? 'OK' : 'FAIL' }}</b>
                <small>{{ log.created_at }}</small>
              </li>
            </ul>
            <div class="pagination compact">
              <button :disabled="logPager.page <= 1" @click="changePage(logPager, logPager.page - 1, loadLogs)">Prev</button>
              <span>{{ logPager.page }} / {{ pageCount(logPager) }} · {{ logPager.total }}</span>
              <button :disabled="logPager.page >= pageCount(logPager)" @click="changePage(logPager, logPager.page + 1, loadLogs)">Next</button>
            </div>
          </section>
        </div>
      </section>
    </section>

    <div v-if="showTermForm" class="modal-backdrop">
      <form class="modal" @submit.prevent="saveTerm">
        <h2>{{ editingId ? 'Edit Term' : t.addTerm }}</h2>
        <div class="form-grid">
          <label>中文<input v-model="termForm.term_zh" required /></label>
          <label>Tiếng Việt<input v-model="termForm.term_vi" required /></label>
          <label>English<input v-model="termForm.term_en" required /></label>
          <label>Pinyin<input v-model="termForm.pinyin" /></label>
          <label>Category<select v-model="termForm.category_id" required><option v-for="cat in categories" :key="cat.id" :value="cat.id">{{ cat.name_zh }}</option></select></label>
          <label>Difficulty<select v-model="termForm.difficulty"><option value="easy">easy</option><option value="medium">medium</option><option value="hard">hard</option></select></label>
        </div>
        <label>中文释义<textarea v-model="termForm.definition_zh"></textarea></label>
        <label>越南语释义<textarea v-model="termForm.definition_vi"></textarea></label>
        <label>English Definition<textarea v-model="termForm.definition_en"></textarea></label>
        <div class="modal-actions">
          <button type="button" @click="showTermForm = false">{{ t.cancel }}</button>
          <button class="primary">{{ t.save }}</button>
        </div>
      </form>
    </div>
  </div>
</template>
