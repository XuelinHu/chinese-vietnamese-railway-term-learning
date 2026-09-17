/**
 * 语音能力探测与统一入口。
 *
 * 页面初始化时调一次 detect()，把 /api/agent/health 的结果缓存下来，
 * 之后 speak()/recognize() 按缓存选路径。边车没启动时**不会报错**，
 * 自动降级到浏览器能力；浏览器也没有就返回 'none'，由界面把按钮置灰。
 */

import { reactive } from 'vue';
import { fetchBlob, uploadRaw } from '../api/http';
import * as android from './android';
import { createRecorder, hasMediaRecorder, hasWebSpeech, webSpeechRecognize } from './asr';
import { hasSpeechSynthesis, hasVoiceFor, playBlob, speakLocal, stopSpeaking } from './tts';

export { createRecorder } from './asr';
export { stopSpeaking, stripForSpeech } from './tts';
export { hasNativeBridge } from './android';

/** BCP-47：给浏览器和原生桥用。 */
export const bcp47 = (lang) => ({ zh: 'zh-CN', vi: 'vi-VN', en: 'en-US' }[lang] || 'zh-CN');

/**
 * 必须是 reactive 的。
 *
 * detect() 在 AppLayout 的 onMounted 里 await，而 AgentDialog 的首次渲染发生在
 * 它之前——如果这里是普通对象，`computed(() => capabilities())` 找不到任何响应式依赖，
 * 会把「探测尚未完成」的初始值永久缓存下来，语音按钮就永远是错的。
 */
const state = reactive({
  serverAsr: false,
  serverTts: false,
  llm: false,
  llmModels: [],
  defaultModel: '',
  device: 'unknown',
  asrModel: '',
  checked: false
});

export function capabilities() {
  return { ...state };
}

/**
 * 探测服务端能力。失败（边车没起、后端没起）一律视为「不支持」，
 * 不抛异常——语音是增强功能，不该让整个页面挂掉。
 */
export async function detect() {
  try {
    const token = localStorage.getItem('token');
    const res = await fetch('/api/agent/health', {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    if (res.ok) {
      const data = await res.json();
      state.serverAsr = Boolean(data.asr);
      state.serverTts = Boolean(data.tts);
      // llm 是个对象 { available, models }，不是布尔——直接 Boolean() 会恒为 true。
      state.llm = Boolean(data.llm?.available);
      state.llmModels = data.llm?.models || [];
      state.device = data.sidecar?.device || 'unknown';
      state.asrModel = data.sidecar?.asrModel || '';
      state.defaultModel = data.defaultModel || '';
    }
  } catch {
    /* 边车或后端不可达，保持全 false，走浏览器降级 */
  }
  state.checked = true;
  return capabilities();
}

/**
 * 识别路径优先级：
 *  Android 原生桥 > 服务端 Whisper > Web Speech > 无
 */
export function detectASR() {
  if (android.hasNativeBridge()) return 'android';
  if (state.serverAsr && hasMediaRecorder()) return 'server';
  if (hasWebSpeech()) return 'webspeech';
  return 'none';
}

/**
 * 播报路径优先级：
 *  Android 原生桥 > 服务端 edge-tts > 浏览器 speechSynthesis > 无
 */
export function detectTTS(lang = 'zh') {
  if (android.hasNativeBridge()) return 'android';
  if (state.serverTts) return 'server';
  if (hasSpeechSynthesis() && hasVoiceFor(bcp47(lang))) return 'webspeech';
  if (hasSpeechSynthesis()) return 'webspeech'; // 没有对应音色也让它试，总比没有强
  return 'none';
}

/**
 * 麦克风是否可用。
 * 注意：非安全上下文（http:// 局域网 IP）下 mediaDevices 是 undefined，**不抛异常**。
 */
export function micAvailable() {
  return Boolean(typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia);
}

/**
 * 播报。按 detectTTS 的优先级逐级降级，只有全都失败才抛。
 * @param {string} text
 * @param {string} lang 'zh' | 'vi' | 'en'
 */
export async function speak(text, lang = 'zh') {
  const content = String(text || '').trim();
  if (!content) return;
  const route = detectTTS(lang);
  const tag = bcp47(lang);

  if (route === 'android') {
    try {
      await android.nativeSpeak(content, tag);
      return;
    } catch {
      /* 落到下一级 */
    }
  }

  if (route === 'android' || route === 'server') {
    try {
      const blob = await fetchBlob('/agent/tts', {
        method: 'POST',
        body: { text: content, lang }
      });
      await playBlob(blob);
      return;
    } catch {
      /* 服务端合成失败（如 edge-tts 403），落到浏览器 */
    }
  }

  await speakLocal(content, tag);
}

/**
 * 识别一段语音，返回文本。
 *
 * server 路径负责「录音 → 上传 → 转写」整条链；
 * android / webspeech 路径是自包含的。
 *
 * @param {object} opts
 * @param {string} opts.lang 'zh' | 'vi' | 'en'
 * @param {number} opts.silenceMs 静音自动断句（连续对话用），0 = 手动停
 * @param {number} opts.maxMs 单段录音上限
 * @returns {{ promise: Promise<string>, stop: () => void, cancel: () => void, route: string }}
 */
export function recognize({ lang = 'zh', silenceMs = 0, maxMs = 60000 } = {}) {
  const route = detectASR();
  const tag = bcp47(lang);

  if (route === 'android') {
    return {
      promise: android.nativeRecognize(tag).then((data) => data.text || ''),
      stop: () => {},
      cancel: () => {},
      route
    };
  }

  if (route === 'webspeech') {
    const { promise, abort } = webSpeechRecognize(tag);
    return { promise, stop: () => {}, cancel: abort, route };
  }

  if (route === 'server') {
    let finish;
    let cancelled = false;
    const stopSignal = new Promise((resolve) => {
      finish = resolve;
    });
    const recorder = createRecorder({ silenceMs, maxMs, onAutoStop: () => finish?.() });

    const promise = (async () => {
      await recorder.start();
      await stopSignal;
      if (cancelled) throw new Error('已取消');
      const blob = await recorder.stop();
      // 太短的录音多半是误触，上传只会浪费一次 GPU 推理。
      if (!blob || blob.size < 1200) throw new Error('录音太短，请按住多说一会儿');
      const data = await uploadRaw(`/agent/asr${lang ? `?language=${lang}` : ''}`, blob);
      return data.text || '';
    })();

    return {
      promise,
      stop: () => finish?.(),
      cancel: () => {
        cancelled = true;
        recorder.cancel();
        finish?.();
      },
      route
    };
  }

  return {
    promise: Promise.reject(new Error('当前环境不支持语音识别')),
    stop: () => {},
    cancel: () => {},
    route: 'none'
  };
}
