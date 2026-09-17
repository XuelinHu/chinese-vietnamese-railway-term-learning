const API_BASE = '/api';

export function getToken() {
  return localStorage.getItem('token');
}

export function setToken(token) {
  localStorage.setItem('token', token);
}

export function clearToken() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
}

export function getStoredUser() {
  try {
    return JSON.parse(localStorage.getItem('user') || 'null');
  } catch {
    return null;
  }
}

function authHeaders(extra = {}) {
  const headers = { ...extra };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

/** 统一的错误构造：把后端 {message} 抬成 Error，并保留 status 供调用方分支。 */
async function toError(response) {
  const data = await response.json().catch(() => ({}));
  const err = new Error(data.message || data.error || `请求失败（${response.status}）`);
  err.status = response.status;
  err.data = data;
  return err;
}

/** JSON 请求。所有普通接口都走这里。 */
export async function request(path, options = {}) {
  const headers = authHeaders({
    'Content-Type': 'application/json',
    ...(options.headers || {})
  });
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  if (!response.ok) throw await toError(response);
  if (response.status === 204) return null;
  return response.json().catch(() => ({}));
}

export const get = (path) => request(path);
export const post = (path, body) => request(path, { method: 'POST', body });
export const put = (path, body) => request(path, { method: 'PUT', body });
export const del = (path) => request(path, { method: 'DELETE' });

/** 把对象拼成查询串，跳过空值——分页/筛选接口统一用它，避免手写 URLSearchParams。 */
export function qs(params = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    search.set(key, value);
  });
  const text = search.toString();
  return text ? `?${text}` : '';
}

/**
 * 发送原始二进制（录音 blob）。
 * 不能复用 request()：它硬编码 Content-Type: application/json 并强制 JSON.stringify。
 */
export async function uploadRaw(path, blob, { headers = {}, method = 'POST' } = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: authHeaders({ 'Content-Type': blob.type || 'application/octet-stream', ...headers }),
    body: blob
  });
  if (!response.ok) throw await toError(response);
  return response.json();
}

/** 取二进制响应（TTS 的 mp3）。返回 Blob。 */
export async function fetchBlob(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: authHeaders({ 'Content-Type': 'application/json', ...(options.headers || {}) }),
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  if (!response.ok) throw await toError(response);
  return response.blob();
}

/**
 * POST + SSE 流式读取。
 *
 * 不用 EventSource：它无法携带 Authorization 头，也不支持 POST body。
 * 这里用 fetch + ReadableStream 手工切分 SSE 帧。
 *
 * @param {string} path
 * @param {object} body
 * @param {(payload: object) => void} onEvent 每收到一条 data: 就回调（已 JSON.parse）
 * @param {AbortSignal} signal 用于「停止生成」
 */
export async function sseStream(path, body, onEvent, signal) {
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json', Accept: 'text/event-stream' }),
    body: JSON.stringify(body ?? {}),
    signal
  });

  if (!response.ok) throw await toError(response);
  if (!response.body) throw new Error('当前浏览器不支持流式响应');

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // SSE 以空行分帧；\r\n\r\n 与 \n\n 都要认。
      const match = buffer.match(/\r?\n\r?\n/);
      let boundary = match ? buffer.search(/\r?\n\r?\n/) : -1;
      while (boundary !== -1) {
        const frame = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + match[0].length);
        handleFrame(frame, onEvent);
        const next = buffer.match(/\r?\n\r?\n/);
        boundary = next ? buffer.search(/\r?\n\r?\n/) : -1;
      }
    }
    if (buffer.trim()) handleFrame(buffer, onEvent);
  } finally {
    reader.cancel().catch(() => {});
  }
}

function handleFrame(frame, onEvent) {
  // 一帧里可能有多行 data:，按 SSE 规范用 \n 拼接。
  const dataLines = frame
    .split(/\r?\n/)
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).replace(/^ /, ''));
  if (!dataLines.length) return; // 注释行（: connected 之类的心跳）直接忽略
  const raw = dataLines.join('\n');
  try {
    onEvent(JSON.parse(raw));
  } catch {
    onEvent({ raw });
  }
}
