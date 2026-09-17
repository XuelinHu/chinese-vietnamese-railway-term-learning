<script setup>
import { computed, onMounted, ref } from 'vue';
import { get } from '../../api/http';
import { useI18n } from '../../composables/useI18n';
import { useToast } from '../../composables/useToast';

const { tr } = useI18n();
const toast = useToast();

const days = ref(14);
const loading = ref(false);
const data = ref(null);

const summary = computed(() => data.value?.summary || {});

const cards = computed(() => [
  { label: tr('totalUsers'), value: summary.value.users ?? 0 },
  { label: tr('activeToday'), value: summary.value.active_users ?? 0 },
  { label: tr('totalPractices'), value: summary.value.practices ?? 0 },
  { label: tr('agentCalls'), value: summary.value.agent_messages ?? 0 }
]);

const secondary = computed(() => [
  { label: tr('totalTerms'), value: summary.value.terms ?? 0 },
  { label: tr('categories'), value: summary.value.categories ?? 0 },
  { label: tr('avgScore'), value: Number(summary.value.avg_score ?? 0).toFixed(1) },
  { label: tr('sessionCount'), value: summary.value.agent_sessions ?? 0 },
  { label: tr('loginLogs'), value: summary.value.recent_logins ?? 0 }
]);

const max = (list, key) => Math.max(1, ...list.map((item) => Number(item[key]) || 0));

const maxUserGrowth = computed(() => max(data.value?.userGrowth || [], 'count'));
const maxPractice = computed(() => max(data.value?.practiceTrend || [], 'count'));
const maxCategory = computed(() => max(data.value?.categoryDist || [], 'term_count'));
const maxWrong = computed(() => max(data.value?.topWrong || [], 'wrong_count'));
const maxAgent = computed(() => max(data.value?.agentUsage || [], 'count'));
const maxRole = computed(() => max(data.value?.roleDist || [], 'user_count'));
const maxDifficulty = computed(() => max(data.value?.difficulty || [], 'count'));

onMounted(load);

async function load() {
  loading.value = true;
  try {
    data.value = await get(`/analysis/dashboard?days=${days.value}`);
  } catch (err) {
    toast.error(err.message);
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <section class="page">
    <div class="section-title">
      <div>
        <h1>{{ tr('adminDashboard') }}</h1>
        <p>近 {{ days }} 天</p>
      </div>
      <div class="toolbar">
        <select v-model.number="days" @change="load">
          <option :value="7">7 天</option>
          <option :value="14">14 天</option>
          <option :value="30">30 天</option>
          <option :value="90">90 天</option>
        </select>
        <button :disabled="loading" @click="load">{{ tr('search') }}</button>
      </div>
    </div>

    <div class="stats-grid">
      <article v-for="card in cards" :key="card.label">
        <span>{{ card.label }}</span>
        <strong>{{ card.value }}</strong>
      </article>
    </div>

    <div class="mini-stats">
      <span v-for="item in secondary" :key="item.label">
        {{ item.label }} <strong>{{ item.value }}</strong>
      </span>
    </div>

    <div class="two-column">
      <section class="panel">
        <h3>{{ tr('userGrowth') }}</h3>
        <p v-if="!(data?.userGrowth || []).length" class="muted">{{ tr('empty') }}</p>
        <div v-for="item in data?.userGrowth || []" :key="item.date" class="bar-row">
          <span>{{ item.date }}</span>
          <div><i :style="{ width: `${(item.count / maxUserGrowth) * 100}%` }"></i></div>
          <b>{{ item.count }}</b>
        </div>
      </section>

      <section class="panel">
        <h3>{{ tr('practiceTrend') }}</h3>
        <p v-if="!(data?.practiceTrend || []).length" class="muted">{{ tr('empty') }}</p>
        <div v-for="item in data?.practiceTrend || []" :key="item.date" class="bar-row">
          <span>{{ item.date }}</span>
          <div><i :style="{ width: `${(item.count / maxPractice) * 100}%` }"></i></div>
          <b>{{ item.count }}</b>
        </div>
      </section>

      <section class="panel">
        <h3>{{ tr('categoryDistribution') }}</h3>
        <div v-for="item in data?.categoryDist || []" :key="item.name_zh" class="bar-row">
          <span>{{ item.name_zh }}</span>
          <div><i :style="{ width: `${(item.term_count / maxCategory) * 100}%` }"></i></div>
          <b>{{ item.term_count }}</b>
        </div>
      </section>

      <section class="panel">
        <h3>{{ tr('topWrongTerms') }}</h3>
        <p v-if="!(data?.topWrong || []).length" class="muted">{{ tr('empty') }}</p>
        <div v-for="item in data?.topWrong || []" :key="item.term_zh" class="bar-row">
          <span>{{ item.term_zh }}</span>
          <div><i :style="{ width: `${(item.wrong_count / maxWrong) * 100}%` }"></i></div>
          <b>{{ item.wrong_count }}</b>
        </div>
      </section>

      <section class="panel">
        <h3>{{ tr('agentCalls') }}</h3>
        <p v-if="!(data?.agentUsage || []).length" class="muted">{{ tr('empty') }}</p>
        <div v-for="item in data?.agentUsage || []" :key="item.date" class="bar-row">
          <span>{{ item.date }}</span>
          <div><i :style="{ width: `${(item.count / maxAgent) * 100}%` }"></i></div>
          <b>{{ item.count }}</b>
        </div>
      </section>

      <section class="panel">
        <h3>{{ tr('roleDistribution') }}</h3>
        <div v-for="item in data?.roleDist || []" :key="item.code" class="bar-row">
          <span>{{ item.name_zh }}</span>
          <div><i :style="{ width: `${(item.user_count / maxRole) * 100}%` }"></i></div>
          <b>{{ item.user_count }}</b>
        </div>
      </section>

      <section class="panel">
        <h3>{{ tr('difficulty') }}</h3>
        <div v-for="item in data?.difficulty || []" :key="item.difficulty" class="bar-row">
          <span>{{ tr(item.difficulty) || item.difficulty }}</span>
          <div><i :style="{ width: `${(item.count / maxDifficulty) * 100}%` }"></i></div>
          <b>{{ item.count }}</b>
        </div>
      </section>
    </div>
  </section>
</template>

<style scoped>
.mini-stats {
  display: flex;
  gap: 22px;
  flex-wrap: wrap;
  padding: 13px 18px;
  margin-bottom: 18px;
  background: #ffffff;
  border: 1px solid #e1e7ee;
  border-radius: 8px;
  color: #607080;
  font-size: 0.9rem;
}

.mini-stats strong {
  color: #172026;
  font-size: 1.06rem;
}

.muted {
  color: #8593a1;
  font-size: 0.9rem;
}
</style>
