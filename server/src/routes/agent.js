import express, { Router } from 'express';
import { z } from 'zod';
import { env } from '../config/env.js';
import { authRequired, requireRole } from '../middleware/auth.js';
import { query } from '../db/pool.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { getPagination, paged } from '../utils/pagination.js';
import { validateBody } from '../utils/validate.js';
import * as ollama from '../services/ollama.js';
import * as sidecar from '../services/sidecar.js';
import { retrieve, buildContext, buildSystemPrompt, domainPrompt } from '../services/rag.js';
import { logOperation } from '../services/audit.js';

export const agentRouter = Router();
agentRouter.use(authRequired);

/* ------------------------------ SSE 工具 ------------------------------ */

/**
 * 建立 SSE 响应。
 * 必须 flushHeaders 并立刻写一个注释帧：浏览器 fetch() 要等到第一个 **响应体**
 * 字节到达才 resolve，否则模型加载期间前端的 await 会一直挂着。
 */
function openSse(res) {
  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  // 反向代理（nginx 等）不缓冲，否则流式会被攒成一次性输出
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();
  res.write(': connected\n\n');
}

function sendSse(res, payload) {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function endSse(res) {
  res.write('event: end\ndata: {}\n\n');
  res.end();
}

/* ------------------------------ 能力探测 ------------------------------ */

agentRouter.get('/health', asyncHandler(async (req, res) => {
  const [llm, ai] = await Promise.all([ollama.isAvailable(), sidecar.health()]);
  res.json({
    llm: { available: llm.available, models: llm.models },
    asr: ai.asr,
    tts: ai.tts,
    sidecar: { available: ai.available, reason: ai.reason || null, device: ai.device || null, asrModel: ai.asrModel || null },
    defaultModel: env.ollama.defaultModel
  });
}));

/* ------------------------------ 模型管理 ------------------------------ */

agentRouter.get('/models', asyncHandler(async (req, res) => {
  const [catalog, installed, running] = await Promise.all([
    query("SELECT * FROM agent_model ORDER BY CASE tier WHEN 'recommended' THEN 1 WHEN 'light' THEN 2 WHEN 'advanced' THEN 3 ELSE 4 END, id"),
    ollama.listModels().catch(() => []),
    ollama.listRunning()
  ]);

  const installedByName = new Map(installed.map((m) => [m.name, m]));
  const runningByName = new Map(running.map((m) => [m.name, m]));
  const catalogNames = new Set(catalog.map((c) => c.name));

  const models = catalog.map((c) => {
    const inst = installedByName.get(c.name);
    return {
      name: c.name,
      label: c.label,
      family: c.family,
      paramSize: c.param_size,
      tier: c.tier,
      description: c.description_zh,
      isDefault: Boolean(c.is_default),
      installed: Boolean(inst),
      sizeBytes: inst?.size || 0,
      quantization: inst?.quantization || '',
      loaded: runningByName.has(c.name),
      vramBytes: runningByName.get(c.name)?.sizeVram || 0
    };
  });

  // 用户手工 ollama pull 的、不在目录里的模型也要能看到
  for (const inst of installed) {
    if (catalogNames.has(inst.name)) continue;
    models.push({
      name: inst.name,
      label: inst.name,
      family: inst.family,
      paramSize: inst.parameterSize,
      tier: 'recommended',
      description: '手工安装的模型',
      isDefault: false,
      installed: true,
      sizeBytes: inst.size,
      quantization: inst.quantization,
      loaded: runningByName.has(inst.name),
      vramBytes: runningByName.get(inst.name)?.sizeVram || 0
    });
  }

  res.json({ models, llmAvailable: installed.length > 0 || catalog.length > 0 });
}));

/** 拉取模型，把 Ollama 的 NDJSON 进度转成 SSE。 */
agentRouter.post('/models/pull', requireRole('admin'), validateBody(z.object({
  name: z.string().trim().min(1).max(120)
})), asyncHandler(async (req, res) => {
  const { name } = req.body;
  openSse(res);

  let aborted = false;
  req.on('close', () => { aborted = true; });

  try {
    for await (const chunk of ollama.pullModel(name)) {
      if (aborted) return;
      // completed/total 在早期行可能缺失，前端据此防除零
      sendSse(res, {
        type: 'progress',
        status: chunk.status || '',
        digest: chunk.digest || '',
        completed: chunk.completed ?? null,
        total: chunk.total ?? null
      });
    }
    if (!aborted) {
      await query('UPDATE agent_model SET pulled_at = CURRENT_TIMESTAMP WHERE name = :name', { name });
      await logOperation({ req, module: 'agent', action: 'pull-model', detail: `拉取模型 ${name}` });
      sendSse(res, { type: 'done', name });
      endSse(res);
    }
  } catch (error) {
    if (!aborted) {
      sendSse(res, { type: 'error', message: error.message });
      endSse(res);
    }
  }
}));

agentRouter.delete('/models/:name', requireRole('admin'), asyncHandler(async (req, res) => {
  const name = req.params.name;
  await ollama.deleteModel(name);
  await query('UPDATE agent_model SET pulled_at = NULL WHERE name = :name', { name });
  await logOperation({ req, module: 'agent', action: 'delete-model', detail: `删除模型 ${name}` });
  res.json({ message: 'ok' });
}));

agentRouter.post('/models/:name/default', requireRole('admin'), asyncHandler(async (req, res) => {
  const name = req.params.name;
  await query('UPDATE agent_model SET is_default = 0');
  await query('UPDATE agent_model SET is_default = 1 WHERE name = :name', { name });
  await logOperation({ req, module: 'agent', action: 'set-default-model', detail: `默认模型设为 ${name}` });
  res.json({ message: 'ok' });
}));

/* ------------------------------- 流式问答 ------------------------------- */

const chatSchema = z.object({
  sessionId: z.coerce.number().int().positive().nullable().optional(),
  model: z.string().trim().min(1).max(120),
  message: z.string().trim().min(1, '请输入内容').max(4000, '单条消息最长 4000 字'),
  lang: z.enum(['zh', 'en', 'vi']).optional().default('zh'),
  useRag: z.boolean().optional().default(true),
  temperature: z.coerce.number().min(0).max(2).optional().default(0.7)
});

agentRouter.post('/chat', validateBody(chatSchema), asyncHandler(async (req, res) => {
  const { model, message, lang, useRag, temperature } = req.body;
  let { sessionId } = req.body;

  openSse(res);
  let aborted = false;
  req.on('close', () => { aborted = true; });

  const startedAt = Date.now();

  try {
    // 1) 会话：没有就建，有了要校验归属，防止越权读写他人会话
    if (sessionId) {
      const owned = await query('SELECT id FROM agent_session WHERE id = :id AND user_id = :userId', {
        id: sessionId, userId: req.user.id
      });
      if (!owned.length) {
        sendSse(res, { type: 'error', message: '会话不存在或无权访问' });
        return endSse(res);
      }
    } else {
      const title = message.slice(0, 40) || '新会话';
      const created = await query(
        'INSERT INTO agent_session (user_id, title, model) VALUES (:userId, :title, :model)',
        { userId: req.user.id, title, model }
      );
      sessionId = created.insertId;
    }

    sendSse(res, { type: 'start', sessionId, model });

    // 2) 取历史（不含本条），限制条数避免上下文无限增长
    const history = await query(
      `SELECT role, content FROM agent_message
       WHERE session_id = :sessionId AND role IN ('user','assistant')
       ORDER BY id DESC LIMIT ${env.ollama.historyLimit}`,
      { sessionId }
    );

    // 3) RAG 接地
    let context = '';
    let matched = [];
    if (useRag) {
      matched = await retrieve(message, 5);
      context = buildContext(matched, lang);
      if (matched.length) {
        sendSse(res, { type: 'rag', terms: matched.map((m) => ({ id: m.id, zh: m.term_zh, vi: m.term_vi, en: m.term_en })) });
      }
    }

    const messages = [
      { role: 'system', content: buildSystemPrompt({ lang, context }) },
      ...history.reverse(),
      { role: 'user', content: message }
    ];

    // 4) 流式转发
    let answer = '';
    let evalCount = 0;
    for await (const chunk of ollama.chatStream({ model, messages, temperature })) {
      if (aborted) break;
      if (chunk.done) {
        evalCount = chunk.evalCount;
        break;
      }
      answer += chunk.content;
      sendSse(res, { type: 'delta', content: chunk.content });
    }

    const durationMs = Date.now() - startedAt;

    if (!aborted) {
      // 5) 落库。助手消息为空说明被中断或模型没输出，仍记录 user 消息以免上下文断裂
      await query(
        'INSERT INTO agent_message (session_id, role, content, model, duration_ms) VALUES (:sessionId, "user", :content, :model, 0)',
        { sessionId, content: message, model }
      );
      if (answer) {
        await query(
          `INSERT INTO agent_message (session_id, role, content, model, tokens, duration_ms)
           VALUES (:sessionId, 'assistant', :content, :model, :tokens, :durationMs)`,
          { sessionId, content: answer, model, tokens: evalCount, durationMs }
        );
      }
      await query(
        `UPDATE agent_session SET message_count = message_count + ${answer ? 2 : 1},
                model = :model, updated_at = CURRENT_TIMESTAMP WHERE id = :sessionId`,
        { model, sessionId }
      );

      sendSse(res, {
        type: 'done',
        sessionId,
        evalCount,
        durationMs,
        chars: answer.length,
        terms: matched.length
      });
      endSse(res);
    }
  } catch (error) {
    if (!aborted) {
      const friendly = /abort|timeout/i.test(error.message)
        ? '模型响应超时，请重试或换用更小的模型'
        : error.message;
      sendSse(res, { type: 'error', message: friendly });
      endSse(res);
    }
  }
}));

/* ------------------------------ 会话管理 ------------------------------ */

agentRouter.get('/sessions', asyncHandler(async (req, res) => {
  const { page, pageSize, limit, offset } = getPagination(req.query);
  // 非管理员只能看自己的会话
  const isStaff = ['admin'].includes(req.user.role_code);
  const userId = isStaff && req.query.userId ? Number(req.query.userId) : (isStaff ? null : req.user.id);
  const keyword = (req.query.keyword || '').trim();
  const model = req.query.model || null;

  const params = { userId, keyword: `%${keyword}%`, model, limit, offset };
  const where = `WHERE (CAST(:userId AS integer) IS NULL OR s.user_id = :userId)
       AND (CAST(:model AS text) IS NULL OR s.model = :model)
       AND (:keyword = '%%' OR s.title ILIKE :keyword OR u.username ILIKE :keyword)`;

  const total = await query(
    `SELECT COUNT(*) AS count FROM agent_session s JOIN sys_user u ON u.id = s.user_id ${where}`,
    params
  );
  const rows = await query(
    `SELECT s.*, u.username, u.real_name
     FROM agent_session s JOIN sys_user u ON u.id = s.user_id
     ${where}
     ORDER BY s.updated_at DESC LIMIT ${limit} OFFSET ${offset}`,
    params
  );
  res.json(paged(rows, total[0].count, page, pageSize));
}));

agentRouter.get('/sessions/:id/messages', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const isStaff = ['admin'].includes(req.user.role_code);

  const owned = await query('SELECT user_id FROM agent_session WHERE id = :id', { id });
  if (!owned.length) return res.status(404).json({ message: '会话不存在' });
  if (!isStaff && owned[0].user_id !== req.user.id) return res.status(403).json({ message: '无权访问该会话' });

  const { page, pageSize, limit, offset } = getPagination(req.query);
  const total = await query('SELECT COUNT(*) AS count FROM agent_message WHERE session_id = :id', { id });
  const rows = await query(
    `SELECT id, role, content, model, tokens, duration_ms, created_at
     FROM agent_message WHERE session_id = :id
     ORDER BY id DESC LIMIT ${limit} OFFSET ${offset}`,
    { id }
  );
  res.json(paged(rows, total[0].count, page, pageSize));
}));

