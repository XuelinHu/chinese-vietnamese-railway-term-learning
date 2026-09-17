<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { del, get, post, put } from '../../api/http';
import { useAuth } from '../../composables/useAuth';
import { useI18n } from '../../composables/useI18n';
import { usePagination } from '../../composables/usePagination';
import { useToast } from '../../composables/useToast';
import FilterBar from '../../components/common/FilterBar.vue';
import PagedTable from '../../components/common/PagedTable.vue';
import Modal from '../../components/common/Modal.vue';

const { tr } = useI18n();
const { isStaff } = useAuth();
const toast = useToast();

const categories = ref([]);
const selected = ref(new Set());
const showForm = ref(false);
const editingId = ref(null);
const saving = ref(false);
const formError = ref('');

const list = usePagination('/terms', {
  pageSize: 10,
  filters: { categoryId: '', difficulty: '', status: '' }
});

const form = reactive(emptyForm());

function emptyForm() {
  return {
    categoryId: '',
    termZh: '',
    termEn: '',
    termVi: '',
    pinyin: '',
    difficulty: 'easy',
    definitionZh: '',
    definitionEn: '',
    definitionVi: '',
    exampleZh: '',
    exampleEn: '',
    exampleVi: '',
    status: 'enabled'
  };
}

const columns = [
  { key: 'select', label: '', width: '42px', align: 'center' },
  { key: 'term_zh', label: '中文术语' },
  { key: 'term_vi', label: 'Tiếng Việt' },
  { key: 'term_en', label: 'English' },
  { key: 'pinyin', label: 'Pinyin', width: '110px' },
  { key: 'category_zh', label: tr('categories'), width: '120px' },
  { key: 'difficulty', label: tr('difficulty'), width: '90px' },
  { key: 'status', label: tr('status'), width: '90px' },
  { key: 'actions', label: tr('actions'), width: '150px', align: 'right' }
];

const allChecked = computed(
  () => list.rows.value.length > 0 && list.rows.value.every((row) => selected.value.has(row.id))
);

onMounted(async () => {
  await Promise.all([list.load(), loadCategories()]);
});

async function loadCategories() {
  try {
    categories.value = await get('/terms/categories/options');
  } catch (err) {
    toast.error(err.message);
  }
}

/* ------------------------------ 选择与批量 ------------------------------ */

