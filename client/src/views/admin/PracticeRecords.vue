<script setup>
import { onMounted, ref } from 'vue';
import { del, get, getAllPages } from '../../api/http';
import { useI18n } from '../../composables/useI18n';
import { usePagination } from '../../composables/usePagination';
import { useToast } from '../../composables/useToast';
import FilterBar from '../../components/common/FilterBar.vue';
import PagedTable from '../../components/common/PagedTable.vue';
import Modal from '../../components/common/Modal.vue';

const { tr } = useI18n();
const toast = useToast();

const categories = ref([]);
const showDetail = ref(false);
const current = ref(null);

const list = usePagination('/practice/records', {
  pageSize: 10,
  filters: { practiceType: '', categoryId: '', from: '', to: '' }
});

// 明细的 URL 依赖当前选中的记录，所以路径用函数形式延迟求值。
const answers = usePagination(() => (current.value ? `/practice/records/${current.value.id}/answers` : ''), {
  pageSize: 10
});

const columns = [
  { key: 'username', label: tr('filterUser'), width: '130px' },
  { key: 'practice_type', label: tr('practiceType'), width: '110px' },
  { key: 'category_zh', label: tr('categories'), width: '120px' },
  { key: 'total_count', label: tr('total'), width: '80px', align: 'center' },
  { key: 'correct_count', label: tr('correct'), width: '80px', align: 'center' },
  { key: 'score', label: tr('score'), width: '90px', align: 'center' },
  { key: 'created_at', label: tr('createdAt'), width: '180px' },
  { key: 'actions', label: tr('actions'), width: '170px', align: 'right' }
];

const answerColumns = [
  { key: 'term_zh', label: '中文' },
  { key: 'term_vi', label: 'Tiếng Việt' },
  { key: 'user_answer', label: tr('yourAnswer') },
  { key: 'correct_answer', label: tr('correctAnswer') },
  { key: 'is_correct', label: tr('result'), width: '90px', align: 'center' }
];

onMounted(async () => {
  await list.load();
  try {
    categories.value = await getAllPages('/terms/categories/options');
  } catch {
    categories.value = [];
  }
});

async function openDetail(row) {
  current.value = row;
  answers.goPage(1);
  showDetail.value = true;
  try {
    await answers.load();
  } catch (err) {
    toast.error(err.message);
  }
}

async function remove(row) {
  if (!confirm(`${tr('confirmDelete')}\n#${row.id}`)) return;
  try {
    await del(`/practice/records/${row.id}`);
    await list.load();
    toast.success(tr('deleted'));
  } catch (err) {
    toast.error(err.message);
  }
}
</script>

<template>
  <section class="page">
    <div class="section-title">
      <div>
        <h1>{{ tr('practiceRecords') }}</h1>
        <p>{{ list.total.value }} 条</p>
      </div>
    </div>

    <FilterBar
      v-model:keyword="list.filters.keyword"
      :placeholder="tr('keywordPlaceholder')"
      @search="list.search"
      @reset="list.reset"
    >
      <select v-model="list.filters.practiceType" @change="list.search">
        <option value="">{{ tr('practiceType') }}</option>
        <option value="choice">choice</option>
        <option value="judge">judge</option>
        <option value="fill">fill</option>
        <option value="translate">translate</option>
      </select>
      <select v-model="list.filters.categoryId" @change="list.search">
        <option value="">{{ tr('filterCategory') }}</option>
        <option v-for="cat in categories" :key="cat.id" :value="cat.id">{{ cat.name_zh }}</option>
      </select>
      <input v-model="list.filters.from" type="date" :title="tr('from')" @change="list.search" />
      <input v-model="list.filters.to" type="date" :title="tr('to')" @change="list.search" />
    </FilterBar>

    <PagedTable :pager="list" :columns="columns" :empty-text="tr('empty')">
      <template #cell-username="{ row }">
        <strong>{{ row.username }}</strong>
        <div class="sub">{{ row.real_name }}</div>
      </template>
      <template #cell-practice_type="{ row }">
        <span class="tag">{{ row.practice_type }}</span>
      </template>
      <template #cell-score="{ row }">
        <span class="score" :class="{ low: Number(row.score) < 60 }">{{ row.score }}</span>
      </template>
      <template #cell-actions="{ row }">
        <button class="mini" @click="openDetail(row)">{{ tr('viewDetail') }}</button>
        <button class="mini" @click="remove(row)">{{ tr('remove') }}</button>
      </template>
    </PagedTable>

    <Modal v-model="showDetail" :title="`${tr('answerDetail')} · #${current?.id ?? ''}`" width="860px">
      <div class="summary" v-if="current">
        <span>{{ tr('filterUser') }}: <strong>{{ current.username }}</strong></span>
        <span>{{ tr('practiceType') }}: <strong>{{ current.practice_type }}</strong></span>
        <span>{{ tr('total') }}: <strong>{{ current.total_count }}</strong></span>
        <span>{{ tr('correct') }}: <strong>{{ current.correct_count }}</strong></span>
        <span>{{ tr('score') }}: <strong>{{ current.score }}</strong></span>
      </div>

      <PagedTable :pager="answers" :columns="answerColumns" :empty-text="tr('empty')">
        <template #cell-is_correct="{ row }">
          <span v-if="row.is_correct" class="ok">✓</span>
          <span v-else class="error">✗</span>
        </template>
      </PagedTable>
    </Modal>
  </section>
</template>

<style scoped>
.mini {
  padding: 3px 9px;
  font-size: 0.8rem;
  margin-left: 5px;
}

.sub {
  color: #8593a1;
  font-size: 0.78rem;
}

.score {
  font-weight: 600;
  color: #0f766e;
}

.score.low {
  color: #b42318;
}

.summary {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  padding: 10px 12px;
  margin-bottom: 14px;
  background: #f7f9fb;
  border-radius: 8px;
  font-size: 0.86rem;
}
</style>
