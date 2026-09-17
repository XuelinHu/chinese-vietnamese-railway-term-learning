<script setup>
import { computed, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { post } from '../../api/http';
import { useI18n } from '../../composables/useI18n';
import { useToast } from '../../composables/useToast';

const { tr } = useI18n();
const toast = useToast();
const router = useRouter();

const form = reactive({
  username: '',
  password: '',
  confirmPassword: '',
  realName: '',
  email: '',
  phone: ''
});
const loading = ref(false);
const error = ref('');

const mismatch = computed(
  () => form.confirmPassword.length > 0 && form.password !== form.confirmPassword
);

async function onSubmit() {
  error.value = '';
  if (form.password !== form.confirmPassword) {
    error.value = tr('passwordMismatch');
    return;
  }
  loading.value = true;
  try {
    await post('/auth/register', {
      username: form.username.trim(),
      password: form.password,
      realName: form.realName.trim(),
      email: form.email.trim(),
      phone: form.phone.trim()
    });
    toast.success(tr('registerSuccess'));
    router.push('/login');
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
        <h1>{{ tr('register') }}</h1>
      </div>

      <form class="form-stack" @submit.prevent="onSubmit">
        <label>
          {{ tr('username') }}
          <input v-model="form.username" autocomplete="username" required minlength="3" maxlength="50" />
          <small class="field-hint">{{ tr('usernameRule') }}</small>
        </label>

        <div class="form-grid">
          <label>
            {{ tr('password') }}
            <input v-model="form.password" type="password" autocomplete="new-password" required minlength="6" />
            <small class="field-hint">{{ tr('passwordRule') }}</small>
          </label>
          <label>
            {{ tr('confirmPassword') }}
            <input
              v-model="form.confirmPassword"
              type="password"
              autocomplete="new-password"
              required
              :class="{ invalid: mismatch }"
            />
            <small v-if="mismatch" class="field-hint error">{{ tr('passwordMismatch') }}</small>
          </label>
        </div>

        <label>
          {{ tr('realName') }}
          <input v-model="form.realName" required maxlength="80" />
        </label>

        <div class="form-grid">
          <label>
            {{ tr('email') }}
            <input v-model="form.email" type="email" required maxlength="120" />
          </label>
          <label>
            {{ tr('phone') }} <small class="inline-hint">({{ tr('optional') }})</small>
            <input v-model="form.phone" maxlength="30" />
          </label>
        </div>

        <p v-if="error" class="error">{{ error }}</p>

        <button class="primary" :disabled="loading || mismatch">
          {{ loading ? tr('loading') : tr('register') }}
        </button>
      </form>

      <div class="login-links">
        <RouterLink to="/login">{{ tr('haveAccount') }}</RouterLink>
      </div>
    </section>
  </main>
</template>

<style scoped>
.field-hint {
  color: #8593a1;
  font-size: 0.78rem;
  font-weight: 500;
}

.inline-hint {
  color: #8593a1;
  font-weight: 500;
}

.invalid {
  border-color: #d92d20;
}

.login-links {
  display: flex;
  justify-content: center;
  margin-top: 18px;
  font-size: 0.9rem;
}

.login-links a {
  color: #0f766e;
  text-decoration: none;
}
</style>
