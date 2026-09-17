<script setup>
import { onMounted, reactive, ref } from 'vue';
import { del, post, put } from '../../api/http';
import { useAuth } from '../../composables/useAuth';
import { useI18n } from '../../composables/useI18n';
import { usePagination } from '../../composables/usePagination';
import { useToast } from '../../composables/useToast';
import FilterBar from '../../components/common/FilterBar.vue';
import PagedTable from '../../components/common/PagedTable.vue';
import Modal from '../../components/common/Modal.vue';

const { tr } = useI18n();
// 后端分类写接口的角色是 admin|teacher，对应这里的 isStaff
const { isStaff: isEditor } = useAuth();
const toast = useToast();

const showForm = ref(false);
const editingId = ref(null);
const saving = ref(false);
const formError = ref('');

const list = usePagination('/terms/categories', { pageSize: 10, filters: { status: '' } });

const form = reactive(emptyForm());

function emptyForm() {
  return { nameZh: '', nameEn: '', nameVi: '', sortOrder: 0, status: 'enabled' };
}

const columns = [
  { key: 'name_zh', label: '中文' },
  { key: 'name_en', label: 'English' },
  { key: 'name_vi', label: 'Tiếng Việt' },
  { key: 'term_count', label: tr('terms'), width: '90px', align: 'center' },
  { key: 'sort_order', label: tr('sortOrder'), width: '80px', align: 'center' },
  { key: 'status', label: tr('status'), width: '90px' },
  { key: 'actions', label: tr('actions'), width: '150px', align: 'right' }
];

onMounted(list.load);

function openCreate() {
  Object.assign(form, emptyForm());
  editingId.value = null;
  formError.value = '';
  showForm.value = true;
}

function openEdit(row) {
  Object.assign(form, {
    nameZh: row.name_zh || '',
    nameEn: row.name_en || '',
    nameVi: row.name_vi || '',
    sortOrder: row.sort_order ?? 0,
    status: row.status || 'enabled'
  });
  editingId.value = row.id;
  formError.value = '';
  showForm.value = true;
}

async function save() {
  formError.value = '';
  saving.value = true;
  // 分类接口从创建到更新统一吃 snake_case，别照搬用户模块的 camelCase。
  const payload = {
    name_zh: form.nameZh.trim(),
    name_en: form.nameEn.trim(),
    name_vi: form.nameVi.trim(),
    sort_order: Number(form.sortOrder) || 0,
    status: form.status
  };
  try {
    if (editingId.value) await put(`/terms/categories/${editingId.value}`, payload);
    else await post('/terms/categories', payload);
    showForm.value = false;
    await list.load();
    toast.success(tr('saved'));
  } catch (err) {
    formError.value = err.message;
  } finally {
    saving.value = false;
  }
}

async function remove(row) {
  if (!confirm(`${tr('confirmDelete')}\n${row.name_zh}`)) return;
  try {
    await del(`/terms/categories/${row.id}`);
    await list.load();
    toast.success(tr('deleted'));
  } catch (err) {
    // 分类下还有术语时后端会返回 400 并带上具体条数，原样透出即可。
    toast.error(err.message);
  }
}
</script>

<template>
  <section class="page">
    <div class="section-title">
      <div>
        <h1>{{ tr('categories') }}</h1>
        <p>{{ list.total.value }} 条</p>
      </div>
      <button v-if="isEditor" class="primary" @click="openCreate">{{ tr('create') }}</button>
    </div>

    <FilterBar
      v-model:keyword="list.filters.keyword"
      :placeholder="tr('keywordPlaceholder')"
      @search="list.search"
      @reset="list.reset"
    >
      <select v-model="list.filters.status" @change="list.search">
        <option value="">{{ tr('filterStatus') }}</option>
        <option value="enabled">{{ tr('enabled') }}</option>
        <option value="disabled">{{ tr('disabled') }}</option>
      </select>
    </FilterBar>

    <PagedTable :pager="list" :columns="columns" :empty-text="tr('empty')">
      <template #cell-name_zh="{ row }">
        <strong>{{ row.name_zh }}</strong>
      </template>
      <template #cell-term_count="{ row }">
        <span class="tag">{{ row.term_count }}</span>
      </template>
      <template #cell-status="{ row }">
        <span class="tag" :class="{ dim: row.status !== 'enabled' }">{{ tr(row.status) || row.status }}</span>
      </template>
      <template #cell-actions="{ row }">
        <template v-if="isEditor">
          <button class="mini" @click="openEdit(row)">{{ tr('edit') }}</button>
          <button class="mini" @click="remove(row)">{{ tr('remove') }}</button>
        </template>
        <span v-else class="muted">—</span>
      </template>
    </PagedTable>

    <Modal v-model="showForm" :title="editingId ? tr('edit') : tr('create')" width="560px">
      <form class="form-stack" @submit.prevent="save">
        <label>
          中文名称
          <input v-model="form.nameZh" required maxlength="100" />
        </label>
        <label>
          English
          <input v-model="form.nameEn" required maxlength="100" />
        </label>
        <label>
          Tiếng Việt
          <input v-model="form.nameVi" required maxlength="100" />
        </label>
        <div class="grid-2">
          <label>
            {{ tr('sortOrder') }}
            <input v-model.number="form.sortOrder" type="number" />
          </label>
          <label>
            {{ tr('status') }}
            <select v-model="form.status">
              <option value="enabled">{{ tr('enabled') }}</option>
              <option value="disabled">{{ tr('disabled') }}</option>
            </select>
          </label>
        </div>
        <p v-if="formError" class="error">{{ formError }}</p>
      </form>

      <template #footer>
        <button @click="showForm = false">{{ tr('cancel') }}</button>
        <button class="primary" :disabled="saving" @click="save">
          {{ saving ? tr('loading') : tr('save') }}
        </button>
      </template>
    </Modal>
  </section>
</template>

<style scoped>
.mini {
  padding: 3px 9px;
  font-size: 0.8rem;
  margin-left: 5px;
}

.muted {
  color: #97a6b3;
}

.dim {
  background: #f2f4f7;
  color: #758292;
}

.grid-2 {
  display: grid;
  gap: 12px;
  grid-template-columns: 1fr 1fr;
}

@media (max-width: 620px) {
  .grid-2 {
    grid-template-columns: 1fr;
  }
}
</style>
