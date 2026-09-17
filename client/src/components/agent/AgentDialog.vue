<script setup>
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue';
import Modal from '../common/Modal.vue';
import MessageBubble from './MessageBubble.vue';
import ModelPicker from './ModelPicker.vue';
import VoiceOrb from './VoiceOrb.vue';
import { chat, listModels, pullModel } from '../../api/agent';
import { useI18n } from '../../composables/useI18n';
import { useToast } from '../../composables/useToast';
import { capabilities, detectASR, detectTTS, micAvailable, recognize, speak, stopSpeaking, stripForSpeech } from '../../voice';

const props = defineProps({
  modelValue: { type: Boolean, default: false }
});
const emit = defineEmits(['update:modelValue']);

const { lang, tr, setLanguage } = useI18n();
const toast = useToast();
// voice/index.js 里的 state 是 reactive 的，这里包一层 computed 才能随 detect() 结果更新。
const caps = computed(() => capabilities());

const messages = ref([]);
const sessionId = ref(null);
const input = ref('');
const streaming = ref(false);
const models = ref([]);
const model = ref('');
const useRag = ref(true);
const autoSpeak = ref(true);
const pulling = ref('');
const speakingId = ref(null);
const voiceState = ref('idle');
const continuous = ref(false);
const listEl = ref(null);

let abortController = null;
let voiceHandle = null;
// 连续对话用世代号来作废旧循环：每次开关或新会话都 +1，旧循环看到号变了就自行退出。
let continuousGeneration = 0;

const asrRoute = computed(() => detectASR());
const voiceEnabled = computed(() => asrRoute.value !== 'none');
const voiceDisabledReason = computed(() => {
  if (!micAvailable()) return tr('voiceNotSupportedOnHttp');
  return tr('voiceUnsupported');
});
const canSpeak = computed(() => detectTTS(lang.value) !== 'none');

const currentModel = computed(() => models.value.find((m) => m.name === model.value));

watch(
  () => props.modelValue,
  async (open) => {
    if (open) {
      await loadModels();
      if (!messages.value.length) greet();
      await scrollToBottom();
    } else {
      stopEverything();
    }
  }
);

onBeforeUnmount(stopEverything);

function greet() {
  messages.value.push({ id: `greet-${Date.now()}`, role: 'assistant', content: tr('agentWelcome'), terms: [] });
}

async function loadModels() {
  try {
    const data = await listModels();
    models.value = data.models || [];
    if (!model.value) {
      const preferred = models.value.find((m) => m.isDefault && m.installed) || models.value.find((m) => m.installed);
      model.value = preferred?.name || models.value[0]?.name || '';
    }
  } catch (err) {
    toast.error(err.message);
  }
}

async function scrollToBottom() {
  await nextTick();
  if (listEl.value) listEl.value.scrollTop = listEl.value.scrollHeight;
}

/** 把一条消息追加进去，并返回它的响应式代理——直接改原对象不会触发更新。 */
function pushMessage(payload) {
  messages.value.push(payload);
  return messages.value[messages.value.length - 1];
}

async function send(text) {
  const content = String(text ?? input.value).trim();
  if (!content || streaming.value) return;

  input.value = '';
  const generation = continuousGeneration;
  pushMessage({ id: `u-${Date.now()}`, role: 'user', content, terms: [] });
  const assistant = pushMessage({
    id: `a-${Date.now()}`,
    role: 'assistant',
    content: '',
    terms: [],
    pending: true
  });
  streaming.value = true;
  abortController = new AbortController();
  await scrollToBottom();

  let failed = false;
  try {
    await chat(
      {
        sessionId: sessionId.value,
        model: model.value,
        message: content,
        lang: lang.value,
        useRag: useRag.value
      },
      {
        onStart: (sid) => {
          sessionId.value = sid;
        },
        onRag: (terms) => {
          assistant.terms = terms;
        },
        onDelta: (chunk) => {
          assistant.content += chunk;
          scrollToBottom();
        },
        onDone: () => {
          assistant.pending = false;
        },
        onError: (message) => {
          assistant.pending = false;
          assistant.content = assistant.content || `⚠️ ${message}`;
          toast.error(message);
        }
      },
      abortController.signal
    );
  } catch (err) {
    failed = true;
    assistant.pending = false;
    const aborted = err.name === 'AbortError';
    if (aborted) {
      assistant.content = assistant.content || '（已停止）';
    } else {
      assistant.content = assistant.content || `⚠️ ${err.message}`;
      toast.error(err.message);
    }
  } finally {
    streaming.value = false;
    abortController = null;
    await scrollToBottom();
  }

  // 自动播报。被中止或失败就不念了。
  if (!failed && autoSpeak.value && assistant.content && generation === continuousGeneration) {
    await speakMessage(assistant);
  }

  // 连续模式下，播报结束后自动开启下一轮收音。
  if (continuous.value && generation === continuousGeneration) {
    startContinuousTurn();
  }
}