agentRouter.delete('/sessions/:id', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const isStaff = ['admin'].includes(req.user.role_code);
  const owned = await query('SELECT user_id FROM agent_session WHERE id = :id', { id });
  if (!owned.length) return res.status(404).json({ message: '会话不存在' });
  if (!isStaff && owned[0].user_id !== req.user.id) return res.status(403).json({ message: '无权删除该会话' });

  await query('DELETE FROM agent_message WHERE session_id = :id', { id });
  await query('DELETE FROM agent_session WHERE id = :id', { id });
  await logOperation({ req, module: 'agent', action: 'delete-session', detail: `删除会话 id=${id}` });
  res.json({ message: 'ok' });
}));

/* ------------------------------ 语音能力 ------------------------------ */

const ttsSchema = z.object({
  text: z.string().trim().min(1, '缺少文本').max(2000, '单次播报最长 2000 字'),
  lang: z.enum(['zh', 'en', 'vi']).optional().default('zh'),
  voice: z.string().trim().max(80).optional().default('')
});

agentRouter.post('/tts', validateBody(ttsSchema), asyncHandler(async (req, res) => {
  const { text, lang, voice } = req.body;
  try {
    const { buffer, contentType } = await sidecar.synthesize(text, { lang, voice });
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', buffer.length);
    res.setHeader('Cache-Control', 'no-store');
    res.send(buffer);
  } catch (error) {
    // 503 让前端明确知道该回退到 speechSynthesis，而不是当作普通错误
    res.status(503).json({
      message: '语音合成服务不可用，已回退到浏览器播报',
      fallback: 'speechSynthesis',
      detail: error.message
    });
  }
}));

/**
 * 语音转写。
 * express.raw 只在 Content-Type 命中 audio/* 时生效；未命中时 body-parser 会留下 {}，
 * 所以必须显式 Buffer.isBuffer 判断，否则会把空对象当音频转发给边车。
 */
agentRouter.post('/asr',
  express.raw({ type: ['audio/*', 'application/octet-stream'], limit: env.ai.maxAudioBytes }),
  asyncHandler(async (req, res) => {
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      return res.status(400).json({ message: '未收到音频数据' });
    }
    const language = ['zh', 'vi', 'en'].includes(req.query.language) ? req.query.language : '';
    const contentType = req.headers['content-type'] || 'audio/webm';

    try {
      // 用本库术语做领域提示词，显著提升专业词识别率（详见 rag.domainPrompt 的注释）。
      // 语言未知时不给提示词——提示词会干扰 Whisper 的自动语种判定。
      const prompt = language ? await domainPrompt(language) : '';
      const result = await sidecar.transcribe(req.body, contentType, language, prompt);
      res.json(result);
    } catch (error) {
      res.status(503).json({
        message: '语音识别服务不可用，已回退到浏览器识别',
        fallback: 'webSpeech',
        detail: error.message
      });
    }
  })
);
