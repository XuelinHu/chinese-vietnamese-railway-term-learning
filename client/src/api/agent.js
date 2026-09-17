import { fetchBlob, get, post, qs, request, sseStream, uploadRaw } from './http';

/**
 * 智能体接口。
 *
 * 三个非标准端点：
 *  - /chat 与 /models/pull 是 SSE（走 sseStream）
 *  - /tts 返回 mp3 字节（走 fetchBlob）
 *  - /asr 收原始音频字节（走 uploadRaw）
 */

export const health = () => get('/agent/health');

export const listModels = () => get('/agent/models');

export const setDefaultModel = (name) => post(`/agent/models/${encodeURIComponent(name)}/default`);

export const deleteModel = (name) =>
  request(`/agent/models/${encodeURIComponent(name)}`, { method: 'DELETE' });

/**
 * 拉取模型，带进度回调。
 * @param {string} name
 * @param {(p: {status: string, completed: number|null, total: number|null}) => void} onProgress
 * @returns {Promise<void>} 流结束时 resolve；收到 error 事件则 reject
 */
export function pullModel(name, onProgress, signal) {
  return new Promise((resolve, reject) => {
    let failed = null;
    sseStream(
      '/agent/models/pull',
      { name },
      (event) => {
        if (event.type === 'progress') {
          onProgress?.({
            status: event.status || '',
            digest: event.digest || '',
            // completed/total 可能是 null，做除法前必须挡掉
            completed: typeof event.completed === 'number' ? event.completed : null,
            total: typeof event.total === 'number' ? event.total : null
          });
        } else if (event.type === 'done') {
          onProgress?.({ status: 'done', completed: null, total: null });
        } else if (event.type === 'error') {
          failed = new Error(event.message || '拉取失败');
        }
      },
      signal
    )
      .then(() => (failed ? reject(failed) : resolve()))
      .catch(reject);
  });
}

/**
 * 流式对话。
 *
 * @param {object} payload { sessionId?, model, message, lang, useRag, temperature }
 * @param {object} handlers
 * @param {(sessionId: number, model: string) => void} handlers.onStart
 * @param {(terms: Array) => void} handlers.onRag
 * @param {(chunk: string) => void} handlers.onDelta
 * @param {(summary: object) => void} handlers.onDone
 * @param {(message: string) => void} handlers.onError
 * @param {AbortSignal} signal
 */
export async function chat(payload, handlers = {}, signal) {
  let failure = null;
  await sseStream(
    '/agent/chat',
    payload,
    (event) => {
      switch (event.type) {
        case 'start':
          handlers.onStart?.(event.sessionId, event.model);
          break;
        case 'rag':
          handlers.onRag?.(event.terms || []);
          break;
        case 'delta':
          // 模型结束帧的 content 是空串，直接丢弃，避免渲染出空泡
          if (event.content) handlers.onDelta?.(event.content);
          break;
        case 'done':
          handlers.onDone?.(event);
          break;
        case 'error':
          failure = new Error(event.message || '模型返回错误');
          break;
        default:
          break;
      }
    },
    signal
  );
  // 服务端发完 error 事件后仍会正常关闭流，所以要在流结束后再抛。
  if (failure) {
    handlers.onError?.(failure.message);
    throw failure;
  }
}

export const listSessions = (params) => get(`/agent/sessions${qs(params)}`);

export const listSessionMessages = (id, params) =>
  get(`/agent/sessions/${id}/messages${qs(params)}`);

export const deleteSession = (id) => request(`/agent/sessions/${id}`, { method: 'DELETE' });

/** 合成语音，返回 mp3 Blob。服务端不可用时抛 503，调用方应回退浏览器播报。 */
export const synthesize = (text, lang = 'zh', voice = '') =>
  fetchBlob('/agent/tts', { method: 'POST', body: { text, lang, voice } });

/** 上传录音转写。language 传 'zh'/'vi'/'en'，不传则自动识别。 */
export const transcribe = (blob, language) =>
  uploadRaw(`/agent/asr${language ? `?language=${language}` : ''}`, blob);
