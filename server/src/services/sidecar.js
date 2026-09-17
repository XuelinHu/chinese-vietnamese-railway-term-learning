import { env } from '../config/env.js';

/**
 * AI 边车客户端（server/ai/app.py）：faster-whisper 做 ASR，edge-tts 做 TTS。
 *
 * 边车是可选依赖：没启动时这里全部返回失败，路由层据此降级到浏览器能力。
 * 绝不因为边车缺席而让主流程 500。
 */

const BASE = env.ai.url;

async function post(path, body, { contentType, timeout, raw = false } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(`${BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': raw ? contentType : 'application/json' },
      body: raw ? body : JSON.stringify(body),
      signal: controller.signal
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`sidecar ${path} ${res.status}: ${text.slice(0, 200)}`);
    }
    return res;
  } finally {
    clearTimeout(timer);
  }
}

/** 边车能力探测。任何一项失败都只是降级，不是错误。 */
export async function health() {
  if (!env.ai.enabled) return { available: false, asr: false, tts: false, reason: 'disabled' };
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`${BASE}/health`, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error(String(res.status));
    const data = await res.json();
    return {
      available: true,
      asr: Boolean(data.asr),
      tts: Boolean(data.tts),
      asrModel: data.asr_model || env.ai.asrModel,
      device: data.device || 'unknown',
      voices: data.voices || []
    };
  } catch (error) {
    return { available: false, asr: false, tts: false, reason: error.message };
  }
}

/**
 * 语音转写。
 * @param {Buffer} buffer 原始音频字节（浏览器 MediaRecorder 产物）
 * @param {string} contentType audio/webm;codecs=opus 或 audio/mp4
 * @param {string} language zh | vi | en，留空则自动判定
 */
export async function transcribe(buffer, contentType = 'audio/webm', language = '', prompt = '') {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new Error('empty audio payload');
  }
  if (buffer.length > env.ai.maxAudioBytes) {
    throw new Error(`audio too large: ${buffer.length} bytes`);
  }
  // prompt 是领域术语提示词，明显提升「道岔」这类专业词的识别率；传空则不加。
  const qs = new URLSearchParams({ language });
  if (prompt) qs.set('prompt', prompt);
  const res = await post(`/asr?${qs.toString()}`, buffer, {
    contentType,
    timeout: env.ai.asrTimeout,
    raw: true
  });
  const data = await res.json();
  return { text: data.text || '', language: data.language || language, duration: data.duration || 0 };
}

/**
 * 语音合成，返回 mp3 字节。
 * edge-tts 在 2026-01 前后因微软收紧鉴权出现过 403 大面积故障，故此处重试一次；
 * 仍失败则由调用方回退到浏览器 speechSynthesis。
 */
export async function synthesize(text, { lang = 'zh', voice = '' } = {}) {
  const payload = { text, lang, voice };
  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const res = await post('/tts', payload, { timeout: env.ai.ttsTimeout });
      const arrayBuffer = await res.arrayBuffer();
      return { buffer: Buffer.from(arrayBuffer), contentType: res.headers.get('content-type') || 'audio/mpeg' };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}
