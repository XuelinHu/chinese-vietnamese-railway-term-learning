<script setup>
import { ref } from 'vue';
import AgentDialog from './AgentDialog.vue';
import { useI18n } from '../../composables/useI18n';

/**
 * 右下角悬浮球。点一下弹出智能体对话框。
 * 挂在 AppLayout 上，任何登录后的页面都能唤出。
 */
const open = ref(false);
const { tr } = useI18n();
</script>

<template>
  <button class="agent-fab" :title="tr('agent')" @click="open = true">
    <span class="fab-icon">🤖</span>
    <span class="fab-text">{{ tr('agent') }}</span>
  </button>

  <AgentDialog v-model="open" />
</template>

<style scoped>
.agent-fab {
  position: fixed;
  right: 22px;
  bottom: 22px;
  z-index: 900;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 13px 18px;
  border-radius: 999px;
  border-color: #0f766e;
  background: #0f766e;
  color: #ffffff;
  box-shadow: 0 14px 34px rgba(15, 118, 110, 0.36);
  font-weight: 650;
  transition: transform 0.16s ease;
}

.agent-fab:hover {
  transform: translateY(-2px);
}

.fab-icon {
  font-size: 1.16rem;
}

@media (max-width: 620px) {
  .agent-fab {
    right: 14px;
    bottom: 14px;
    padding: 13px;
  }

  .fab-text {
    display: none;
  }
}
</style>
