/**
 * 语音识别（ASR）。
 *
 * 两套实现：
 *  1. MediaRecorder 录音 → POST /api/agent/asr（服务端 faster-whisper）。
 *     Android 与桌面浏览器共用这一条，是主路径——它不依赖 Google 服务，
 *     且能正确处理中越双语。
 *  2. Web Speech API（webkitSpeechRecognition）作为兜底：
 *     不需要服务端，但 Android WebView 里通常不可用（依赖 Google 服务）。
 *
 * 原生桥（window.RailwayNative）不是主路径，见 android.js 顶部说明。
 */

const MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
  'audio/mp4', // Safari / iOS
  'audio/aac'
];

export function pickMimeType() {
  if (typeof MediaRecorder === 'undefined') return '';
  for (const type of MIME_CANDIDATES) {
    if (MediaRecorder.isTypeSupported?.(type)) return type;
  }
  return '';
}

export function hasMediaRecorder() {
  return (
    typeof navigator !== 'undefined' &&
    Boolean(navigator.mediaDevices?.getUserMedia) &&
    typeof MediaRecorder !== 'undefined'
  );
}

export function hasWebSpeech() {
  return (
    typeof window !== 'undefined' &&
    Boolean(window.SpeechRecognition || window.webkitSpeechRecognition)
  );
}

/**
 * 录音器。支持两种停止方式：
 *  - 手动 stop()（按住说话）
 *  - 静音自动停止（连续对话：说完一段自动断句）
 *
 * @param {object} opts
 * @param {number} opts.silenceMs 连续静音多久算说完，0 表示不自动停
 * @param {number} opts.maxMs 单段录音上限，防止一直录
 * @param {() => void} opts.onAutoStop 自动停止时回调
 */
export function createRecorder({ silenceMs = 0, maxMs = 60000, onAutoStop } = {}) {
  let stream = null;
  let recorder = null;
  let chunks = [];
  let audioContext = null;
  let analyser = null;
  let rafId = null;
  let maxTimer = null;
  let silenceStart = 0;
  let stopped = false;

  function cleanup() {
    if (rafId) cancelAnimationFrame(rafId);
    if (maxTimer) clearTimeout(maxTimer);
    rafId = null;
    maxTimer = null;
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      stream = null;
    }
    if (audioContext && audioContext.state !== 'closed') {
      audioContext.close().catch(() => {});
    }
    audioContext = null;
    analyser = null;
  }

  /** 静音检测：用 AnalyserNode 的时域 RMS 判断有没有人说话。 */
  function watchSilence() {
    if (!silenceMs || !analyser) return;
    const buffer = new Uint8Array(analyser.fftSize);
    const tick = () => {
      if (stopped || !analyser) return;
      analyser.getByteTimeDomainData(buffer);
      let sum = 0;
      for (let i = 0; i < buffer.length; i += 1) {
        const v = (buffer[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / buffer.length);
      if (rms < 0.02) {
        if (!silenceStart) silenceStart = performance.now();
        else if (performance.now() - silenceStart > silenceMs) {
          onAutoStop?.();
          return; // 交给调用方决定 stop 还是 cancel
        }
      } else {
        silenceStart = 0;
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
  }

  return {
    /** 申请麦克风并开始录音。返回 MediaStream，供波形可视化复用。 */
    async start() {
      stopped = false;
      chunks = [];
      silenceStart = 0;
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      });

      if (silenceMs) {
        try {
          audioContext = new (window.AudioContext || window.webkitAudioContext)();
          const source = audioContext.createMediaStreamSource(stream);
          analyser = audioContext.createAnalyser();
          analyser.fftSize = 1024;
          source.connect(analyser);
          watchSilence();
        } catch {
          analyser = null; // 拿不到分析器就退化成纯手动停止
        }
      }

      const mimeType = pickMimeType();
      recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) chunks.push(event.data);
      };
      recorder.start();

      if (maxMs) {
        maxTimer = setTimeout(() => {
          onAutoStop?.();
        }, maxMs);
      }
      return stream;
    },

    /** 停止并拿到录音 blob。 */
    stop() {
      return new Promise((resolve) => {
        if (!recorder || recorder.state === 'inactive') {
          cleanup();
          resolve(new Blob(chunks, { type: pickMimeType() || 'audio/webm' }));
          return;
        }
        recorder.onstop = () => {
          stopped = true;
          const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
          cleanup();
          resolve(blob);
        };
        recorder.stop();
      });
    },

    /** 放弃这段录音。 */
    cancel() {
      stopped = true;
      try {
        if (recorder && recorder.state !== 'inactive') recorder.stop();
      } catch {
        /* 忽略 */
      }
      cleanup();
    },

    get stream() {
      return stream;
    }
  };
}

/**
 * Web Speech 兜底识别。
 * @returns {{ promise: Promise<string>, abort: () => void }}
 */
export function webSpeechRecognize(lang = 'zh-CN') {
  const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Ctor) return { promise: Promise.reject(new Error('浏览器不支持语音识别')), abort: () => {} };

  const recognition = new Ctor();
  recognition.lang = lang;
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
  recognition.continuous = false;

  let settled = false;
  const promise = new Promise((resolve, reject) => {
    recognition.onresult = (event) => {
      settled = true;
      resolve(event.results[0][0].transcript || '');
    };
    recognition.onerror = (event) => {
      if (settled) return;
      settled = true;
      const map = {
        'not-allowed': '麦克风权限被拒绝',
        'service-not-allowed': '当前环境不允许语音识别（需要 HTTPS 且能访问 Google 服务）',
        'no-speech': '没有听到声音',
        network: '语音识别服务网络不可达'
      };
      reject(new Error(map[event.error] || `语音识别失败：${event.error}`));
    };
    recognition.onend = () => {
      if (settled) return;
      settled = true;
      resolve(''); // 正常结束但没识别到内容
    };
  });

  try {
    recognition.start();
  } catch (err) {
    return { promise: Promise.reject(err), abort: () => {} };
  }
  return { promise, abort: () => recognition.abort() };
}
