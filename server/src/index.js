import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env.js';
import { initializeDatabase } from './db/init.js';
import { authRouter } from './routes/auth.js';
import { termsRouter } from './routes/terms.js';
import { practiceRouter } from './routes/practice.js';
import { analysisRouter } from './routes/analysis.js';
import { systemRouter } from './routes/system.js';
import { agentRouter } from './routes/agent.js';

const app = express();

app.use(helmet());
app.use(cors());
// 音频走 express.raw（在 /api/agent/asr 路由级挂载），express.json 会自动跳过非 JSON 请求
app.use(express.json({ limit: '2mb' }));
app.use(morgan('dev'));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', name: 'railway-term-learning-server' });
});
app.use('/api/auth', authRouter);
app.use('/api/terms', termsRouter);
app.use('/api/practice', practiceRouter);
app.use('/api/analysis', analysisRouter);
app.use('/api/system', systemRouter);
app.use('/api/agent', agentRouter);

app.use((err, req, res, next) => {
  // zod 校验失败已在中间件里拦截，这里只兜底
  console.error(err);
  res.status(500).json({ message: err.message || 'Internal Server Error' });
});

initializeDatabase()
  .then(() => {
    const server = app.listen(env.port, '0.0.0.0', () => {
      console.log(`Server listening on http://localhost:${env.port}`);
    });
    // Node 默认 requestTimeout 是 300000ms，会把超过 5 分钟的 SSE 流（模型加载 +
    // 长回答、大模型拉取进度）直接掐断。智能体的流式接口必须置 0。
    server.requestTimeout = 0;
    server.headersTimeout = 0;
  })
  .catch((error) => {
    console.error('Database initialization failed:', error.message);
    process.exit(1);
  });
