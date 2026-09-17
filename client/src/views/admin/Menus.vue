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
const { isAdmin } = useAuth();
const toast = useToast();

const menuTree = ref([]);
const showForm = ref(false);
const editingId = ref(null);
const saving = ref(false);
const formError = ref('');

const list = usePagination('/system/menus', { pageSize: 20, filters: { status: '' } });

const form = reactive(emptyForm());

function emptyForm() {
  return {
    parentId: 0,
    code: '',
    path: '',
    icon: '',
    nameZh: '',
    nameEn: '',
    nameVi: '',
    sortOrder: 0,
    status: 'enabled'
  };
}

/** 把菜单树压平成带缩进的下拉项——树的层级由数据决定，写死两级会漏掉更深的自建菜单。 */
const parentOptions = computed(() => {
  const out = [];
  const walk = (nodes, depth) => {
    nodes.forEach((node) => {
      out.push({ id: node.id, label: `${'　'.repeat(depth)}${node.name_zh}`, depth });
      if (node.children?.length) walk(node.children, depth + 1);
    });
  };
  walk(menuTree.value, 0);
  return out;
});

const columns = [
  { key: 'name_zh', label: '菜单名称' },
  { key: 'code', label: tr('menuCode'), width: '160px' },
  { key: 'path', label: 'Path', width: '170px' },
  { key: 'parent_name', label: tr('parentMenu'), width: '120px' },
  { key: 'icon', label: tr('icon'), width: '70px', align: 'center' },
  { key: 'sort_order', label: tr('sortOrder'), width: '80px', align: 'center' },
  { key: 'status', label: tr('status'), width: '90px' },
  { key: 'actions', label: tr('actions'), width: '170px', align: 'right' }
];

onMounted(async () => {
  await Promise.all([list.load(), loadTree()]);
});

async function loadTree() {
  try {
    menuTree.value = await get('/system/menus/tree');
  } catch (err) {
    toast.error(err.message);
  }
}

function openCreate() {
  Object.assign(form, emptyForm());
  editingId.value = null;
  formError.value = '';
  showForm.value = true;
}

function openEdit(row) {
  Object.assign(form, {
    parentId: row.parent_id ?? 0,
    code: row.code,
    path: row.path || '',
    icon: row.icon || '',
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
  try {
    if (editingId.value) {
      // 更新接口两种命名都收，这里统一用 snake_case 与其它模块保持一致。
      await put(`/system/menus/${editingId.value}`, {
        parent_id: Number(form.parentId) || 0,
        code: form.code.trim(),
        path: form.path.trim(),
        icon: form.icon.trim(),
        name_zh: form.nameZh.trim(),
        name_en: form.nameEn.trim(),
        name_vi: form.nameVi.trim(),
        sort_order: Number(form.sortOrder) || 0,
        status: form.status
      });
    } else {
      await post('/system/menus', {
        parentId: Number(form.parentId) || 0,
        code: form.code.trim(),
        path: form.path.trim(),
        icon: form.icon.trim(),
        nameZh: form.nameZh.trim(),
        nameEn: form.nameEn.trim(),
        nameVi: form.nameVi.trim(),
        sortOrder: Number(form.sortOrder) || 0
      });
    }
    showForm.value = false;
    await Promise.all([list.load(), loadTree()]);
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
    await del(`/system/menus/${row.id}`);
    await Promise.all([list.load(), loadTree()]);
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
        <h1>{{ tr('menus') }}</h1>
        <p>{{ list.total.value }} 条</p>
      </div>
      <button v-if="isAdmin" class="primary" @click="openCreate">{{ tr('create') }}</button>
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
        <div class="sub">{{ row.name_vi }}</div>
      </template>
      <template #cell-code="{ row }">
        <span class="tag">{{ row.code }}</span>
      </template>
      <template #cell-parent_name="{ row }">
        <span v-if="row.parent_name">{{ row.parent_name }}</span>
        <span v-else class="muted">—</span>
      </template>
      <template #cell-status="{ row }">
        <span class="tag" :class="{ dim: row.status !== 'enabled' }">{{ tr(row.status) || row.status }}</span>
      </template>
      <template #cell-actions="{ row }">
        <template v-if="isAdmin">
          <button class="mini" @click="openEdit(row)">{{ tr('edit') }}</button>
          <button class="mini" @click="remove(row)">{{ tr('remove') }}</button>
        </template>
        <span v-else class="muted">—</span>
      </template>
    </PagedTable>

    <Modal v-model="showForm" :title="editingId ? tr('edit') : tr('create')" width="620px">
      <form class="form-stack" @submit.prevent="save">
        <label>
          {{ tr('parentMenu') }}
          <select v-model="form.parentId">
            <option :value="0">{{ tr('rootMenu') }}</option>
            <option v-for="item in parentOptions" :key="item.id" :value="item.id" :disabled="item.id === editingId">
              {{ item.label }}
            </option>
          </select>
        </label>

        <label>
          {{ tr('menuCode') }}
          <input v-model="form.code" required pattern="[a-z][a-z0-9._-]*" />
          <small class="field-hint">小写字母开头，可含数字、点、下划线、横线，如 admin.users</small>
        </label>

        <label>
          Path
          <input v-model="form.path" required maxlength="120" placeholder="/admin/users" />
        </label>

        <label>
          {{ tr('icon') }}
          <input v-model="form.icon" maxlength="8" placeholder="📚" />
        </label>

        <div class="grid-3">
          <label>
            中文名
            <input v-model="form.nameZh" required maxlength="80" />
          </label>
          <label>
            English
            <input v-model="form.nameEn" required maxlength="80" />
          </label>
          <label>
            Tiếng Việt
            <input v-model="form.nameVi" required maxlength="80" />
          </label>
        </div>

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

.sub {
  color: #8593a1;
  font-size: 0.78rem;
}

.muted {
  color: #97a6b3;
}

.dim {
  background: #f2f4f7;
  color: #758292;
}

.field-hint {
  color: #8593a1;
  font-size: 0.78rem;
  font-weight: 500;
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

@media (max-width: 620px) {
  .grid-2,
  .grid-3 {
    grid-template-columns: 1fr;
  }
}
</style>