async function speakMessage(message) {
  const text = stripForSpeech(message.content);
  if (!text) return;
  speakingId.value = message.id;
  try {
    await speak(text, lang.value);
  } catch (err) {
    toast.warn(err.message);
  } finally {
    if (speakingId.value === message.id) speakingId.value = null;
  }
}

function stopSpeakingNow() {
  stopSpeaking();
  speakingId.value = null;
}

/* ------------------------------ 语音输入 ------------------------------ */

function startListening({ autoStop = false } = {}) {
  if (!voiceEnabled.value || voiceState.value !== 'idle') return;
  // 录之前先掐掉播报，否则会把 AI 自己的声音录进去。
  stopSpeakingNow();
  voiceState.value = 'listening';
  voiceHandle = recognize({
    lang: lang.value,
    // 连续模式靠静音断句；PTT 靠松手，不设静音阈值。
    silenceMs: autoStop ? 1200 : 0,
    maxMs: autoStop ? 30000 : 60000
  });

  voiceHandle.promise
    .then(async (text) => {
      voiceState.value = 'idle';
      voiceHandle = null;
      const content = String(text || '').trim();
      if (!content) {
        // 没听清就静默重来，连续模式下不打断节奏。
        if (continuous.value) startContinuousTurn();
        return;
      }
      // 连续模式下 send() 结尾会自己接上下一轮收音，这里不用再管。
      await send(content);
    })
    .catch((err) => {
      voiceState.value = 'idle';
      voiceHandle = null;
      if (err.name === 'AbortError' || /已取消/.test(err.message)) return;
      toast.error(err.message);
      if (continuous.value) {
        continuous.value = false;
        continuousGeneration += 1;
      }
    });
}

function stopListening() {
  if (voiceState.value !== 'listening' || !voiceHandle) return;
  voiceState.value = 'recognizing';
  voiceHandle.stop();
}

/** 连续对话的一轮：开麦 → 静音自动断句 → send() 里回环到下一轮。 */
function startContinuousTurn() {
  if (!continuous.value) return;
  const generation = continuousGeneration;
  // 等播报彻底停下再开麦，给音频设备一点切换时间。
  setTimeout(() => {
    if (generation !== continuousGeneration || !continuous.value) return;
    startListening({ autoStop: true });
  }, 260);
}

function toggleContinuous() {
  continuous.value = !continuous.value;
  continuousGeneration += 1;
  if (continuous.value) {
    if (!voiceEnabled.value) {
      continuous.value = false;
      toast.warn(voiceDisabledReason.value);
      return;
    }
    startContinuousTurn();
  } else {
    voiceHandle?.cancel();
    voiceHandle = null;
    voiceState.value = 'idle';
  }
}

function stopEverything() {
  continuous.value = false;
  continuousGeneration += 1;
  voiceHandle?.cancel();
  voiceHandle = null;
  voiceState.value = 'idle';
  stopSpeakingNow();
  abortController?.abort();
  abortController = null;
  streaming.value = false;
}

function stopGeneration() {
  abortController?.abort();
}

function newSession() {
  stopEverything();
  sessionId.value = null;
  messages.value = [];
  greet();
}

async function onPull(name) {
  pulling.value = name;
  try {
    await pullModel(name, (progress) => {
      if (progress.status && progress.status !== 'done') {
        toast.info(`${name}: ${progress.status}`);
      }
    });
    toast.success(`${name} ${tr('pullDone')}`);
    await loadModels();
    if (!model.value) model.value = name;
  } catch (err) {
    toast.error(err.message);
  } finally {
    pulling.value = '';
  }
}

function onKeydown(event) {
  // Enter 发送，Shift+Enter 换行。
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    send();
  }
}
</script>

