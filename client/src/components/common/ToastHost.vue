<script setup>
import { useToast } from '../../composables/useToast';

const { toasts, dismiss } = useToast();
</script>

<template>
  <Teleport to="body">
    <div class="toast-host" aria-live="polite">
      <TransitionGroup name="toast">
        <div
          v-for="item in toasts"
          :key="item.id"
          class="toast"
          :class="`toast-${item.type}`"
          @click="dismiss(item.id)"
        >
          {{ item.message }}
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
.toast-host {
  position: fixed;
  top: 18px;
  right: 18px;
  z-index: 2000;
  display: grid;
  gap: 10px;
  max-width: min(360px, calc(100vw - 36px));
}

.toast {
  padding: 12px 15px;
  border-radius: 8px;
  background: #172026;
  color: #ffffff;
  border-left: 4px solid #607080;
  box-shadow: 0 12px 32px rgba(23, 32, 38, 0.26);
  cursor: pointer;
  font-size: 0.92rem;
  line-height: 1.5;
  word-break: break-word;
}

.toast-success {
  border-left-color: #0f766e;
}

.toast-error {
  border-left-color: #d92d20;
}

.toast-warn {
  border-left-color: #dc9a02;
}

.toast-enter-active,
.toast-leave-active {
  transition: all 0.26s ease;
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateX(24px);
}
</style>
