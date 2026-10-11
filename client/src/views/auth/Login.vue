<script setup>
import { reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuth } from '../../composables/useAuth';
import { useI18n } from '../../composables/useI18n';
import { useToast } from '../../composables/useToast';
import { startOidc } from '../../api/oidc';

const { login } = useAuth();
const { lang, setLanguage, tr } = useI18n();
const toast = useToast();
const router = useRouter();
const route = useRoute();

const form = reactive({ username: '', password: '' });
const loading = ref(false);
const oidcLoading = ref(false);
const error = ref('');

async function onSubmit() {
  error.value = '';
  loading.value = true;
  try {
    await login(form.username.trim(), form.password);
    toast.success(tr('loginSuccess'));
    router.push(typeof route.query.redirect === 'string' ? route.query.redirect : '/dashboard');
  } catch (err) {
    error.value = err.message;
  } finally {
    loading.value = false;
  }
}

async function onOidcLogin() {
  error.value = '';
  oidcLoading.value = true;
  try {
    await startOidc('login');
  } catch (err) {
    error.value = err.message;
    oidcLoading.value = false;
  }
}
</script>

<template>
  <main class="login-screen">
    <section class="login-panel">
      <div>
        <p class="eyebrow">Railway Terminology</p>
        <h1>{{ tr('app') }}</h1>
        <p class="subtitle">{{ tr('loginSubtitle') }}</p>
      </div>

      <div class="lang-row">
        <button
          v-for="item in ['zh', 'en', 'vi']"
          :key="item"
          :class="{ active: lang === item }"
          @click="setLanguage(item)"
        >
          {{ item.toUpperCase() }}
        </button>
      </div>

      <form class="form-stack" @submit.prevent="onSubmit">
        <label>
          {{ tr('username') }}
          <input v-model="form.username" autocomplete="username" required />
        </label>
        <label>
          {{ tr('password') }}
          <input v-model="form.password" type="password" autocomplete="current-password" required />
        </label>

        <p v-if="error" class="error">{{ error }}</p>

        <button class="primary" :disabled="loading">
          {{ loading ? tr('loading') : tr('login') }}
        </button>
      </form>

      <button class="sso-button" type="button" :disabled="oidcLoading" @click="onOidcLogin">
        {{ oidcLoading ? tr('loading') : tr('oidcLogin') }}
      </button>

      <div class="login-links">
        <RouterLink to="/forgot-password">{{ tr('forgotPassword') }}</RouterLink>
        <RouterLink to="/register">{{ tr('registerNow') }}</RouterLink>
      </div>

    </section>
  </main>
</template>

<style scoped>
.subtitle {
  margin: 6px 0 0;
  color: #607080;
}

.login-links {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-top: 18px;
  font-size: 0.9rem;
}

.login-links a {
  color: #0f766e;
  text-decoration: none;
}

.login-links a:hover {
  text-decoration: underline;
}

.sso-button {
  width: 100%;
  margin-top: 12px;
  border: 1px solid #0f766e;
  border-radius: 8px;
  min-height: 42px;
  background: #fff;
  color: #0f766e;
  font: inherit;
  cursor: pointer;
}

.sso-button:disabled {
  opacity: 0.6;
  cursor: wait;
}
</style>
