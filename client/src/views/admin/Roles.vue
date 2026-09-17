<script setup>
import { onMounted, reactive, ref } from 'vue';
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

const showForm = ref(false);
const editingId = ref(null);
const saving = ref(false);
const formError = ref('');

const showGrant = ref(false);
const grantRole = ref(null);
const menuTree = ref([]);
const checkedMenus = ref(new Set());
const savingGrant = ref(false);

const list = usePagination('/system/roles', { pageSize: 10 });

const form = reactive(emptyForm());

function emptyForm() {
  return { code: '', nameZh: '', nameEn: '', nameVi: '', remark: '' };
}

const columns = [
  { key: 'code', label: tr('roleCode'), width: '130px' },
  { key: 'name_zh', label: '中文名', width: '140px' },
  { key: 'name_en', label: 'English', width: '150px' },
  { key: 'name_vi', label: 'Tiếng Việt', width: '160px' },
  { key: 'user_count', label: tr('users'), width: '90px' },
  { key: 'menu_count', label: tr('menuPermissions'), width: '100px' },
  { key: 'remark', label: tr('remark') },
  { key: 'actions', label: tr('actions'), width: '250px', align: 'right' }
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
    code: row.code,
    nameZh: row.name_zh || '',
    nameEn: row.name_en || '',
    nameVi: row.name_vi || '',
    remark: row.remark || ''
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
      // 更新接口用的是 snake_case，和创建接口的 camelCase 不一样，别写混。
      await put(`/system/roles/${editingId.value}`, {
        name_zh: form.nameZh,
        name_en: form.nameEn,
        name_vi: form.nameVi,
        remark: form.remark
      });
    } else {
      await post('/system/roles', {
        code: form.code.trim(),
        nameZh: form.nameZh.trim(),
        nameEn: form.nameEn.trim(),
        nameVi: form.nameVi.trim(),
        remark: form.remark.trim()
      });
    }
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
    await del(`/system/roles/${row.id}`);
    await list.load();
    toast.success(tr('deleted'));
  } catch (err) {
    toast.error(err.message);
  }
}

/* --------------------------- 菜单授权 --------------------------- */

async function openGrant(row) {
  grantRole.value = row;
  showGrant.value = true;
  try {
    const [tree, granted] = await Promise.all([
      get('/system/menus/tree'),
      get(`/system/roles/${row.id}/menus`)
    ]);
    menuTree.value = tree;
    checkedMenus.value = new Set(granted.menuIds || []);
  } catch (err) {
    toast.error(err.message);
  }
}

function toggleMenu(id) {
  const next = new Set(checkedMenus.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  checkedMenus.value = next;
}

/** 勾选父菜单时把子菜单一并选上，避免出现「有父无子」的空菜单。 */
function toggleBranch(node) {
  const next = new Set(checkedMenus.value);
  const on = !next.has(node.id);
  const apply = (item) => {
    if (on) next.add(item.id);
    else next.delete(item.id);
    (item.children || []).forEach(apply);
  };
  apply(node);
  checkedMenus.value = next;
}

async function saveGrant() {
  savingGrant.value = true;
  try {
    await put(`/system/roles/${grantRole.value.id}/menus`, { menuIds: [...checkedMenus.value] });
    showGrant.value = false;
    await list.load();
    toast.success(tr('permissionSaved'));
  } catch (err) {
    toast.error(err.message);
  } finally {
    savingGrant.value = false;
  }
}
</script>

<template>
  <section class="page">
    <div class="section-title">
      <div>
        <h1>{{ tr('roles') }}</h1>
        <p>{{ list.total.value }} 条</p>
      </div>
      <button v-if="isAdmin" class="primary" @click="openCreate">{{ tr('create') }}</button>
    </div>

    <FilterBar
      v-model:keyword="list.filters.keyword"
      :placeholder="tr('keywordPlaceholder')"
      @search="list.search"
      @reset="list.reset"
    />

    <PagedTable :pager="list" :columns="columns" :empty-text="tr('empty')">
      <template #cell-code="{ row }">
        <span class="tag">{{ row.code }}</span>
      </template>

      <template #cell-actions="{ row }">
        <button class="mini" @click="openGrant(row)">{{ tr('grantMenus') }}</button>
        <template v-if="isAdmin">
          <button class="mini" @click="openEdit(row)">{{ tr('edit') }}</button>
          <button class="mini" @click="remove(row)">{{ tr('remove') }}</button>
        </template>
      </template>
    </PagedTable>

    <Modal v-model="showForm" :title="editingId ? tr('edit') : tr('create')" width="560px">
      <form class="form-stack" @submit.prevent="save">
        <label>
          {{ tr('roleCode') }}
          <input v-model="form.code" :disabled="Boolean(editingId)" required pattern="[a-z][a-z0-9_-]*" />
          <small class="field-hint">小写字母开头，可含数字、下划线、横线</small>
        </label>
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
        <label>
          {{ tr('remark') }}
          <textarea v-model="form.remark" maxlength="255"></textarea>
        </label>
        <p v-if="formError" class="error">{{ formError }}</p>
      </form>

      <template #footer>
        <button @click="showForm = false">{{ tr('cancel') }}</button>
        <button class="primary" :disabled="saving" @click="save">
          {{ saving ? tr('loading') : tr('save') }}
        </button>
      </template>
    </Modal>

    <Modal v-model="showGrant" :title="`${tr('grantMenus')} · ${grantRole?.name_zh || ''}`" width="560px">
      <div class="menu-tree">
        <div v-for="node in menuTree" :key="node.id" class="tree-node">
          <label class="tree-parent">
            <input
              type="checkbox"
              :checked="checkedMenus.has(node.id)"
              @change="toggleBranch(node)"
            />
            <span>{{ node.icon }} {{ node.name_zh }}</span>
            <code>{{ node.code }}</code>
          </label>
          <div v-if="node.children?.length" class="tree-children">
            <label v-for="child in node.children" :key="child.id">
              <input
                type="checkbox"
                :checked="checkedMenus.has(child.id)"
                @change="toggleMenu(child.id)"
              />
              <span>{{ child.icon }} {{ child.name_zh }}</span>
              <code>{{ child.code }}</code>
            </label>
          </div>
        </div>
      </div>

      <template #footer>
        <button @click="showGrant = false">{{ tr('cancel') }}</button>
        <button class="primary" :disabled="savingGrant" @click="saveGrant">
          {{ savingGrant ? tr('loading') : tr('save') }}
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

.field-hint {
  color: #8593a1;
  font-size: 0.78rem;
  font-weight: 500;
}

.menu-tree {
  display: grid;
  gap: 12px;
  max-height: 52vh;
  overflow-y: auto;
}

.tree-node {
  border-bottom: 1px solid #eef2f6;
  padding-bottom: 10px;
}

.tree-parent,
.tree-children label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 500;
  font-size: 0.9rem;
}

.tree-parent input,
.tree-children input {
  width: auto;
}

.tree-children {
  display: grid;
  gap: 7px;
  margin: 8px 0 0 22px;
}

code {
  color: #8593a1;
  font-size: 0.76rem;
}
</style>
