/**
 * Android WebView 原生桥。
 *
 * H5 侧只认 window.RailwayNative 这个契约；宿主 App 可以是任意实现
 * （见 docs/android-webview.md 的 Kotlin 参考实现）。
 *
 * 关键前提：WebView 必须以**安全上下文**加载（https:// 或 file://）。
 * 若加载 http://<局域网IP>:4026，navigator.mediaDevices 会是 undefined 且**不抛异常**，
 * 这是最难排查的一种失败。详见 docs/android-webview.md。
 */

export function hasNativeBridge() {
  return typeof window !== 'undefined' && Boolean(window.RailwayNative);
}

let callbackRegistered = false;
let pendingResolve = null;
let pendingReject = null;

function ensureCallback() {
  if (callbackRegistered || !hasNativeBridge()) return;
  callbackRegistered = true;
  // Kotlin 侧通过 evaluateJavascript 调用它。
  window.__railwayVoiceResult = (payload) => {
    if (!pendingResolve) return;
    const resolve = pendingResolve;
    const reject = pendingReject;
    pendingResolve = null;
    pendingReject = null;
    let data = payload;
    if (typeof payload === 'string') {
      try {
        data = JSON.parse(payload);
      } catch {
        data = { text: payload };
      }
    }
    if (data && data.error) reject(new Error(data.error));
    else resolve(data || {});
  };
}

/**
 * 调起原生语音识别。
 * @param {string} lang BCP-47，如 'vi-VN' / 'zh-CN'
 * @returns {Promise<{text: string}>}
 */
export function nativeRecognize(lang = 'zh-CN') {
  if (!hasNativeBridge()) return Promise.reject(new Error('未检测到原生桥'));
  ensureCallback();
  return new Promise((resolve, reject) => {
    // 同一时刻只允许一路识别，新的请求直接顶掉旧的。
    if (pendingReject) pendingReject(new Error('已被新的识别请求取代'));
    pendingResolve = resolve;
    pendingReject = reject;
    try {
      window.RailwayNative.startVoice(String(lang));
    } catch (err) {
      pendingResolve = null;
      pendingReject = null;
      reject(err);
    }
  });
}

/** 用原生 TTS 播报。resolve 表示播报结束。 */
export function nativeSpeak(text, lang = 'zh-CN') {
  if (!hasNativeBridge() || typeof window.RailwayNative.speak !== 'function') {
    return Promise.reject(new Error('原生桥不支持播报'));
  }
  ensureCallback();
  return new Promise((resolve, reject) => {
    pendingResolve = resolve;
    pendingReject = reject;
    try {
      window.RailwayNative.speak(String(text), String(lang));
    } catch (err) {
      pendingResolve = null;
      pendingReject = null;
      reject(err);
    }
  });
}

export function nativeStopSpeak() {
  if (hasNativeBridge() && typeof window.RailwayNative.stopSpeak === 'function') {
    try {
      window.RailwayNative.stopSpeak();
    } catch {
      /* 忽略 */
    }
  }
}

/**
 * 请求麦克风权限。Android 上权限弹窗由宿主 App 负责，
 * 这里只是把 getUserMedia 的结果统一成布尔值。
 */
export async function ensureMicPermission() {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) return false;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((track) => track.stop());
    return true;
  } catch {
    return false;
  }
}
