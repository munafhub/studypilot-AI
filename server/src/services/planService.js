import { HttpError, notFound } from '../errors.js';
import { addDays } from '../utils/dates.js';
import { sha1 } from '../security.js';
import { buildSchedule, coverageWarnings, defaultSummary } from './scheduler.js';
import { runPlanningAgent } from './agent.js';
import { toPlanSummary, toSession } from './mappers.js';

const SESSION_SELECT = `SELECT s.*, t.title AS task_title, t.subject AS subject
  FROM plan_sessions s JOIN tasks t ON t.id = s.task_id`;

/** Unfinished tasks with how many minutes are still to study. */
export function loadPlanningTasks(db, userId) {
  return db
    .all(`SELECT * FROM tasks WHERE user_id = ? AND status = 'pending'`, userId)
    .map((t) => ({
      id: t.id,
      title: t.title,
      subject: t.subject,
      dueDate: t.due_date,
      priority: t.priority,
      remaining: Math.max(0, t.estimated_minutes - t.minutes_done),
    }))
    .filter((t) => t.remaining > 0);
}

/** Ask the AI agent (if available) for sessions; fall back to the deterministic scheduler. */
async function proposeSessions(ctx, { tasks, availability, startDate, endDate, used, request }) {
  const { llm, logger } = ctx;
  const base = { tasks, availability, startDate, endDate, used };
  let sessions;
  let summary = '';
  let source = 'scheduler';
  const notes = [];

  if (['anthropic', 'gemini'].includes(llm.mode)) {
    try {
      const ai = await runPlanningAgent({ llm, logger, ...base, request });
      if (ai) {
        sessions = ai.sessions;
        summary = ai.summary;
        source = 'ai';
      } else notes.push('The AI suggestion could not be validated, so the built-in scheduler was used instead.');
    } catch (err) {
      logger.warn?.(`Planning agent failed: ${err.code ?? err.message}`);
      notes.push('The AI service was unavailable, so the built-in scheduler was used instead.');
    }
  }
  if (!sessions) sessions = buildSchedule(base).sessions;

  const warnings = [
    ...notes,
    ...coverageWarnings({ tasks, sessions, startDate, endDate }),
  ];
  return { sessions, summary: summary || defaultSummary(sessions, tasks.length), source, warnings };
}

