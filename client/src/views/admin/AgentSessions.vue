<script setup>
import { onMounted, ref } from 'vue';
import { del, get } from '../../api/http';
import { useI18n } from '../../composables/useI18n';
import { usePagination } from '../../composables/usePagination';
import { useToast } from '../../composables/useToast';
import FilterBar from '../../components/common/FilterBar.vue';
import PagedTable from '../../components/common/PagedTable.vue';
import Modal from '../../components/common/Modal.vue';

const { tr } = useI18n();
const toast = useToast();

const models = ref([]);
const showDetail = ref(false);
const current = ref(null);

const list = usePagination('/agent/sessions', { pageSize: 10, filters: { model: '' } });

const messages = usePagination(() => (current.value ? `/agent/sessions/${current.value.id}/messages` : ''), {
  pageSize: 10
});

const columns = [
  { key: 'title', label: tr('sessionTitle') },
  { key: 'username', label: tr('filterUser'), width: '130px' },
  { key: 'model', label: tr('model'), width: '170px' },
  { key: 'message_count', label: tr('messageCount'), width: '90px', align: 'center' },
  { key: 'updated_at', label: tr('updatedAt'), width: '180px' },
  { key: 'actions', label: tr('actions'), width: '170px', align: 'right' }
];

onMounted(async () => {
  await list.load();
  try {
    const data = await get('/agent/models');
    models.value = data.models || [];
  } catch {
    models.value = [];
  }
});

async function openDetail(row) {
  current.value = row;
  messages.goPage(1);
  showDetail.value = true;
  try {
    await messages.load();
  } catch (err) {
    toast.error(err.message);
  }
}

async function remove(row) {
  if (!confirm(`${tr('confirmDelete')}\n${row.title || `#${row.id}`}`)) return;
  try {
    await del(`/agent/sessions/${row.id}`);
    await list.load();
    toast.success(tr('deleted'));
  } catch (err) {
    toast.error(err.message);
  }
}

function roleLabel(role) {
  return role === 'user' ? '👤' : role === 'assistant' ? '🤖' : '⚙️';
}
</script>

<template>
  <section class="page">
    <div class="section-title">
      <div>
        <h1>{{ tr('agentSessions') }}</h1>
        <p>{{ list.total.value }} 条</p>
      </div>
    </div>

    <FilterBar
      v-model:keyword="list.filters.keyword"
      :placeholder="tr('keywordPlaceholder')"
      @search="list.search"
      @reset="list.reset"
    >
      <select v-model="list.filters.model" @change="list.search">
        <option value="">{{ tr('model') }}</option>
        <option v-for="item in models" :key="item.name" :value="item.name">{{ item.name }}</option>
      </select>
    </FilterBar>

    <PagedTable :pager="list" :columns="columns" :empty-text="tr('empty')">
      <template #cell-title="{ row }">
        <strong>{{ row.title || '—' }}</strong>
      </template>
      <template #cell-username="{ row }">
        {{ row.username }}
        <div class="sub">{{ row.real_name }}</div>
      </template>
      <template #cell-model="{ row }">
        <span class="tag">{{ row.model }}</span>
      </template>
      <template #cell-actions="{ row }">
        <button class="mini" @click="openDetail(row)">{{ tr('viewDetail') }}</button>
        <button class="mini" @click="remove(row)">{{ tr('remove') }}</button>
      </template>
    </PagedTable>

    <Modal v-model="showDetail" :title="`${tr('messages')} · ${current?.title || ''}`" width="820px">
      <PagedTable
        :pager="messages"
        :columns="[
          { key: 'role', label: '', width: '56px', align: 'center' },
          { key: 'content', label: tr('messages') },
          { key: 'model', label: tr('model'), width: '150px' },
          { key: 'created_at', label: tr('createdAt'), width: '170px' }
        ]"
        :empty-text="tr('empty')"
      >
        <template #cell-role="{ row }">
          <span>{{ roleLabel(row.role) }}</span>
        </template>
        <template #cell-content="{ row }">
          <!-- 消息里可能带换行，用 pre-wrap 保留排版 -->
          <div class="content">{{ row.content }}</div>
        </template>
      </PagedTable>
      <p class="hint">消息按时间倒序返回：第 1 页是最新的对话。</p>
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

.content {
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 180px;
  overflow-y: auto;
}

.hint {
  margin: 10px 0 0;
  color: #8593a1;
  font-size: 0.8rem;
}
</style>
