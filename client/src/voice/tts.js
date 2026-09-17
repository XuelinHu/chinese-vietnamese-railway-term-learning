/**
 * 语音合成（TTS）。
 *
 * 三级降级：
 *   1. 服务端 edge-tts（音质最好，中越英都有稳定音色）
 *   2. 浏览器 speechSynthesis（离线可用，但 vi-VN 音色在多数平台缺失）
 *   3. 原生桥 TextToSpeech（仅 Android，且有原生桥时）
 */

export function hasSpeechSynthesis() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

/** 浏览器里是否真的装了目标语言的音色——装了才值得用它兜底。 */
export function hasVoiceFor(lang) {
  if (!hasSpeechSynthesis()) return false;
  const prefix = String(lang).slice(0, 2).toLowerCase();
  return window.speechSynthesis.getVoices().some((v) => v.lang?.toLowerCase().startsWith(prefix));
}

let currentAudio = null;
let currentUtterance = null;

/** 立刻掐断正在播的音频（服务端与浏览器两条路都掐）。 */
export function stopSpeaking() {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.src = '';
    currentAudio = null;
  }
  if (currentUtterance) {
    window.speechSynthesis.cancel();
    currentUtterance = null;
  }
}

/**
 * 播服务端合成好的 mp3。
 * @param {Blob} blob
 * @returns {Promise<void>} 播完才 resolve
 */
export function playBlob(blob) {
  return new Promise((resolve, reject) => {
    stopSpeaking();
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    currentAudio = audio;
    const done = () => {
      URL.revokeObjectURL(url);
      if (currentAudio === audio) currentAudio = null;
      resolve();
    };
    audio.onended = done;
    audio.onerror = () => {
      URL.revokeObjectURL(url);
      if (currentAudio === audio) currentAudio = null;
      reject(new Error('音频播放失败'));
    };
    audio.play().catch((err) => {
      URL.revokeObjectURL(url);
      if (currentAudio === audio) currentAudio = null;
      reject(err);
    });
  });
}

/**
 * 浏览器内置合成。
 * @returns {Promise<void>} 播完才 resolve
 */
export function speakLocal(text, lang = 'zh-CN') {
  return new Promise((resolve, reject) => {
    if (!hasSpeechSynthesis()) return reject(new Error('浏览器不支持语音合成'));
    stopSpeaking();
    const utterance = new SpeechSynthesisUtterance(String(text));
    utterance.lang = lang;
    const prefix = String(lang).slice(0, 2).toLowerCase();
    const voice = window.speechSynthesis.getVoices().find((v) => v.lang?.toLowerCase().startsWith(prefix));
    if (voice) utterance.voice = voice;
    // 有些浏览器 onend 不触发，用 onerror 兜底避免永久挂起。
    utterance.onend = () => {
      if (currentUtterance === utterance) currentUtterance = null;
      resolve();
    };
    utterance.onerror = (event) => {
      if (currentUtterance === utterance) currentUtterance = null;
      // interrupted / canceled 是主动打断，不算失败。
      if (event.error === 'interrupted' || event.error === 'canceled') resolve();
      else reject(new Error(`语音合成失败：${event.error}`));
    };
    currentUtterance = utterance;
    window.speechSynthesis.speak(utterance);
  });
}

/** 把 AI 回答里不适合朗读的 Markdown 记号剥掉。 */
export function stripForSpeech(text) {
  return String(text || '')
    .replace(/```[\s\S]*?```/g, ' 代码块 ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s{0,3}[-*+]\s+/gm, '')
    .replace(/^\s{0,3}>\s?/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/~~([^~]+)~~/g, '$1')
    .replace(/\|/g, ' ')
    .replace(/\n{2,}/g, '。')
    .replace(/\s+/g, ' ')
    .trim();
}
