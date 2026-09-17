<script setup>
import { reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { post } from '../../api/http';
import { useI18n } from '../../composables/useI18n';
import { useToast } from '../../composables/useToast';

/**
 * 忘记密码：两步。
 *  1. 用户名 + 邮箱 → 发验证码
 *  2. 用户名 + 验证码 + 新密码 → 重置
 *
 * SMTP 没配置时后端会在非生产环境回显 devCode，这里直接显示出来，
 * 保证在没有邮件服务的情况下功能仍然走得通。
 */
const { tr } = useI18n();
const toast = useToast();
const router = useRouter();

const step = ref(1);
const loading = ref(false);
const error = ref('');
const devCode = ref('');

const form = reactive({
  username: '',
  email: '',
  code: '',
  newPassword: '',
  confirmPassword: ''
});

async function sendCode() {
  error.value = '';
  devCode.value = '';
  loading.value = true;
  try {
    const data = await post('/auth/forgot-password', {
      username: form.username.trim(),
      email: form.email.trim()
    });
    toast.success(data.message || tr('codeSent'));
    if (data.devCode) devCode.value = data.devCode;
    step.value = 2;
  } catch (err) {
    error.value = err.message;
  } finally {
    loading.value = false;
  }
}

async function resetPassword() {
  error.value = '';
  if (form.newPassword !== form.confirmPassword) {
    error.value = tr('passwordMismatch');
    return;
  }
  loading.value = true;
  try {
    const data = await post('/auth/reset-password', {
      username: form.username.trim(),
      code: form.code.trim(),
      newPassword: form.newPassword
    });
    toast.success(data.message || tr('resetSuccess'));
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
        <h1>{{ tr('resetPassword') }}</h1>
      </div>

      <!-- 第一步：验证身份并获取验证码 -->
      <form v-if="step === 1" class="form-stack" @submit.prevent="sendCode">
        <label>
          {{ tr('username') }}
          <input v-model="form.username" autocomplete="username" required />
        </label>
        <label>
          {{ tr('email') }}
          <input v-model="form.email" type="email" autocomplete="email" required />
        </label>

        <p v-if="error" class="error">{{ error }}</p>

        <button class="primary" :disabled="loading">
          {{ loading ? tr('loading') : tr('sendCode') }}
        </button>
      </form>

      <!-- 第二步：填验证码与新密码 -->
      <form v-else class="form-stack" @submit.prevent="resetPassword">
        <p v-if="devCode" class="dev-code">
          {{ tr('devCodeHint') }}<strong>{{ devCode }}</strong>
          <span class="dev-note">（{{ form.email }}）</span>
        </p>

        <label>
          {{ tr('verificationCode') }}
          <input v-model="form.code" required maxlength="6" inputmode="numeric" pattern="\d{6}" />
        </label>
        <label>
          {{ tr('newPassword') }}
          <input v-model="form.newPassword" type="password" required minlength="6" autocomplete="new-password" />
        </label>
        <label>
          {{ tr('confirmPassword') }}
          <input v-model="form.confirmPassword" type="password" required minlength="6" autocomplete="new-password" />
        </label>

        <p v-if="error" class="error">{{ error }}</p>

        <button class="primary" :disabled="loading">
          {{ loading ? tr('loading') : tr('resetPassword') }}
        </button>
        <button type="button" @click="step = 1">{{ tr('resendCode') }}</button>
      </form>

      <div class="login-links">
        <RouterLink to="/login">{{ tr('backToLogin') }}</RouterLink>
      </div>
    </section>
  </main>
</template>

<style scoped>
.dev-code {
  margin: 0;
  padding: 10px 13px;
  border-radius: 6px;
  background: #fef6e0;
  border: 1px solid #f2d17a;
  color: #7a4d02;
  font-size: 0.9rem;
}

.dev-code strong {
  font-size: 1.16rem;
  letter-spacing: 0.16em;
}

.dev-note {
  color: #9a7420;
  font-size: 0.82rem;
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
