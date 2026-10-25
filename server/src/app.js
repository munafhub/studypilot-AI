import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { securityHeaders, requireAuth, rateLimit, errorHandler } from './middleware.js';
import { authRoutes } from './routes/auth.js';
import { settingsRoutes } from './routes/settings.js';
import { taskRoutes } from './routes/tasks.js';
import { syllabusRoutes } from './routes/syllabus.js';
import { planRoutes } from './routes/plans.js';
import { aiRoutes } from './routes/ai.js';

/** Build the Express app. Dependencies are injected so tests can use an in-memory DB and a fake LLM. */
export function createApp({ db, config, llm, now = () => new Date(), logger = console }) {
  const ctx = { db, config, llm, now, logger };
  const app = express();
  app.disable('x-powered-by');
  app.use(securityHeaders);
  app.use(express.json({ limit: '100kb' }));

  const auth = requireAuth(ctx);
  const aiLimiter = rateLimit({ ...config.aiRateLimit, keyFn: (req) => `u${req.user.id}` });

  app.get('/api/health', (req, res) => res.json({ ok: true }));
  app.use('/api/auth', authRoutes(ctx));
  app.use('/api/settings', auth, settingsRoutes(ctx));
  app.use('/api/tasks', auth, taskRoutes(ctx));
  app.use('/api/syllabus', auth, aiLimiter, syllabusRoutes(ctx));
  app.use('/api/plans', auth, aiLimiter, planRoutes(ctx));
  app.use('/api/ai', auth, aiLimiter, aiRoutes(ctx));
  app.use('/api', (req, res) => res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Unknown API route.' } }));

  const index = path.join(config.clientDist, 'index.html');
  if (fs.existsSync(index)) {
    app.use(express.static(config.clientDist));
    app.use((req, res, next) => (req.method === 'GET' ? res.sendFile(index) : next()));
  }

  app.use(errorHandler(ctx));
  return app;
}