function saveDraft(db, { userId, scope, startDate, endDate, source, summary, warnings, replacesPlanId = null, baseStamp = null, sessions, now }) {
  return db.tx(() => {
    db.run(`DELETE FROM plans WHERE user_id = ? AND status = 'draft'`, userId);
    const { lastInsertRowid: planId } = db.run(
      `INSERT INTO plans (user_id, scope, start_date, end_date, status, source, summary, warnings, replaces_plan_id, base_stamp, created_at)
       VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?)`,
      userId, scope, startDate, endDate, source, summary, JSON.stringify(warnings), replacesPlanId, baseStamp, now.toISOString(),
    );
    for (const s of sessions) {
      db.run(
        `INSERT INTO plan_sessions (plan_id, user_id, task_id, date, minutes, note, status, carried_from)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        planId, userId, s.taskId, s.date, s.minutes, s.note ?? '', s.status ?? 'planned', s.carriedFrom ?? null,
      );
    }
    return planId;
  });
}

export async function generatePlan(ctx, user, { scope, today }) {
  const { db, now } = ctx;
  const startDate = today;
  const endDate = scope === 'daily' ? today : addDays(today, 6);
  const tasks = loadPlanningTasks(db, user.id);
  if (tasks.length === 0) {
    throw new HttpError(409, 'NO_TASKS', 'You have no unfinished tasks with time left to study. Add a task first.');
  }
  const request = `Create a ${scope} study plan for ${startDate} to ${endDate}. Today is ${today}.`;
  const proposal = await proposeSessions(ctx, { tasks, availability: user.availability, startDate, endDate, used: {}, request });
  if (proposal.sessions.length === 0) {
    throw new HttpError(409, 'NO_CAPACITY', 'Nothing could be scheduled. Check your available study time in Settings.');
  }
  const planId = saveDraft(db, { userId: user.id, scope, startDate, endDate, ...proposal, now: now() });
  return getPlan(db, user.id, planId);
}

const stampOf = (db, planId) =>
  sha1(
    db.all('SELECT id, status, date FROM plan_sessions WHERE plan_id = ? ORDER BY id', planId)
      .map((s) => `${s.id}:${s.status}:${s.date}`)
      .join('|'),
  );

/** Missed sessions = marked missed, or still 'planned' but dated before today. */
export function isMissed(session, today) {
  return session.status === 'missed' || (session.status === 'planned' && session.date < today);
}

export async function revisePlan(ctx, user, { today }) {
  const { db, now } = ctx;
  const old = db.get(`SELECT * FROM plans WHERE user_id = ? AND status = 'active'`, user.id);
  if (!old) throw new HttpError(409, 'NO_ACTIVE_PLAN', 'There is no approved plan to revise yet.');
  const oldSessions = db.all('SELECT * FROM plan_sessions WHERE plan_id = ? ORDER BY date, id', old.id);
  if (!oldSessions.some((s) => isMissed(s, today))) {
    throw new HttpError(409, 'NOTHING_TO_REVISE', 'No missed sessions, so your plan does not need revising.');
  }

  const startDate = today;
  const endDate = old.end_date >= today ? old.end_date : old.scope === 'daily' ? today : addDays(today, 6);

  // Keep history: done sessions and missed sessions are carried into the new draft.
  const carried = [];
  const used = {};
  for (const s of oldSessions) {
    if (s.status === 'done' || isMissed(s, today)) {
      const status = s.status === 'done' ? 'done' : 'missed';
      carried.push({ taskId: s.task_id, date: s.date, minutes: s.minutes, note: s.note, status, carriedFrom: s.id });
      if (status === 'done') used[s.date] = (used[s.date] ?? 0) + s.minutes;
    }
  }

  const tasks = loadPlanningTasks(db, user.id);
  let fresh = { sessions: [], source: 'scheduler', warnings: [], summary: '' };
  if (tasks.length > 0) {
    const request = `The student missed some sessions. Re-plan the remaining work from ${startDate} to ${endDate}. Today is ${today}. Minutes already studied today are already subtracted from availability.`;
    fresh = await proposeSessions(ctx, { tasks, availability: user.availability, startDate, endDate, used, request });
  }
  if (fresh.sessions.length === 0) {
    throw new HttpError(409, 'NO_CAPACITY', 'Nothing could be rescheduled. Check your available study time in Settings.');
  }
  const missedCount = carried.filter((c) => c.status === 'missed').length;
  const summary = `Reschedules ${missedCount} missed session${missedCount === 1 ? '' : 's'}. ${fresh.summary}`.slice(0, 400);
  const planId = saveDraft(db, {
    userId: user.id, scope: old.scope, startDate: old.start_date < startDate ? old.start_date : startDate, endDate,
    source: fresh.source, summary, warnings: fresh.warnings, replacesPlanId: old.id, baseStamp: stampOf(db, old.id),
    sessions: [...carried, ...fresh.sessions], now: now(),
  });
  return getPlan(db, user.id, planId);
}

export function approvePlan(ctx, userId, planId) {
  const { db, now } = ctx;
  const plan = db.get('SELECT * FROM plans WHERE id = ? AND user_id = ?', planId, userId);
  if (!plan) throw notFound('Plan');
  if (plan.status !== 'draft') throw new HttpError(409, 'NOT_A_DRAFT', 'Only a draft plan can be approved.');
  if (plan.replaces_plan_id) {
    const old = db.get(`SELECT id, status FROM plans WHERE id = ? AND user_id = ?`, plan.replaces_plan_id, userId);
    if (!old || old.status !== 'active' || stampOf(db, old.id) !== plan.base_stamp) {
      throw new HttpError(409, 'PLAN_CHANGED', 'Your plan changed after this revision was drafted. Please request a new revision.');
    }
  }
  const taskIds = db.all('SELECT DISTINCT task_id FROM plan_sessions WHERE plan_id = ?', planId);
  for (const { task_id: id } of taskIds) {
    const t = db.get('SELECT id FROM tasks WHERE id = ? AND user_id = ?', id, userId);
    if (!t) throw new HttpError(409, 'TASK_MISSING', 'A task in this plan was deleted. Please generate a new plan.');
  }
  db.tx(() => {
    db.run(`UPDATE plans SET status = 'superseded' WHERE user_id = ? AND status = 'active'`, userId);
    db.run(`UPDATE plans SET status = 'active', approved_at = ? WHERE id = ?`, now().toISOString(), planId);
  });
  return getPlan(db, userId, planId);
}

export function rejectPlan(db, userId, planId) {
  const plan = db.get('SELECT status FROM plans WHERE id = ? AND user_id = ?', planId, userId);
  if (!plan) throw notFound('Plan');
  if (plan.status !== 'draft') throw new HttpError(409, 'NOT_A_DRAFT', 'Only a draft plan can be rejected.');
  db.run('DELETE FROM plans WHERE id = ? AND user_id = ?', planId, userId);
}

export function getPlan(db, userId, planId) {
  const row = db.get('SELECT * FROM plans WHERE id = ? AND user_id = ?', planId, userId);
  if (!row) throw notFound('Plan');
  const sessions = db
    .all(`${SESSION_SELECT} WHERE s.plan_id = ? AND s.user_id = ? ORDER BY s.date, s.id`, planId, userId)
    .map(toSession);
  const plan = { ...toPlanSummary(row), sessions };
  if (row.status === 'draft' && row.replaces_plan_id) {
    const carriedIds = new Set(sessions.filter((s) => s.carriedFrom).map((s) => s.carriedFrom));
    const removed = db
      .all(`${SESSION_SELECT} WHERE s.plan_id = ? AND s.user_id = ? AND s.status = 'planned' ORDER BY s.date, s.id`, row.replaces_plan_id, userId)
      .filter((s) => !carriedIds.has(s.id))
      .map(toSession);
    plan.changes = {
      missed: sessions.filter((s) => s.status === 'missed'),
      removed,
      added: sessions.filter((s) => !s.carriedFrom),
    };
  }
  return plan;
}

export const getActivePlan = (db, userId) => {
  const row = db.get(`SELECT id FROM plans WHERE user_id = ? AND status = 'active'`, userId);
  return row ? getPlan(db, userId, row.id) : null;
};

export const getDraftPlan = (db, userId) => {
  const row = db.get(`SELECT id FROM plans WHERE user_id = ? AND status = 'draft' ORDER BY id DESC`, userId);
  return row ? getPlan(db, userId, row.id) : null;
};

export const listPlans = (db, userId) =>
  db.all('SELECT * FROM plans WHERE user_id = ? ORDER BY id DESC LIMIT 30', userId).map(toPlanSummary);

export function updateSessionStatus(ctx, userId, planId, sessionId, status) {
  const { db } = ctx;
  const plan = db.get('SELECT status FROM plans WHERE id = ? AND user_id = ?', planId, userId);
  const session = db.get('SELECT * FROM plan_sessions WHERE id = ? AND plan_id = ? AND user_id = ?', sessionId, planId, userId);
  if (!plan || !session) throw notFound('Session');
  if (plan.status !== 'active') throw new HttpError(409, 'PLAN_NOT_ACTIVE', 'Only sessions in your approved plan can be updated.');
  db.tx(() => {
    db.run('UPDATE plan_sessions SET status = ? WHERE id = ?', status, sessionId);
    if (session.status !== 'done' && status === 'done') {
      db.run('UPDATE tasks SET minutes_done = minutes_done + ? WHERE id = ? AND user_id = ?', session.minutes, session.task_id, userId);
    } else if (session.status === 'done' && status !== 'done') {
      db.run('UPDATE tasks SET minutes_done = MAX(0, minutes_done - ?) WHERE id = ? AND user_id = ?', session.minutes, session.task_id, userId);
    }
  });
  return toSession(db.get(`${SESSION_SELECT} WHERE s.id = ?`, sessionId));
}

export function removeDraftSession(db, userId, planId, sessionId) {
  const plan = db.get('SELECT status FROM plans WHERE id = ? AND user_id = ?', planId, userId);
  const session = db.get('SELECT id, status FROM plan_sessions WHERE id = ? AND plan_id = ? AND user_id = ?', sessionId, planId, userId);
  if (!plan || !session) throw notFound('Session');
  if (plan.status !== 'draft') throw new HttpError(409, 'NOT_A_DRAFT', 'Only draft plans can be edited before approval.');
  if (session.status !== 'planned') throw new HttpError(409, 'CANNOT_REMOVE', 'Past sessions cannot be removed from a revision.');
  db.run('DELETE FROM plan_sessions WHERE id = ?', sessionId);
}

export function getProgress(db, userId, today) {
  const t = db.get(
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) AS done,
            SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending,
            SUM(CASE WHEN status = 'pending' AND due_date IS NOT NULL AND due_date < ? THEN 1 ELSE 0 END) AS overdue
       FROM tasks WHERE user_id = ?`,
    today, userId,
  );
  const plan = getActivePlan(db, userId);
  let planStats = null;
  if (plan) {
    const s = plan.sessions;
    const minutes = (list) => list.reduce((n, x) => n + x.minutes, 0);
    const missed = s.filter((x) => isMissed(x, today));
    planStats = {
      id: plan.id,
      scope: plan.scope,
      startDate: plan.startDate,
      endDate: plan.endDate,
      sessionsTotal: s.length,
      sessionsDone: s.filter((x) => x.status === 'done').length,
      minutesPlanned: minutes(s),
      minutesDone: minutes(s.filter((x) => x.status === 'done')),
      missed: missed.length,
      needsRevision: missed.length > 0,
      today: s.filter((x) => x.date === today),
    };
  }
  return {
    tasks: { total: t.total, done: t.done ?? 0, pending: t.pending ?? 0, overdue: t.overdue ?? 0 },
    plan: planStats,
    today,
  };
}

