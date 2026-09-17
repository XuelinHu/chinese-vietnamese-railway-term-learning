import { env } from '../config/env.js';

const BASE = env.ollama.url;

async function call(path, { method = 'GET', body, timeout } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout ?? env.ollama.requestTimeout);
  try {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Ollama ${path} ${res.status}: ${text.slice(0, 300)}`);
    }
    return res;
  } finally {
    clearTimeout(timer);
  }
}

/** Ollama 是否在线。用于 /api/agent/health 与降级判断。 */
export async function isAvailable() {
  try {
    const res = await call('/api/tags', { timeout: 4000 });
    const data = await res.json();
    return { available: true, models: (data.models || []).map((m) => m.name) };
  } catch {
    return { available: false, models: [] };
  }
}

/** 已安装模型清单。 */
export async function listModels() {
  const res = await call('/api/tags', { timeout: 8000 });
  const data = await res.json();
  return (data.models || []).map((m) => ({
    name: m.name,
    size: m.size,
    family: m.details?.family || '',
    parameterSize: m.details?.parameter_size || '',
    quantization: m.details?.quantization_level || '',
    modifiedAt: m.modified_at
  }));
}

/** 当前已加载进显存的模型。 */
export async function listRunning() {
  try {
    const res = await call('/api/ps', { timeout: 5000 });
    const data = await res.json();
    return (data.models || []).map((m) => ({
      name: m.name,
      sizeVram: m.size_vram,
      expiresAt: m.expires_at
    }));
  } catch {
    return [];
  }
}

export async function deleteModel(name) {
  await call('/api/delete', { method: 'DELETE', body: { model: name }, timeout: 30000 });
}

/**
 * 拉取模型，逐块产出 Ollama 的 NDJSON 进度对象。
 * 注意 completed/total 在早期行可能缺失，调用方必须防止除零。
 */
export async function* pullModel(name) {
  const res = await call('/api/pull', {
    method: 'POST',
    body: { model: name, stream: true },
    timeout: 24 * 60 * 60 * 1000
  });
  yield* ndjson(res);
}

/** 把 fetch 响应体按行解析为 NDJSON 对象流。 */
export async function* ndjson(res) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let index = buffer.indexOf('\n');
    while (index !== -1) {
      const line = buffer.slice(0, index).trim();
      buffer = buffer.slice(index + 1);
      if (line) {
        try {
          yield JSON.parse(line);
        } catch {
          // Ollama 偶尔会插入非 JSON 行，跳过即可
        }
      }
      index = buffer.indexOf('\n');
    }
  }
  const tail = buffer.trim();
  if (tail) {
    try {
      yield JSON.parse(tail);
    } catch { /* 忽略残行 */ }
  }
}

/**
 * 流式对话，逐块产出 { content, thinking, done, evalCount }。
 *
 * 两个关键点（否则线上会「假死」）：
 * 1. 必须传 think:false。qwen3 等推理模型会先长时间输出 message.thinking 而
 *    message.content 恒为空串，前端按 content 渲染就是一片空白。
 * 2. eval_count 只在最后一帧出现，做不了实时 token 计数；最后一帧的
 *    content 也是空串，不能当错误处理、也不必下发。
 */
export async function* chatStream({ model, messages, temperature = 0.7, think = false }) {
  const res = await call('/api/chat', {
    method: 'POST',
    body: {
      model,
      messages,
      stream: true,
      think,
      options: { temperature }
    }
  });
  for await (const chunk of ndjson(res)) {
    if (chunk.error) throw new Error(chunk.error);
    const content = chunk.message?.content || '';
    if (chunk.done) {
      yield { content: '', done: true, evalCount: chunk.eval_count || 0, doneReason: chunk.done_reason || '' };
      return;
    }
    if (content) yield { content, done: false };
  }
}