<template>
  <Modal
    :model-value="modelValue"
    width="min(880px, 96vw)"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <template #header>
      <div class="agent-head">
        <h2>🤖 {{ tr('agentTitle') }}</h2>
        <span v-if="caps.checked" class="agent-cap">
          {{ caps.llm ? 'LLM ✓' : 'LLM ✗' }} ·
          {{ voiceEnabled ? `ASR ${asrRoute}` : 'ASR ✗' }} ·
          {{ canSpeak ? 'TTS ✓' : 'TTS ✗' }}
        </span>
      </div>
    </template>

    <div class="agent-toolbar">
      <label class="inline-field">
        <span>{{ tr('model') }}</span>
        <ModelPicker v-model="model" :models="models" :pulling="pulling" @pull="onPull" />
      </label>

      <label class="inline-field">
        <span>{{ lang === 'vi' ? 'Ngôn ngữ' : lang === 'en' ? 'Language' : '语言' }}</span>
        <select :value="lang" @change="setLanguage($event.target.value)">
          <option value="zh">中文</option>
          <option value="vi">Tiếng Việt</option>
          <option value="en">English</option>
        </select>
      </label>

      <label class="checkbox-field">
        <input v-model="useRag" type="checkbox" />
        <span>{{ tr('useKnowledgeBase') }}</span>
      </label>

      <label class="checkbox-field">
        <input v-model="autoSpeak" type="checkbox" />
        <span>{{ tr('voiceOutput') }}</span>
      </label>

      <button class="mini" @click="newSession">{{ tr('newSession') }}</button>
    </div>

    <div ref="listEl" class="agent-messages">
      <MessageBubble
        v-for="message in messages"
        :key="message.id"
        :message="message"
        :speaking="speakingId === message.id"
        :can-speak="canSpeak"
        @speak="speakMessage"
        @stop-speak="stopSpeakingNow"
      />
      <p v-if="currentModel && !currentModel.installed" class="warn-line">
        ⚠️ {{ currentModel.label }} {{ tr('notInstalled') }}，请先点「{{ tr('pull') }}」下载。
      </p>
      <p v-if="currentModel?.tier === 'too_large'" class="warn-line">⚠️ {{ tr('vramWarning') }}</p>
    </div>

    <div class="agent-input-row">
      <textarea
        v-model="input"
        :placeholder="tr('agentPlaceholder')"
        rows="2"
        :disabled="streaming"
        @keydown="onKeydown"
      ></textarea>

      <div class="agent-input-actions">
        <VoiceOrb
          :state="voiceState"
          :enabled="voiceEnabled"
          :continuous="continuous"
          :disabled-reason="voiceDisabledReason"
          @start="startListening()"
          @stop="stopListening()"
          @toggle-continuous="toggleContinuous"
        />

        <button v-if="streaming" class="danger" @click="stopGeneration">{{ tr('stop') }}</button>
        <button v-else class="primary" :disabled="!input.trim()" @click="send()">{{ tr('send') }}</button>
      </div>
    </div>

    <p v-if="!voiceEnabled" class="hint tiny">{{ voiceDisabledReason }}</p>
  </Modal>
</template>

<style scoped>
.agent-head {
  display: flex;
  align-items: baseline;
  gap: 12px;
  flex-wrap: wrap;
}

.agent-head h2 {
  margin: 0;
  font-size: 1.16rem;
}

.agent-cap {
  font-size: 0.76rem;
  color: #758292;
}

.agent-toolbar {
  display: flex;
  align-items: flex-end;
  gap: 14px;
  flex-wrap: wrap;
  padding-bottom: 12px;
  border-bottom: 1px solid #eef2f6;
}

.inline-field {
  display: grid;
  gap: 4px;
  font-size: 0.8rem;
  color: #607080;
}

.inline-field select {
  width: auto;
  min-width: 120px;
  padding: 7px 10px;
}

.checkbox-field {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.86rem;
  color: #4b5b68;
  font-weight: 500;
}

.checkbox-field input {
  width: auto;
}

.agent-messages {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-height: 240px;
  max-height: min(48vh, 420px);
  overflow-y: auto;
  padding: 4px 2px;
}

.agent-input-row {
  display: flex;
  gap: 12px;
  align-items: flex-end;
  border-top: 1px solid #eef2f6;
  padding-top: 12px;
}

.agent-input-row textarea {
  flex: 1;
  min-height: 56px;
}

.agent-input-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.mini {
  padding: 6px 11px;
  font-size: 0.84rem;
}

.danger {
  border-color: #d92d20;
  background: #d92d20;
  color: #ffffff;
}

.warn-line {
  margin: 0;
  color: #b54708;
  font-size: 0.86rem;
}

.tiny {
  margin: 4px 0 0;
  font-size: 0.8rem;
}
</style>