function toggleRow(id) {
  const next = new Set(selected.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  selected.value = next;
}

function toggleAll() {
  const next = new Set(selected.value);
  if (allChecked.value) list.rows.value.forEach((row) => next.delete(row.id));
  else list.rows.value.forEach((row) => next.add(row.id));
  selected.value = next;
}

async function batchStatus(status) {
  const ids = [...selected.value];
  if (!ids.length) return toast.error(tr('selectAtLeastOne'));
  try {
    const data = await put('/terms/batch/status', { ids, status });
    selected.value = new Set();
    await list.load();
    toast.success(`${tr('saved')} (${data.count})`);
  } catch (err) {
    toast.error(err.message);
  }
}

/* ------------------------------ 增删改 ------------------------------ */

function openCreate() {
  Object.assign(form, emptyForm(), { categoryId: categories.value[0]?.id ?? '' });
  editingId.value = null;
  formError.value = '';
  showForm.value = true;
}

function openEdit(row) {
  Object.assign(form, {
    categoryId: row.category_id,
    termZh: row.term_zh || '',
    termEn: row.term_en || '',
    termVi: row.term_vi || '',
    pinyin: row.pinyin || '',
    difficulty: row.difficulty || 'easy',
    definitionZh: row.definition_zh || '',
    definitionEn: row.definition_en || '',
    definitionVi: row.definition_vi || '',
    exampleZh: row.example_zh || '',
    exampleEn: row.example_en || '',
    exampleVi: row.example_vi || '',
    status: row.status || 'enabled'
  });
  editingId.value = row.id;
  formError.value = '';
  showForm.value = true;
}

async function save() {
  formError.value = '';
  saving.value = true;
  // 后端用的是具名占位符，缺字段会绑定成 undefined 报错，所以这里每个字段都给上。
  const payload = {
    category_id: Number(form.categoryId),
    term_zh: form.termZh.trim(),
    term_en: form.termEn.trim(),
    term_vi: form.termVi.trim(),
    pinyin: form.pinyin.trim(),
    difficulty: form.difficulty,
    definition_zh: form.definitionZh.trim(),
    definition_en: form.definitionEn.trim(),
    definition_vi: form.definitionVi.trim(),
    example_zh: form.exampleZh.trim(),
    example_en: form.exampleEn.trim(),
    example_vi: form.exampleVi.trim(),
    status: form.status
  };
  try {
    if (editingId.value) await put(`/terms/${editingId.value}`, payload);
    else await post('/terms', payload);
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
  if (!confirm(`${tr('confirmDelete')}\n${row.term_zh}`)) return;
  try {
    await del(`/terms/${row.id}`);
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
        <h1>{{ tr('termsAdmin') }}</h1>
        <p>{{ list.total.value }} 条</p>
      </div>
      <div class="bulk" v-if="isStaff">
        <button :disabled="!selected.size" @click="batchStatus('enabled')">{{ tr('batchEnable') }}</button>
        <button :disabled="!selected.size" @click="batchStatus('disabled')">{{ tr('batchDisable') }}</button>
        <button class="primary" @click="openCreate">{{ tr('create') }}</button>
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
      <select v-model="list.filters.difficulty" @change="list.search">
        <option value="">{{ tr('difficulty') }}</option>
        <option value="easy">{{ tr('easy') }}</option>
        <option value="medium">{{ tr('medium') }}</option>
        <option value="hard">{{ tr('hard') }}</option>
      </select>
      <select v-model="list.filters.status" @change="list.search">
        <option value="">{{ tr('filterStatus') }}</option>
        <option value="enabled">{{ tr('enabled') }}</option>
        <option value="disabled">{{ tr('disabled') }}</option>
      </select>
    </FilterBar>

    <PagedTable :pager="list" :columns="columns" :empty-text="tr('empty')">
      <template #cell-select="{ row }">
        <input type="checkbox" :checked="selected.has(row.id)" @change="toggleRow(row.id)" />
      </template>
      <template #cell-term_zh="{ row }">
        <strong>{{ row.term_zh }}</strong>
        <div class="sub">{{ row.definition_zh }}</div>
      </template>
      <template #cell-difficulty="{ row }">
        <span class="tag" :class="row.difficulty">{{ tr(row.difficulty) || row.difficulty }}</span>
      </template>
      <template #cell-status="{ row }">
        <span class="tag" :class="{ dim: row.status !== 'enabled' }">{{ tr(row.status) || row.status }}</span>
      </template>
      <template #cell-actions="{ row }">
        <template v-if="isStaff">
          <button class="mini" @click="openEdit(row)">{{ tr('edit') }}</button>
          <button class="mini" @click="remove(row)">{{ tr('remove') }}</button>
        </template>
        <span v-else class="muted">—</span>
      </template>
    </PagedTable>

    <div class="select-all" v-if="list.rows.value.length">
      <label>
        <input type="checkbox" :checked="allChecked" @change="toggleAll" />
        {{ tr('selectAllPage') }}
      </label>
      <span v-if="selected.size" class="muted">{{ tr('selected') }}: {{ selected.size }}</span>
    </div>

    <Modal v-model="showForm" :title="editingId ? tr('edit') : tr('create')" width="760px">
      <form class="form-stack" @submit.prevent="save">
        <div class="grid-2">
          <label>
            {{ tr('categories') }}
            <select v-model="form.categoryId" required>
              <option v-for="cat in categories" :key="cat.id" :value="cat.id">{{ cat.name_zh }}</option>
            </select>
          </label>
          <label>
            {{ tr('difficulty') }}
            <select v-model="form.difficulty">
              <option value="easy">{{ tr('easy') }}</option>
              <option value="medium">{{ tr('medium') }}</option>
              <option value="hard">{{ tr('hard') }}</option>
            </select>
          </label>
        </div>

        <div class="grid-3">
          <label>
            中文术语
            <input v-model="form.termZh" required maxlength="120" />
          </label>
          <label>
            Tiếng Việt
            <input v-model="form.termVi" required maxlength="120" />
          </label>
          <label>
            English
            <input v-model="form.termEn" required maxlength="120" />
          </label>
        </div>

        <div class="grid-2">
          <label>
            Pinyin
            <input v-model="form.pinyin" maxlength="120" />
          </label>
          <label>
            {{ tr('status') }}
            <select v-model="form.status">
              <option value="enabled">{{ tr('enabled') }}</option>
              <option value="disabled">{{ tr('disabled') }}</option>
            </select>
          </label>
        </div>

        <label>
          中文释义
          <textarea v-model="form.definitionZh" rows="2"></textarea>
        </label>
        <div class="grid-2">
          <label>
            Vietnamese definition
            <textarea v-model="form.definitionVi" rows="2"></textarea>
          </label>
          <label>
            English definition
            <textarea v-model="form.definitionEn" rows="2"></textarea>
          </label>
        </div>

        <label>
          中文例句
          <textarea v-model="form.exampleZh" rows="2"></textarea>
        </label>
        <div class="grid-2">
          <label>
            Ví dụ
            <textarea v-model="form.exampleVi" rows="2"></textarea>
          </label>
          <label>
            Example
            <textarea v-model="form.exampleEn" rows="2"></textarea>
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

.bulk {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.sub {
  color: #8593a1;
  font-size: 0.78rem;
  max-width: 320px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.muted {
  color: #97a6b3;
}

.dim {
  background: #f2f4f7;
  color: #758292;
}

.tag.easy {
  background: #e7f6ef;
  color: #0f766e;
}

.tag.medium {
  background: #fdf2e3;
  color: #a16207;
}

.tag.hard {
  background: #fdecec;
  color: #b42318;
}

.select-all {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-top: 10px;
  font-size: 0.85rem;
}

.select-all input {
  width: auto;
  margin-right: 6px;
}

.grid-2,
.grid-3 {
  display: grid;
  gap: 12px;
}

.grid-2 {
  grid-template-columns: 1fr 1fr;
}

.grid-3 {
  grid-template-columns: repeat(3, 1fr);
}

@media (max-width: 700px) {
  .grid-2,
  .grid-3 {
    grid-template-columns: 1fr;
  }
}
</style>
