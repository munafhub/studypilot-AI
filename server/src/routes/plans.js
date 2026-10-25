import express from 'express';

import { Fields, parseId } from '../utils/validate.js';
import { asyncHandler } from '../middleware.js';
import { resolveToday } from '../utils/dates.js';
import {
  generatePlan, revisePlan, approvePlan, rejectPlan, getPlan, getActivePlan, getDraftPlan, listPlans,
  updateSessionStatus, removeDraftSession, getProgress,
} from '../services/planService.js';
import { notFound } from '../errors.js';

export function planRoutes(ctx) {
  const { db, now } = ctx;
  const router = express.Router();
  const idOf = (v, what) => {
    const id = parseId(v);
    if (!id) throw notFound(what);
    return id;
  };
  const todayOf = (req) => resolveToday(req.body?.today ?? req.query?.today, now());

  router.get('/', (req, res) => res.json({ plans: listPlans(db, req.user.id) }));
  router.get('/active', (req, res) => res.json({ plan: getActivePlan(db, req.user.id) }));
  router.get('/draft', (req, res) => res.json({ plan: getDraftPlan(db, req.user.id) }));
  router.get('/progress', (req, res) => res.json(getProgress(db, req.user.id, todayOf(req))));

  router.post('/generate', asyncHandler(async (req, res) => {
    const f = new Fields(req.body);
    const scope = f.oneOf('scope', ['daily', 'weekly'], { label: 'Scope' });
    f.date('today', { optional: true, label: 'Today' });
    f.done();
    res.status(201).json({ plan: await generatePlan(ctx, req.user, { scope, today: todayOf(req) }) });
  }));

  router.post('/revise', asyncHandler(async (req, res) => {
    const f = new Fields(req.body ?? {});
    f.date('today', { optional: true, label: 'Today' });
    f.done();
    res.status(201).json({ plan: await revisePlan(ctx, req.user, { today: todayOf(req) }) });
  }));

  router.get('/:id', (req, res) => res.json({ plan: getPlan(db, req.user.id, idOf(req.params.id, 'Plan')) }));

  router.post('/:id/approve', (req, res) => {
    res.json({ plan: approvePlan(ctx, req.user.id, idOf(req.params.id, 'Plan')) });
  });

  router.post('/:id/reject', (req, res) => {
    rejectPlan(db, req.user.id, idOf(req.params.id, 'Plan'));
    res.status(204).end();
  });

  router.patch('/:id/sessions/:sid', (req, res) => {
    const f = new Fields(req.body);
    const status = f.oneOf('status', ['planned', 'done', 'missed'], { label: 'Status' });
    f.done();
    const session = updateSessionStatus(ctx, req.user.id, idOf(req.params.id, 'Plan'), idOf(req.params.sid, 'Session'), status);
    res.json({ session });
  });

  router.delete('/:id/sessions/:sid', (req, res) => {
    removeDraftSession(db, req.user.id, idOf(req.params.id, 'Plan'), idOf(req.params.sid, 'Session'));
    res.status(204).end();
  });

  return router;
}

