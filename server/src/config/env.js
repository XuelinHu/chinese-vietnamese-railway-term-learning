import dotenv from 'dotenv';
import { randomBytes } from 'node:crypto';
import { assertDatabaseName, assertProductionConfig } from './validate-env.js';

dotenv.config();

const isProduction = process.env.NODE_ENV === 'production';
assertProductionConfig(process.env);
assertDatabaseName(process.env.DB_NAME || 'railway_term_learning');

/** 读取整型环境变量并夹到合法区间，避免 NaN 流进 SQL（LIMIT 拼接处尤其危险）。 */
const int = (value, fallback, min, max) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
};

export const env = {
  isProduction,
  port: Number(process.env.PORT || 8031),
  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'railway_term_learning'
  },
  jwtSecret: process.env.JWT_SECRET || randomBytes(32).toString('hex'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',

  ollama: {
    url: (process.env.OLLAMA_URL || 'http://127.0.0.1:11434').replace(/\/+$/, ''),
    defaultModel: process.env.OLLAMA_DEFAULT_MODEL || 'qwen3:14b',
    // 单次对话注入的历史消息上限，防止上下文无限增长
    historyLimit: int(process.env.OLLAMA_HISTORY_LIMIT, 20, 1, 100),
    // 推理超时（毫秒）。本地大模型首次加载可能较慢，默认给足 5 分钟
    requestTimeout: int(process.env.OLLAMA_REQUEST_TIMEOUT, 300000, 5000, 3600000)
  },

  // AI 边车（faster-whisper ASR + edge-tts TTS）。缺席时整套智能体降级为浏览器能力
  ai: {
    url: (process.env.AI_SIDECAR_URL || 'http://127.0.0.1:8090').replace(/\/+$/, ''),
    enabled: process.env.AI_SIDECAR_ENABLED !== 'false',
    asrModel: process.env.ASR_MODEL || 'large-v3',
    asrTimeout: int(process.env.ASR_TIMEOUT, 120000, 5000, 600000),
    ttsTimeout: int(process.env.TTS_TIMEOUT, 60000, 5000, 300000),
    maxAudioBytes: int(process.env.ASR_MAX_BYTES, 20 * 1024 * 1024, 1024, 100 * 1024 * 1024)
  },

  // SMTP 未配置时验证码写入操作日志，且仅在非生产环境回显给前端
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT || 465),
    secure: process.env.SMTP_SECURE !== 'false',
    user: process.env.SMTP_USER || '',
    password: process.env.SMTP_PASSWORD || '',
    from: process.env.SMTP_FROM || process.env.SMTP_USER || ''
  },

  resetCodeTtlMinutes: Number(process.env.RESET_CODE_TTL_MINUTES || 10)
};

export const smtpConfigured = Boolean(env.smtp.host && env.smtp.user && env.smtp.password);
