<script setup>
import { onMounted } from 'vue';
import Sidebar from '../components/layout/Sidebar.vue';
import Topbar from '../components/layout/Topbar.vue';
import AgentLauncher from '../components/agent/AgentLauncher.vue';
import { useAuth } from '../composables/useAuth';
import { detect } from '../voice';

/**
 * 登录后的主壳。侧边栏 + 顶栏 + 页面出口，另外挂一个全局的智能体悬浮球——
 * 它在任何页面都能唤出，不必每个页面各自引一次。
 */
const { menusLoaded, loadMenus } = useAuth();

onMounted(async () => {
  // 直接落地到某个内页（刷新页面）时，菜单可能还没拉过。
  if (!menusLoaded.value) await loadMenus();
  // 语音能力探测放在壳里做一次即可，结果缓存在 voice/index.js 的模块级状态中。
  await detect();
});
</script>

<template>
  <div class="app-shell">
    <Sidebar />
    <section class="workspace">
      <Topbar />
      <RouterView />
    </section>
    <AgentLauncher />
  </div>
</template>
