<script setup>
import { computed, onMounted, ref } from 'vue';
import { get } from '../api/http';
import { useI18n } from '../composables/useI18n';
import { useToast } from '../composables/useToast';
import { speak } from '../voice';

const { tr } = useI18n();
const toast = useToast();

const student = ref(null);
const admin = ref(null);
const recent = ref([]);
const loading = ref(true);

const summary = computed(() => student.value?.summary || {});

const correctRate = computed(() => {
  const s = summary.value;
  const answers = Number(s.answer_count) || 0;
  if (!answers) return '0%';
  return `${Math.round((Number(s.correct_count) / answers) * 100)}%`;
});

const cards = computed(() => [
  { label: tr('practiceCount'), value: summary.value.practice_count ?? 0 },
  { label: tr('avgScore'), value: Number(summary.value.avg_score ?? 0).toFixed(1) },
  { label: tr('correctRate'), value: correctRate.value },
  { label: tr('totalTerms'), value: admin.value?.summary?.terms ?? 0 }
]);

// 柱状图按最大值归一化，避免用固定系数导致高值溢出、低值看不见。
const maxCategory = computed(() =>
  Math.max(1, ...(admin.value?.categories || []).map((c) => Number(c.term_count) || 0))
);
const maxTrend = computed(() => Math.max(1, ...(student.value?.trend || []).map((t) => Number(t.count) || 0)));

onMounted(async () => {
  try {
    const [studentData, adminData, termData] = await Promise.all([
      get('/analysis/student'),
      get('/analysis/admin'),
      get('/terms?page=1&pageSize=6')
    ]);
    student.value = studentData;
    admin.value = adminData;
    recent.value = termData.rows || [];
  } catch (err) {
    toast.error(err.message);
  } finally {
    loading.value = false;
  }
});

async function pronounce(term, lang) {
  try {
    await speak(term, lang);
  } catch (err) {
    toast.warn(err.message);
  }
}
</script>

<template>
  <section class="page">
    <div class="section-title">
      <div>
        <h1>{{ tr('dashboard') }}</h1>
        <p>Chinese · Vietnamese · English railway terminology learning</p>
      </div>
    </div>

    <div class="stats-grid">
      <article v-for="card in cards" :key="card.label">
        <span>{{ card.label }}</span>
        <strong>{{ card.value }}</strong>
      </article>
    </div>

    <div class="two-column">
      <section class="panel">
        <h3>{{ tr('categoryDistribution') }}</h3>
        <p v-if="!(admin?.categories || []).length" class="muted">{{ tr('empty') }}</p>
        <div v-for="cat in admin?.categories || []" :key="cat.name_zh" class="bar-row">
          <span>{{ cat.name_zh }}</span>
          <div><i :style="{ width: `${(cat.term_count / maxCategory) * 100}%` }"></i></div>
          <b>{{ cat.term_count }}</b>
        </div>
      </section>

      <section class="panel">
        <h3>{{ tr('trend') }}</h3>
        <p v-if="!(student?.trend || []).length" class="muted">{{ tr('noPracticeYet') }}</p>
        <div v-for="item in student?.trend || []" :key="item.date" class="bar-row">
          <span>{{ item.date }}</span>
          <div><i :style="{ width: `${(item.count / maxTrend) * 100}%` }"></i></div>
          <b>{{ item.count }}</b>
        </div>
      </section>
    </div>

    <section class="panel spaced">
      <h3>{{ tr('recentTerms') }}</h3>
      <ul class="term-list">
        <li v-for="term in recent" :key="term.id">
          <div class="term-line">
            <strong>{{ term.term_zh }}</strong>
            <span class="term-tr">{{ term.term_vi }} / {{ term.term_en }}</span>
            <span class="speak-buttons">
              <button class="mini" :title="tr('pronunciation')" @click="pronounce(term.term_zh, 'zh')">🔊中</button>
              <button class="mini" :title="tr('pronunciation')" @click="pronounce(term.term_vi, 'vi')">🔊越</button>
            </span>
          </div>
        </li>
      </ul>
    </section>
  </section>
</template>

<style scoped>
.muted {
  color: #8593a1;
  font-size: 0.9rem;
}

.spaced {
  margin-top: 18px;
}

.term-line {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.term-tr {
  color: #607080;
}

.speak-buttons {
  margin-left: auto;
  display: flex;
  gap: 6px;
}

.mini {
  padding: 3px 9px;
  font-size: 0.8rem;
}
</style>
