import express from 'express';
import { Fields } from '../utils/validate.js';
import { asyncHandler } from '../middleware.js';
import { explainTopic, createQuiz } from '../services/aiService.js';

const LEVELS = ['beginner', 'intermediate', 'advanced'];

export function aiRoutes(ctx) {
  const router = express.Router();

  router.get('/status', (req, res) => {
    res.json({ mode: ctx.llm.mode, model: ['anthropic', 'gemini'].includes(ctx.llm.mode) ? ctx.llm.model : null });
  });

  router.post('/explain', asyncHandler(async (req, res) => {
    const f = new Fields(req.body);
    const topic = f.str('topic', { min: 2, max: 200, label: 'Topic' });
    const level = f.oneOf('level', LEVELS, { optional: true, label: 'Level' }) ?? 'intermediate';
    f.done();
    res.json(await explainTopic(ctx, { topic, level }));
  }));

  router.post('/quiz', asyncHandler(async (req, res) => {
    const f = new Fields(req.body);
    const topic = f.str('topic', { min: 2, max: 200, label: 'Topic' });
    const count = f.int('count', { min: 1, max: 10, optional: true, label: 'Number of questions' }) ?? 5;
    const difficulty = f.oneOf('difficulty', LEVELS, { optional: true, label: 'Difficulty' }) ?? 'intermediate';
    f.done();
    res.json(await createQuiz(ctx, { topic, count, difficulty }));
  }));

  return router;
}
