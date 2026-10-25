export const toTask = (r) => ({
  id: r.id,
  title: r.title,
  subject: r.subject,
  notes: r.notes,
  dueDate: r.due_date,
  estimatedMinutes: r.estimated_minutes,
  minutesDone: r.minutes_done,
  priority: r.priority,
  status: r.status,
  completedAt: r.completed_at,
  source: r.source,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

export const toUser = (r) => ({
  id: r.id,
  name: r.name,
  email: r.email,
  availability: typeof r.availability === 'string' ? JSON.parse(r.availability) : r.availability,
});

export const toSession = (r) => ({
  id: r.id,
  planId: r.plan_id,
  taskId: r.task_id,
  taskTitle: r.task_title,
  subject: r.subject ?? '',
  date: r.date,
  minutes: r.minutes,
  note: r.note,
  status: r.status,
  carriedFrom: r.carried_from,
});

export const toPlanSummary = (r) => ({
  id: r.id,
  scope: r.scope,
  startDate: r.start_date,
  endDate: r.end_date,
  status: r.status,
  source: r.source,
  summary: r.summary,
  warnings: JSON.parse(r.warnings || '[]'),
  replacesPlanId: r.replaces_plan_id,
  createdAt: r.created_at,
  approvedAt: r.approved_at,
});
