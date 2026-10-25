import { eachDay, weekdayKey } from '../utils/dates.js';

export const DEFAULT_AVAILABILITY = { mon: 120, tue: 120, wed: 120, thu: 120, fri: 120, sat: 120, sun: 120 };

export function capacityFor(date, availability, used = {}) {
  return Math.max(0, (availability[weekdayKey(date)] ?? 0) - (used[date] ?? 0));
}

const byUrgency = (a, b) => {
  const da = a.dueDate ?? '9999-12-31';
  const db = b.dueDate ?? '9999-12-31';
  if (da !== db) return da < db ? -1 : 1;
  if (a.priority !== b.priority) return b.priority - a.priority;
  return a.id - b.id;
};

/**
 * Deterministic earliest-deadline-first scheduler.
 * tasks: [{id,title,dueDate,priority,remaining}]  (remaining = minutes still to study)
 * used:  { 'YYYY-MM-DD': minutes already committed that day }
 */
export function buildSchedule({ tasks, availability, startDate, endDate, used = {}, maxPerTaskPerDay = 90, minChunk = 10 }) {
  const order = tasks.filter((t) => t.remaining > 0).sort(byUrgency);
  const remaining = new Map(order.map((t) => [t.id, t.remaining]));
  const sessions = [];

  for (const date of eachDay(startDate, endDate)) {
    let cap = capacityFor(date, availability, used);
    for (const task of order) {
      if (cap <= 0) break;
      const rem = remaining.get(task.id);
      if (rem <= 0) continue;
      const eligible = !task.dueDate || task.dueDate >= date || task.dueDate < startDate;
      if (!eligible) continue;
      const give = Math.min(rem, maxPerTaskPerDay, cap);
      if (give < Math.min(minChunk, rem)) continue;
      sessions.push({
        taskId: task.id,
        date,
        minutes: give,
        note: task.dueDate ? `Due ${task.dueDate}` : '',
      });
      remaining.set(task.id, rem - give);
      cap -= give;
    }
  }
  return { sessions };
}

/** Human-readable warnings about work that does not fit before its deadline. */
export function coverageWarnings({ tasks, sessions, startDate, endDate }) {
  const scheduled = new Map();
  for (const s of sessions) scheduled.set(s.taskId, (scheduled.get(s.taskId) ?? 0) + s.minutes);
  const warnings = [];
  for (const t of tasks) {
    if (t.remaining <= 0) continue;
    const left = t.remaining - (scheduled.get(t.taskId ?? t.id) ?? 0);
    if (left <= 0) continue;
    if (t.dueDate && t.dueDate < startDate) {
      warnings.push(`"${t.title}" is overdue and ${left} min of it could not be scheduled in this period.`);
    } else if (t.dueDate && t.dueDate <= endDate) {
      warnings.push(`"${t.title}" needs ${left} more minutes than your available time before ${t.dueDate}.`);
    }
  }
  return warnings;
}

export function defaultSummary(sessions, taskCount) {
  const minutes = sessions.reduce((n, s) => n + s.minutes, 0);
  const hours = Math.round((minutes / 60) * 10) / 10;
  const distinct = new Set(sessions.map((s) => s.taskId)).size || taskCount;
  return `${sessions.length} study session${sessions.length === 1 ? '' : 's'} · ${hours} h across ${distinct} task${distinct === 1 ? '' : 's'}`;
}
