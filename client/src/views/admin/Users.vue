<script setup>
import { onMounted, reactive, ref } from 'vue';
import { del, get, getAllPages, post, put } from '../../api/http';
import { useAuth } from '../../composables/useAuth';
import { useI18n } from '../../composables/useI18n';
import { usePagination } from '../../composables/usePagination';
import { useToast } from '../../composables/useToast';
import FilterBar from '../../components/common/FilterBar.vue';
import PagedTable from '../../components/common/PagedTable.vue';
import Modal from '../../components/common/Modal.vue';

const { tr } = useI18n();
const { isAdmin, user: me } = useAuth();
const toast = useToast();

const roles = ref([]);
const showForm = ref(false);
const editingId = ref(null);
const saving = ref(false);
const formError = ref('');

const list = usePagination('/system/users', {
  pageSize: 10,
  filters: { roleId: '', status: '' }
});

const form = reactive(emptyForm());

function emptyForm() {
  return {
    username: '',
    password: '',
    realName: '',
    email: '',
    phone: '',
    roleId: '',
    status: 'enabled'
  };
}

const columns = [
  { key: 'username', label: tr('username'), width: '150px' },
  { key: 'real_name', label: tr('realName'), width: '140px' },
  { key: 'email', label: tr('email') },
  { key: 'phone', label: tr('phone'), width: '140px' },
  { key: 'role_name', label: tr('role'), width: '120px' },
  { key: 'status', label: tr('status'), width: '90px' },
  { key: 'last_login_at', label: tr('lastLogin'), width: '180px' },
  { key: 'actions', label: tr('actions'), width: '230px', align: 'right' }
];

onMounted(async () => {
  await Promise.all([list.load(), loadRoles()]);
});

async function loadRoles() {
  try {
    roles.value = await getAllPages('/system/roles/options');
  } catch (err) {
    toast.error(err.message);
  }
}

function openCreate() {
  Object.assign(form, emptyForm(), { roleId: roles.value[0]?.id ?? '' });
  editingId.value = null;
  formError.value = '';
  showForm.value = true;
}

function openEdit(row) {
  Object.assign(form, {
    username: row.username,
    password: '',
    realName: row.real_name || '',
    email: row.email || '',
    phone: row.phone || '',
    roleId: row.role_id ?? '',
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
      await put(`/system/users/${editingId.value}`, {
        realName: form.realName,
        email: form.email,
        phone: form.phone,
        roleId: form.roleId,
        status: form.status
      });
    } else {
      await post('/system/users', {
        username: form.username.trim(),
        password: form.password || '123456',
        realName: form.realName.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        roleId: Number(form.roleId),
        status: form.status
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
  if (!confirm(`${tr('confirmDelete')}\n${row.username}`)) return;
  try {
    await del(`/system/users/${row.id}`);
    await list.load();
    toast.success(tr('deleted'));
  } catch (err) {
    toast.error(err.message);
  }
}

async function resetPassword(row) {
  if (!confirm(`${tr('resetPasswordHint')}: ${row.username} → 123456`)) return;
  try {
    const data = await post(`/system/users/${row.id}/reset-password`, {});
    toast.success(`${tr('resetPassword')}: ${data.password}`);
  } catch (err) {
    toast.error(err.message);
  }
}
</script>

<template>
  <section class="page">
    <div class="section-title">
      <div>
        <h1>{{ tr('users') }}</h1>
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
      <select v-model="list.filters.roleId" @change="list.search">
        <option value="">{{ tr('filterRole') }}</option>
        <option v-for="role in roles" :key="role.id" :value="role.id">{{ role.name_zh }}</option>
      </select>
      <select v-model="list.filters.status" @change="list.search">
        <option value="">{{ tr('filterStatus') }}</option>
        <option value="enabled">{{ tr('enabled') }}</option>
        <option value="disabled">{{ tr('disabled') }}</option>
      </select>
    </FilterBar>

    <PagedTable :pager="list" :columns="columns" :empty-text="tr('empty')">
      <template #cell-status="{ row }">
        <span class="tag" :class="{ dim: row.status !== 'enabled' }">{{ tr(row.status) || row.status }}</span>
      </template>

      <template #cell-actions="{ row }">
        <template v-if="isAdmin">
          <button class="mini" @click="openEdit(row)">{{ tr('edit') }}</button>
          <button class="mini" @click="resetPassword(row)">{{ tr('resetPassword') }}</button>
          <button class="mini" :disabled="row.id === me?.id" @click="remove(row)">{{ tr('remove') }}</button>
        </template>
        <span v-else class="muted">—</span>
      </template>
    </PagedTable>

    <Modal v-model="showForm" :title="editingId ? tr('edit') : tr('create')" width="560px">
      <form class="form-stack" @submit.prevent="save">
        <label>
          {{ tr('username') }}
          <input v-model="form.username" :disabled="Boolean(editingId)" required minlength="3" maxlength="50" />
        </label>

        <label v-if="!editingId">
          {{ tr('password') }}
          <input v-model="form.password" type="password" placeholder="留空则默认 123456" minlength="6" />
        </label>

        <label>
          {{ tr('realName') }}
          <input v-model="form.realName" required maxlength="80" />
        </label>

        <label>
          {{ tr('email') }}
          <input v-model="form.email" type="email" maxlength="120" />
        </label>

        <label>
          {{ tr('phone') }}
          <input v-model="form.phone" maxlength="30" />
        </label>

        <label>
          {{ tr('role') }}
          <select v-model="form.roleId" required>
            <option v-for="role in roles" :key="role.id" :value="role.id">{{ role.name_zh }}</option>
          </select>
        </label>

        <label>
          {{ tr('status') }}
          <select v-model="form.status">
            <option value="enabled">{{ tr('enabled') }}</option>
            <option value="disabled">{{ tr('disabled') }}</option>
          </select>
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
  </section>
</template>

<style scoped>
.mini {
  padding: 3px 9px;
  font-size: 0.8rem;
  margin-left: 5px;
}

.dim {
  background: #f2f4f7;
  color: #758292;
}

.muted {
  color: #97a6b3;
}
</style>
