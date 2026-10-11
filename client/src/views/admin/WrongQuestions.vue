<script setup>
import { onMounted, ref } from 'vue';
import { del, get, getAllPages } from '../../api/http';
import { useI18n } from '../../composables/useI18n';
import { usePagination } from '../../composables/usePagination';
import { useToast } from '../../composables/useToast';
import FilterBar from '../../components/common/FilterBar.vue';
import PagedTable from '../../components/common/PagedTable.vue';

const { tr } = useI18n();
const toast = useToast();

const categories = ref([]);
// 管理台默认看全站（不传 userId 时后端对 staff 返回所有人的记录）
const list = usePagination('/practice/wrong-questions', {
  pageSize: 20,
  filters: { categoryId: '' }
});

const columns = [
  { key: 'username', label: tr('filterUser'), width: '130px' },
  { key: 'term_zh', label: '中文' },
  { key: 'term_vi', label: 'Tiếng Việt' },
  { key: 'category_zh', label: tr('categories'), width: '130px' },
  { key: 'wrong_count', label: tr('wrongQuestions'), width: '100px' },
  { key: 'last_wrong_at', label: '最近答错', width: '180px' },
  { key: 'actions', label: tr('actions'), width: '100px', align: 'right' }
];

onMounted(async () => {
  await list.load();
  try {
    categories.value = await getAllPages('/terms/categories/options');
  } catch {
    categories.value = [];
  }
});

async function remove(row) {
  if (!confirm(tr('confirmDelete'))) return;
  try {
    await del(`/practice/wrong-questions/${row.id}`);
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
        <h1>{{ tr('wrongQuestions') }}</h1>
        <p>{{ list.total.value }} 条</p>
      </div>
    </div>

    <FilterBar
      v-model:keyword="list.filters.keyword"
      :placeholder="tr('keywordPlaceholder')"
      @search="list.search"
      @reset="list.reset"
    >
      <select v-model="list.filters.categoryId" @change="list.search">
        <option value="">{{ tr('filterCategory') }}</option>
        <option v-for="cat in categories" :key="cat.id" :value="cat.id">{{ cat.name_zh }}</option>
      </select>
    </FilterBar>

    <PagedTable :pager="list" :columns="columns" :empty-text="tr('empty')">
      <template #cell-wrong_count="{ row }">
        <span class="tag">{{ row.wrong_count }}</span>
      </template>
      <template #cell-actions="{ row }">
        <button class="mini" @click="remove(row)">{{ tr('remove') }}</button>
      </template>
    </PagedTable>
  </section>
</template>

<style scoped>
.mini {
  padding: 3px 9px;
  font-size: 0.8rem;
}
</style>
