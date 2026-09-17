<script setup>
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { useAuth } from '../../composables/useAuth';
import { useI18n } from '../../composables/useI18n';
import { useToast } from '../../composables/useToast';

const { user, logout } = useAuth();
const { lang, setLanguage, tr } = useI18n();
const toast = useToast();
const router = useRouter();

// roleName 是三语对象；老数据可能只有字符串，两种都兼容。
const roleLabel = computed(() => {
  const role = user.value?.roleName;
  if (!role) return user.value?.roleCode || '';
  if (typeof role === 'string') return role;
  return role[lang.value] || role.zh || user.value?.roleCode || '';
});

async function onLogout() {
  await logout();
  toast.success(tr('logoutSuccess'));
  router.push('/login');
}
</script>

<template>
  <header class="topbar">
    <div>
      <strong>{{ user?.realName || user?.username }}</strong>
      <span>{{ roleLabel }}</span>
    </div>
    <div class="toolbar">
      <select :value="lang" @change="setLanguage($event.target.value)">
        <option value="zh">中文</option>
        <option value="en">English</option>
        <option value="vi">Tiếng Việt</option>
      </select>
      <RouterLink to="/profile" class="link-button">{{ tr('profile') }}</RouterLink>
      <button @click="onLogout">{{ tr('logout') }}</button>
    </div>
  </header>
</template>

<style scoped>
.link-button {
  display: inline-flex;
  align-items: center;
  padding: 9px 13px;
  border: 1px solid #cfd8e3;
  border-radius: 6px;
  background: #ffffff;
  color: #172026;
  text-decoration: none;
  font-size: 0.94rem;
}

.link-button:hover {
  border-color: #0f766e;
  color: #0f766e;
}
</style>
