// Server-side validation of everything the model returns. Model output is never trusted.
import { isValidDate, eachDay } from '../utils/dates.js';
import { capacityFor } from './scheduler.js';

const clean = (s, max) => String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

/**
 * Validate a plan proposed by the model.
 * ctx: { tasks:[{id,dueDate,remaining}], availability, startDate, endDate, used }
 * Returns { ok, errors[], sessions[], summary }.
 */
export function validatePlanProposal(input, ctx) {
  const errors = [];
  const sessions = [];
  if (!input || !Array.isArray(input.sessions)) {
    return { ok: false, errors: ['"sessions" must be an array.'], sessions, summary: '' };
  }
  if (input.sessions.length === 0) errors.push('The plan has no sessions.');
  if (input.sessions.length > 120) errors.push('The plan has too many sessions (max 120).');

  const tasks = new Map(ctx.tasks.map((t) => [t.id, t]));
  const perTask = new Map();
  const perDay = new Map();
  const validDays = new Set(eachDay(ctx.startDate, ctx.endDate));

  input.sessions.slice(0, 120).forEach((s, i) => {
    const where = `Session ${i + 1}`;
    const task = tasks.get(s?.taskId);
    if (!task) return errors.push(`${where}: taskId ${s?.taskId} is not one of the student's unfinished tasks.`);
    if (!isValidDate(s.date) || !validDays.has(s.date)) {
      return errors.push(`${where}: date ${s.date} is outside ${ctx.startDate}..${ctx.endDate}.`);
    }
    if (!Number.isInteger(s.minutes) || s.minutes < 5 || s.minutes > 240) {
      return errors.push(`${where}: minutes must be a whole number from 5 to 240.`);
    }
    if (task.dueDate && task.dueDate >= ctx.startDate && s.date > task.dueDate) {
      return errors.push(`${where}: "${task.title}" is due ${task.dueDate}; it cannot be scheduled on ${s.date}.`);
    }
    perTask.set(task.id, (perTask.get(task.id) ?? 0) + s.minutes);
    perDay.set(s.date, (perDay.get(s.date) ?? 0) + s.minutes);
    sessions.push({ taskId: task.id, date: s.date, minutes: s.minutes, note: clean(s.note, 200) });
  });

  for (const [id, total] of perTask) {
    const task = tasks.get(id);
    if (total > task.remaining) errors.push(`Task ${id} is scheduled for ${total} min but only ${task.remaining} min remain.`);
  }
  for (const [date, total] of perDay) {
    const cap = capacityFor(date, ctx.availability, ctx.used);
    if (total > cap) errors.push(`${date}: ${total} min scheduled but only ${cap} min are available.`);
  }
  sessions.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.taskId - b.taskId));
  return { ok: errors.length === 0, errors, sessions, summary: clean(input.summary, 300) };
}

export function validateExplanation(input) {
  const explanation = clean(input?.explanation, 6000);
  const keyPoints = Array.isArray(input?.keyPoints)
    ? input.keyPoints.map((k) => clean(k, 200)).filter(Boolean).slice(0, 8)
    : [];
  if (explanation.length < 20) return { ok: false, errors: ['explanation is missing or too short'] };
  return { ok: true, value: { explanation: String(input.explanation).trim().slice(0, 6000), keyPoints } };
}

export function validateQuiz(input, count) {
  const errors = [];
  if (!input || !Array.isArray(input.questions) || input.questions.length === 0) {
    return { ok: false, errors: ['questions must be a non-empty array'] };
  }
  const questions = [];
  input.questions.slice(0, count).forEach((q, i) => {
    const text = clean(q?.question, 400);
    const options = Array.isArray(q?.options) ? q.options.map((o) => clean(o, 200)) : [];
    const distinct = new Set(options.map((o) => o.toLowerCase()));
    if (!text) errors.push(`Question ${i + 1}: missing question text`);
    else if (options.length !== 4 || options.some((o) => !o) || distinct.size !== 4) errors.push(`Question ${i + 1}: needs exactly 4 distinct options`);
    else if (!Number.isInteger(q.answerIndex) || q.answerIndex < 0 || q.answerIndex > 3) errors.push(`Question ${i + 1}: answerIndex must be 0-3`);
    else questions.push({ question: text, options, answerIndex: q.answerIndex, explanation: clean(q.explanation, 400) });
  });
  if (errors.length || questions.length === 0) return { ok: false, errors };
  return { ok: true, value: { questions } };
}

const KINDS = ['exam', 'deadline', 'event', 'topic'];
export function validateSyllabusItems(input) {
  if (!input || !Array.isArray(input.items)) return { ok: false, errors: ['items must be an array'] };
  const items = [];
  const seen = new Set();
  for (const it of input.items.slice(0, 100)) {
    const title = clean(it?.title, 200);
    if (title.length < 2) continue;
    const dueDate = it.dueDate && isValidDate(it.dueDate) ? it.dueDate : null;
    const kind = KINDS.includes(it.kind) ? it.kind : dueDate ? 'deadline' : 'topic';
    const key = `${title.toLowerCase()}|${dueDate ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({ title, dueDate, kind, ambiguous: false });
  }
  if (items.length === 0) return { ok: false, errors: ['no valid items'] };
  return { ok: true, value: items };
}
