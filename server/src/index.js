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

const app = express();

app.use(helmet());
app.use(cors());
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

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ message: err.message || 'Internal Server Error' });
});

initializeDatabase()
  .then(() => {
    app.listen(env.port, '0.0.0.0', () => {
      console.log(`Server listening on http://localhost:${env.port}`);
    });
  })
  .catch((error) => {
    console.error('Database initialization failed:', error.message);
    process.exit(1);
  });
