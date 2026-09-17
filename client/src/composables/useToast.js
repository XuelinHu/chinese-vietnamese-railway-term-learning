import { ref } from 'vue';

/**
 * 全局轻提示。用模块级数组做单例，任何组件 import 进来看到的都是同一份。
 */
const toasts = ref([]);
let seq = 0;

function push(message, type = 'info', timeout = 3200) {
  const text = String(message || '').trim();
  if (!text) return;
  const id = ++seq;
  toasts.value.push({ id, message: text, type });
  if (timeout) {
    setTimeout(() => dismiss(id), timeout);
  }
  return id;
}

function dismiss(id) {
  const index = toasts.value.findIndex((item) => item.id === id);
  if (index !== -1) toasts.value.splice(index, 1);
}

export function useToast() {
  return {
    toasts,
    dismiss,
    info: (message) => push(message, 'info'),
    success: (message) => push(message, 'success'),
    warn: (message) => push(message, 'warn', 4500),
    error: (message) => push(message, 'error', 5200)
  };
}
