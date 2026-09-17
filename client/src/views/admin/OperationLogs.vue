<script setup>
import { onMounted, ref } from 'vue';
import { get } from '../../api/http';
import { useI18n } from '../../composables/useI18n';
import { usePagination } from '../../composables/usePagination';
import FilterBar from '../../components/common/FilterBar.vue';
import PagedTable from '../../components/common/PagedTable.vue';

const { tr } = useI18n();

const modules = ref([]);
const list = usePagination('/system/logs/operation', { pageSize: 20, filters: { module: '' } });

const columns = [
  { key: 'username', label: tr('username'), width: '130px' },
  { key: 'module', label: '模块', width: '110px' },
  { key: 'action', label: '动作', width: '150px' },
  { key: 'detail', label: '详情' },
  { key: 'path', label: 'Path', width: '190px' },
  { key: 'status', label: tr('status'), width: '80px', align: 'right' },
  { key: 'created_at', label: tr('createdAt'), width: '180px' }
];

onMounted(async () => {
  await list.load();
  try {
    modules.value = await get('/system/logs/modules');
  } catch {
    modules.value = [];
  }
});
</script>

<template>
  <section class="page">
    <div class="section-title">
      <div>
        <h1>{{ tr('operationLogs') }}</h1>
        <p>{{ list.total.value }} 条</p>
      </div>
    </div>

    <FilterBar
      v-model:keyword="list.filters.keyword"
      :placeholder="tr('keywordPlaceholder')"
      @search="list.search"
      @reset="list.reset"
    >
      <select v-model="list.filters.module" @change="list.search">
        <option value="">全部模块</option>
        <option v-for="item in modules" :key="item" :value="item">{{ item }}</option>
      </select>
    </FilterBar>

    <PagedTable :pager="list" :columns="columns" :empty-text="tr('empty')">
      <template #cell-module="{ row }">
        <span class="tag">{{ row.module }}</span>
      </template>
      <template #cell-status="{ row }">
        <span :class="Number(row.status) < 400 ? 'ok' : 'error'">{{ row.status }}</span>
      </template>
    </PagedTable>
  </section>
</template>
