<script setup>
import { computed } from 'vue';
import { useI18n } from '../../composables/useI18n';

/**
 * 麦克风按钮。
 *
 * 两种交互：
 *  - 按住说话（PTT）：pointerdown 开始、pointerup 结束
 *  - 连续对话：点一下开始，说完自动断句并继续下一轮；再点一下停止
 */
const props = defineProps({
  state: { type: String, default: 'idle' }, // idle | listening | recognizing
  enabled: { type: Boolean, default: true },
  continuous: { type: Boolean, default: false },
  disabledReason: { type: String, default: '' }
});

const emit = defineEmits(['start', 'stop', 'toggle-continuous']);

const { tr } = useI18n();

const label = computed(() => {
  if (props.state === 'listening') return tr('listening');
  if (props.state === 'recognizing') return tr('recognizing');
  return props.continuous ? tr('continuousMode') : tr('holdToTalk');
});

function onDown(event) {
  if (!props.enabled || props.continuous) return;
  event.preventDefault();
  event.currentTarget.setPointerCapture?.(event.pointerId);
  emit('start');
}

function onUp() {
  if (!props.enabled || props.continuous) return;
  emit('stop');
}

function onContinuousClick() {
  if (!props.enabled) return;
  emit('toggle-continuous');
}
</script>

<template>
  <div class="voice-orb-wrap">
    <button
      class="voice-orb"
      :class="[`state-${state}`, { continuous }]"
      :disabled="!enabled"
      :title="enabled ? label : disabledReason"
      @pointerdown="onDown"
      @pointerup="onUp"
      @pointercancel="onUp"
      @pointerleave="onUp"
      @click="onContinuousClick"
    >
      <span class="orb-icon">🎤</span>
    </button>
    <span class="orb-label">{{ enabled ? label : disabledReason }}</span>
  </div>
</template>

<style scoped>
.voice-orb-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
}

.voice-orb {
  width: 46px;
  height: 46px;
  border-radius: 50%;
  padding: 0;
  display: grid;
  place-items: center;
  border: 1px solid #cfd8e3;
  background: #ffffff;
  font-size: 1.16rem;
  transition: all 0.16s ease;
}

.voice-orb:disabled {
  opacity: 0.42;
  cursor: not-allowed;
}

.voice-orb.continuous {
  border-color: #0f766e;
  background: #e7f6f3;
}

.voice-orb.state-listening {
  border-color: #d92d20;
  background: #fee4e2;
  animation: pulse 1.4s infinite;
}

.voice-orb.state-recognizing {
  border-color: #dc9a02;
  background: #fef6e0;
}

@keyframes pulse {
  0% {
    box-shadow: 0 0 0 0 rgba(217, 45, 32, 0.42);
  }
  70% {
    box-shadow: 0 0 0 12px rgba(217, 45, 32, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(217, 45, 32, 0);
  }
}

.orb-label {
  font-size: 0.72rem;
  color: #758292;
  white-space: nowrap;
}
</style>
