<script setup>
import { computed, onMounted, ref } from 'vue';
import { del, get } from '../api/http';
import { useI18n } from '../composables/useI18n';
import { usePagination } from '../composables/usePagination';
import { useToast } from '../composables/useToast';
import PagedTable from '../components/common/PagedTable.vue';
import FilterBar from '../components/common/FilterBar.vue';
import { speak } from '../voice';

const { tr } = useI18n();
const toast = useToast();

const tab = ref('trend');
const data = ref(null);

const wrongList = usePagination('/practice/wrong-questions');
const favoriteList = usePagination('/practice/favorites');

const wrongColumns = [
  { key: 'term_zh', label: '中文' },
  { key: 'term_vi', label: 'Tiếng Việt' },
  { key: 'category_zh', label: tr('categories'), width: '130px' },
  { key: 'wrong_count', label: tr('wrongQuestions'), width: '100px' },
  { key: 'actions', label: tr('actions'), width: '150px', align: 'right' }
];

const favoriteColumns = [
  { key: 'term_zh', label: '中文' },
  { key: 'term_vi', label: 'Tiếng Việt' },
  { key: 'difficulty', label: tr('difficulty'), width: '100px' },
  { key: 'category_zh', label: tr('categories'), width: '130px' },
  { key: 'actions', label: tr('actions'), width: '120px', align: 'right' }
];

const summary = computed(() => data.value?.summary || {});
const maxTrend = computed(() => Math.max(1, ...(data.value?.trend || []).map((t) => Number(t.count) || 0)));
const maxCategoryScore = computed(() =>
  Math.max(1, ...(data.value?.category || []).map((c) => Number(c.score) || 0))
);

const cards = computed(() => [
  { label: tr('practiceCount'), value: summary.value.practice_count ?? 0 },
  { label: tr('avgScore'), value: Number(summary.value.avg_score ?? 0).toFixed(1) },
  { label: tr('correctRate'), value: correctRate.value },
  { label: tr('wrongBook'), value: summary.value.wrong_count ?? 0 }
]);

const correctRate = computed(() => {
  const answers = Number(summary.value.answer_count) || 0;
  if (!answers) return '0%';
  return `${Math.round((Number(summary.value.correct_count) / answers) * 100)}%`;
});

onMounted(load);

async function load() {
  try {
    data.value = await get('/analysis/student');
  } catch (err) {
    toast.error(err.message);
  }
}

async function switchTab(next) {
  tab.value = next;
  if (next === 'wrong' && !wrongList.rows.value.length) await wrongList.load();
  if (next === 'favorite' && !favoriteList.rows.value.length) await favoriteList.load();
}

async function removeWrong(row) {
  if (!confirm(tr('confirmDelete'))) return;
  try {
    await del(`/practice/wrong-questions/${row.id}`);
    await Promise.all([wrongList.load(), load()]);
    toast.success(tr('deleted'));
  } catch (err) {
    toast.error(err.message);
  }
}

async function removeFavorite(row) {
  if (!confirm(tr('confirmDelete'))) return;
  try {
    await del(`/practice/favorites/${row.id}`);
    await favoriteList.load();
    toast.success(tr('deleted'));
  } catch (err) {
    toast.error(err.message);
  }
}

async function pronounce(text, lang) {
  try {
    await speak(text, lang);
  } catch (err) {
    toast.warn(err.message);
  }
}
</script>

<template>
  <section class="page">
    <div class="section-title">
      <h1>{{ tr('analysis') }}</h1>
    </div>

    <div class="stats-grid">
      <article v-for="card in cards" :key="card.label">
        <span>{{ card.label }}</span>
        <strong>{{ card.value }}</strong>
      </article>
    </div>

    <div class="tabs">
      <button :class="{ active: tab === 'trend' }" @click="switchTab('trend')">{{ tr('trend') }}</button>
      <button :class="{ active: tab === 'category' }" @click="switchTab('category')">
        {{ tr('categoryDistribution') }}
      </button>
      <button :class="{ active: tab === 'wrong' }" @click="switchTab('wrong')">{{ tr('wrongBook') }}</button>
      <button :class="{ active: tab === 'favorite' }" @click="switchTab('favorite')">{{ tr('favorites') }}</button>
    </div>

    <section v-if="tab === 'trend'" class="panel">
      <p v-if="!(data?.trend || []).length" class="muted">{{ tr('noPracticeYet') }}</p>
      <div v-for="item in data?.trend || []" :key="item.date" class="bar-row">
        <span>{{ item.date }}</span>
        <div><i :style="{ width: `${(item.count / maxTrend) * 100}%` }"></i></div>
        <b>{{ item.count }}</b>
      </div>
    </section>

    <section v-else-if="tab === 'category'" class="panel">
      <p v-if="!(data?.category || []).length" class="muted">{{ tr('noPracticeYet') }}</p>
      <div v-for="item in data?.category || []" :key="item.name_zh" class="bar-row">
        <span>{{ item.name_zh }}</span>
        <div><i :style="{ width: `${(item.score / maxCategoryScore) * 100}%` }"></i></div>
        <b>{{ Math.round(item.score) }}</b>
      </div>
    </section>

    <section v-else-if="tab === 'wrong'">
      <FilterBar
        v-model:keyword="wrongList.filters.keyword"
        :placeholder="tr('keywordPlaceholder')"
        @search="wrongList.search"
        @reset="wrongList.reset"
      />
      <PagedTable :pager="wrongList" :columns="wrongColumns" :empty-text="tr('empty')">
        <template #cell-wrong_count="{ row }">
          <span class="tag">{{ row.wrong_count }}</span>
        </template>
        <template #cell-actions="{ row }">
          <button class="mini" @click="pronounce(row.term_vi, 'vi')">🔊</button>
          <button class="mini" @click="removeWrong(row)">{{ tr('remove') }}</button>
        </template>
      </PagedTable>
    </section>

    <section v-else>
      <FilterBar
        v-model:keyword="favoriteList.filters.keyword"
        :placeholder="tr('keywordPlaceholder')"
        @search="favoriteList.search"
        @reset="favoriteList.reset"
      />
      <PagedTable :pager="favoriteList" :columns="favoriteColumns" :empty-text="tr('empty')">
        <template #cell-difficulty="{ row }">
          <span class="tag">{{ tr(row.difficulty) || row.difficulty }}</span>
        </template>
        <template #cell-actions="{ row }">
          <button class="mini" @click="pronounce(row.term_vi, 'vi')">🔊</button>
          <button class="mini" @click="removeFavorite(row)">{{ tr('remove') }}</button>
        </template>
      </PagedTable>
    </section>
  </section>
</template>

<style scoped>
.tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 18px;
  flex-wrap: wrap;
}

.muted {
  color: #8593a1;
  font-size: 0.9rem;
}

.mini {
  padding: 3px 9px;
  font-size: 0.8rem;
  margin-left: 6px;
}
</style>
