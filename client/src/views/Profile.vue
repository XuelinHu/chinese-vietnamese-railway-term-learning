<script setup>
import { onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { get, put, qs } from '../api/http';
import { startOidc } from '../api/oidc';
import { useAuth } from '../composables/useAuth';
import { useI18n } from '../composables/useI18n';
import { usePagination } from '../composables/usePagination';
import { useToast } from '../composables/useToast';
import DataTable from '../components/common/DataTable.vue';
import PaginationBar from '../components/common/PaginationBar.vue';

const { user, refreshProfile, logout } = useAuth();
const { lang, tr } = useI18n();
const toast = useToast();
const router = useRouter();

const activeTab = ref('info');
const savingProfile = ref(false);
const savingPassword = ref(false);
const oidcLinked = ref(false);
const oidcLoading = ref(false);

const profileForm = reactive({ realName: '', email: '', phone: '' });
const passwordForm = reactive({ oldPassword: '', newPassword: '', confirmPassword: '' });

const myLogs = usePagination('/system/logs/login');

const logColumns = [
  { key: 'created_at', label: tr('createdAt'), width: '190px' },
  { key: 'ip', label: 'IP', width: '150px' },
  { key: 'message', label: tr('status') },
  { key: 'success', label: '', width: '90px', align: 'right' }
];

onMounted(async () => {
  try {
    const data = await refreshProfile();
    profileForm.realName = data.realName || '';
    profileForm.email = data.email || '';
    profileForm.phone = data.phone || '';
  } catch (err) {
    toast.error(err.message);
  }
  await loadMyLogs();
  try {
    const identity = await get('/auth/oidc/status');
    oidcLinked.value = identity.linked;
  } catch (err) {
    toast.error(err.message);
  }
});

async function linkOidc() {
  oidcLoading.value = true;
  try {
    await startOidc('link');
  } catch (err) {
    toast.error(err.message);
    oidcLoading.value = false;
  }
}

/**
 * 「我的登录记录」直接复用登录日志接口的 keyword 过滤，
 * 用当前用户名做关键词——普通角色没有跨用户查看权限，这样最省事也最安全。
 */
async function loadMyLogs() {
  myLogs.filters.keyword = user.value?.username || '';
  myLogs.pager.page = 1;
  await myLogs.load();
}

async function saveProfile() {
  savingProfile.value = true;
  try {
    await put('/auth/profile', {
      realName: profileForm.realName.trim(),
      email: profileForm.email.trim(),
      phone: profileForm.phone.trim()
    });
    await refreshProfile();
    toast.success(tr('profileUpdated'));
  } catch (err) {
    toast.error(err.message);
  } finally {
    savingProfile.value = false;
  }
}

async function savePassword() {
  if (passwordForm.newPassword !== passwordForm.confirmPassword) {
    toast.warn(tr('passwordMismatch'));
    return;
  }
  savingPassword.value = true;
  try {
    await put('/auth/password', {
      oldPassword: passwordForm.oldPassword,
      newPassword: passwordForm.newPassword
    });
    toast.success(tr('passwordChanged'));
    // 密码已变，旧 token 语义上失效，直接送回登录页。
    await logout();
    router.push('/login');
  } catch (err) {
    toast.error(err.message);
  } finally {
    savingPassword.value = false;
  }
}

const roleLabel = () => {
  const role = user.value?.roleName;
  if (!role) return user.value?.roleCode || '';
  if (typeof role === 'string') return role;
  return role[lang.value] || role.zh || '';
};
</script>

<template>
  <section class="page">
    <div class="section-title">
      <div>
        <h1>{{ tr('profile') }}</h1>
        <p>{{ user?.username }} · {{ roleLabel() }}</p>
      </div>
    </div>

    <div class="tabs">
      <button :class="{ active: activeTab === 'info' }" @click="activeTab = 'info'">{{ tr('basicInfo') }}</button>
      <button :class="{ active: activeTab === 'password' }" @click="activeTab = 'password'">
        {{ tr('changePassword') }}
      </button>
      <button :class="{ active: activeTab === 'logs' }" @click="activeTab = 'logs'">{{ tr('myLoginLogs') }}</button>
    </div>

    <section v-if="activeTab === 'info'" class="panel narrow">
      <form class="form-stack" @submit.prevent="saveProfile">
        <label>
          {{ tr('username') }}
          <input :value="user?.username" disabled />
        </label>
        <label>
          {{ tr('realName') }}
          <input v-model="profileForm.realName" required maxlength="80" />
        </label>
        <label>
          {{ tr('email') }}
          <input v-model="profileForm.email" type="email" required maxlength="120" />
        </label>
        <label>
          {{ tr('phone') }}
          <input v-model="profileForm.phone" maxlength="30" />
        </label>
        <button class="primary" :disabled="savingProfile">
          {{ savingProfile ? tr('loading') : tr('save') }}
        </button>
      </form>
      <div class="identity-link">
        <p>{{ oidcLinked ? tr('oidcLinked') : tr('oidcNotLinked') }}</p>
        <button v-if="!oidcLinked" class="sso-button" type="button" :disabled="oidcLoading" @click="linkOidc">
          {{ oidcLoading ? tr('loading') : tr('oidcLink') }}
        </button>
      </div>
    </section>

    <section v-else-if="activeTab === 'password'" class="panel narrow">
      <form class="form-stack" @submit.prevent="savePassword">
        <label>
          {{ tr('oldPassword') }}
          <input v-model="passwordForm.oldPassword" type="password" required autocomplete="current-password" />
        </label>
        <label>
          {{ tr('newPassword') }}
          <input
            v-model="passwordForm.newPassword"
            type="password"
            required
            minlength="6"
            autocomplete="new-password"
          />
          <small class="field-hint">{{ tr('passwordRule') }}</small>
        </label>
        <label>
          {{ tr('confirmPassword') }}
          <input
            v-model="passwordForm.confirmPassword"
            type="password"
            required
            minlength="6"
            autocomplete="new-password"
          />
        </label>
        <button class="primary" :disabled="savingPassword">
          {{ savingPassword ? tr('loading') : tr('save') }}
        </button>
      </form>
    </section>

    <section v-else class="panel">
      <DataTable
        :columns="logColumns"
        :rows="myLogs.rows.value"
        :loading="myLogs.loading.value"
        :empty-text="tr('empty')"
      >
        <template #cell-success="{ row }">
          <span :class="row.success ? 'ok' : 'error'">{{ row.success ? 'OK' : 'FAIL' }}</span>
        </template>
      </DataTable>
      <PaginationBar
        :page="myLogs.pager.page"
        :page-size="myLogs.pager.pageSize"
        :total="myLogs.total.value"
        @update:page="myLogs.goPage"
        @update:page-size="myLogs.changePageSize"
      />
    </section>
  </section>
</template>

<style scoped>
.tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 18px;
  flex-wrap: wrap;
}

.narrow {
  max-width: 560px;
}

.field-hint {
  color: #8593a1;
  font-size: 0.78rem;
  font-weight: 500;
}

.identity-link {
  margin-top: 24px;
  padding-top: 18px;
  border-top: 1px solid #d9e2e8;
}

.identity-link p {
  margin: 0 0 10px;
  color: #607080;
}

.sso-button {
  min-height: 40px;
  padding: 0 14px;
  border: 1px solid #0f766e;
  border-radius: 6px;
  background: #fff;
  color: #0f766e;
  font: inherit;
  cursor: pointer;
}
</style>
