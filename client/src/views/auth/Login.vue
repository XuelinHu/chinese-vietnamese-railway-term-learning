<script setup>
import { reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuth } from '../../composables/useAuth';
import { useI18n } from '../../composables/useI18n';
import { useToast } from '../../composables/useToast';

const { login } = useAuth();
const { lang, setLanguage, tr } = useI18n();
const toast = useToast();
const router = useRouter();
const route = useRoute();

const form = reactive({ username: '', password: '' });
const loading = ref(false);
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
</style>
