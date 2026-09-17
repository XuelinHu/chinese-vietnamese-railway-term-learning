<script setup>
import { onMounted } from 'vue';
import { useI18n } from '../../composables/useI18n';
import { usePagination } from '../../composables/usePagination';
import FilterBar from '../../components/common/FilterBar.vue';
import PagedTable from '../../components/common/PagedTable.vue';

const { tr } = useI18n();

const list = usePagination('/system/logs/login', { pageSize: 20, filters: { success: '' } });

const columns = [
  { key: 'username', label: tr('username'), width: '150px' },
  { key: 'ip', label: 'IP', width: '150px' },
  { key: 'message', label: tr('status') },
  { key: 'user_agent', label: 'User-Agent' },
  { key: 'success', label: tr('status'), width: '90px', align: 'right' },
  { key: 'created_at', label: tr('createdAt'), width: '180px' }
];

onMounted(list.load);
</script>

<template>
  <section class="page">
    <div class="section-title">
      <div>
        <h1>{{ tr('loginLogs') }}</h1>
        <p>{{ list.total.value }} 条</p>
      </div>
    </div>

    <FilterBar
      v-model:keyword="list.filters.keyword"
      :placeholder="tr('keywordPlaceholder')"
      @search="list.search"
      @reset="list.reset"
    >
      <select v-model="list.filters.success" @change="list.search">
        <option value="">{{ tr('all') }}</option>
        <option value="1">OK</option>
        <option value="0">FAIL</option>
      </select>
    </FilterBar>

    <PagedTable :pager="list" :columns="columns" :empty-text="tr('empty')">
      <template #cell-success="{ row }">
        <span :class="row.success ? 'ok' : 'error'">{{ row.success ? 'OK' : 'FAIL' }}</span>
      </template>
      <template #cell-user_agent="{ row }">
        <small class="ua">{{ row.user_agent }}</small>
      </template>
    </PagedTable>
  </section>
</template>

<style scoped>
.ua {
  display: block;
  max-width: 320px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
