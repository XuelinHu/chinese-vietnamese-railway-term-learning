<script setup>
import { onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { post, setToken } from '../../api/http';
import { useAuth } from '../../composables/useAuth';
import { useI18n } from '../../composables/useI18n';
import { useToast } from '../../composables/useToast';

const route = useRoute();
const router = useRouter();
const toast = useToast();
const { tr } = useI18n();
const { setUser, loadMenus } = useAuth();

onMounted(async () => {
  try {
    const result = await post('/auth/oidc/callback', {
      code: typeof route.query.code === 'string' ? route.query.code : '',
      state: typeof route.query.state === 'string' ? route.query.state : '',
      error: typeof route.query.error === 'string' ? route.query.error : ''
    });
    if (result.linked) {
      toast.success(tr('oidcLinked'));
      await router.replace('/profile');
      return;
    }
    if (!result.token || !result.user) throw new Error('统一账号登录响应无效');
    setToken(result.token);
    setUser(result.user);
    await loadMenus();
    toast.success(tr('loginSuccess'));
    await router.replace('/dashboard');
  } catch (error) {
    toast.error(error.message || tr('operationFailed'));
    await router.replace('/login');
  }
});
</script>

<template>
  <main class="login-screen">
    <section class="login-panel">
      <p class="eyebrow">Railway Terminology</p>
      <h1>{{ tr('loading') }}</h1>
    </section>
  </main>
</template>
