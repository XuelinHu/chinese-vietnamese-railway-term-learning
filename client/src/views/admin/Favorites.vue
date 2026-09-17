<script setup>
import { onMounted, ref } from 'vue';
import { del, get } from '../../api/http';
import { useI18n } from '../../composables/useI18n';
import { usePagination } from '../../composables/usePagination';
import { useToast } from '../../composables/useToast';
import FilterBar from '../../components/common/FilterBar.vue';
import PagedTable from '../../components/common/PagedTable.vue';

const { tr } = useI18n();
const toast = useToast();

const categories = ref([]);
const list = usePagination('/practice/favorites', { pageSize: 20, filters: { categoryId: '' } });

const columns = [
  { key: 'username', label: tr('filterUser'), width: '130px' },
  { key: 'term_zh', label: '中文' },
  { key: 'term_vi', label: 'Tiếng Việt' },
  { key: 'term_en', label: 'English' },
  { key: 'difficulty', label: tr('difficulty'), width: '100px' },
  { key: 'category_zh', label: tr('categories'), width: '130px' },
  { key: 'created_at', label: tr('createdAt'), width: '180px' },
  { key: 'actions', label: tr('actions'), width: '100px', align: 'right' }
];

onMounted(async () => {
  await list.load();
  try {
    categories.value = await get('/terms/categories/options');
  } catch {
    categories.value = [];
  }
});

async function remove(row) {
  if (!confirm(tr('confirmDelete'))) return;
  try {
    await del(`/practice/favorites/${row.id}`);
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
        <h1>{{ tr('favorites') }}</h1>
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
      <template #cell-difficulty="{ row }">
        <span class="tag">{{ tr(row.difficulty) || row.difficulty }}</span>
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
