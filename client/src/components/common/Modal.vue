<script setup>
import { onBeforeUnmount, watch } from 'vue';

/**
 * 通用弹框。复用既有 .modal-backdrop / .modal 样式。
 * 支持 Esc 关闭与点遮罩关闭（closable=false 可禁用，用于生成中等不可中断场景）。
 */
const props = defineProps({
  modelValue: { type: Boolean, default: false },
  title: { type: String, default: '' },
  width: { type: String, default: '780px' },
  closable: { type: Boolean, default: true }
});

const emit = defineEmits(['update:modelValue', 'close']);

function close() {
  if (!props.closable) return;
  emit('update:modelValue', false);
  emit('close');
}

function onKeydown(event) {
  if (event.key === 'Escape') close();
}

// 打开时锁滚动并监听 Esc；关闭时全部还原，避免弹框开完页面滚不动。
watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      document.addEventListener('keydown', onKeydown);
      document.body.style.overflow = 'hidden';
    } else {
      document.removeEventListener('keydown', onKeydown);
      document.body.style.overflow = '';
    }
  }
);

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown);
  document.body.style.overflow = '';
});
</script>

<template>
  <Teleport to="body">
    <div v-if="modelValue" class="modal-backdrop" @click.self="close">
      <div class="modal" :style="{ width }" role="dialog" aria-modal="true">
        <header v-if="title || $slots.header" class="modal-header">
          <slot name="header"><h2>{{ title }}</h2></slot>
          <button v-if="closable" class="icon-button" title="关闭" @click="close">✕</button>
        </header>
        <slot />
        <footer v-if="$slots.footer" class="modal-actions">
          <slot name="footer" />
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
}

.modal-header h2 {
  margin: 0;
  font-size: 1.22rem;
}

.icon-button {
  padding: 4px 10px;
  line-height: 1;
  font-size: 1rem;
  color: #607080;
}

.modal-actions {
  justify-content: flex-end;
}
</style>
