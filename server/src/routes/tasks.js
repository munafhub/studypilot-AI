import express from 'express';
import { notFound, ValidationError } from '../errors.js';
import { Fields, parseId } from '../utils/validate.js';
import { toTask } from '../services/mappers.js';

export const TASK_LIMIT = 500;

/** Parse create/update input. For updates only supplied fields are returned. */
export function parseTaskInput(body, { partial }) {
  const f = new Fields(body);
  const out = {};
  const title = f.str('title', { min: 1, max: 200, optional: partial, label: 'Title' });
  const subject = f.str('subject', { max: 80, optional: true, label: 'Subject' });
  const notes = f.str('notes', { max: 2000, optional: true, label: 'Notes' });
  const dueDate = f.date('dueDate', { optional: true, nullable: true, label: 'Due date' });
  const estimatedMinutes = f.int('estimatedMinutes', { min: 5, max: 1440, optional: true, label: 'Estimated minutes' });
  const priority = f.int('priority', { min: 1, max: 3, optional: true, label: 'Priority' });
  const status = f.oneOf('status', ['pending', 'done'], { optional: true, label: 'Status' });
  f.done();
  if (title !== undefined) out.title = title;
  if (subject !== undefined) out.subject = subject;
  if (notes !== undefined) out.notes = notes;
  if (dueDate !== undefined) out.dueDate = dueDate;
  if (estimatedMinutes !== undefined) out.estimatedMinutes = estimatedMinutes;
  if (priority !== undefined) out.priority = priority;
  if (status !== undefined) out.status = status;
  return out;
}

export function insertTask(db, userId, input, now, source = 'manual') {
  const ts = now.toISOString();
  const { lastInsertRowid } = db.run(
    `INSERT INTO tasks (user_id, title, subject, notes, due_date, estimated_minutes, priority, status, completed_at, source, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    userId, input.title, input.subject ?? '', input.notes ?? '', input.dueDate ?? null,
    input.estimatedMinutes ?? 60, input.priority ?? 2, input.status ?? 'pending',
    input.status === 'done' ? ts : null, source, ts, ts,
  );
  return lastInsertRowid;
}

export function taskRoutes({ db, now }) {
  const router = express.Router();

  const load = (req) => {
    const id = parseId(req.params.id);
    const row = id && db.get('SELECT * FROM tasks WHERE id = ? AND user_id = ?', id, req.user.id);
    if (!row) throw notFound('Task');
    return row;
  };

  router.get('/', (req, res) => {
    const status = req.query.status;
    if (status !== undefined && !['pending', 'done', 'all'].includes(status)) {
      throw new ValidationError({ status: 'status must be pending, done or all.' });
    }
    const where = status && status !== 'all' ? ' AND status = ?' : '';
    const params = status && status !== 'all' ? [req.user.id, status] : [req.user.id];
    const rows = db.all(
      `SELECT * FROM tasks WHERE user_id = ?${where}
       ORDER BY status = 'done', due_date IS NULL, due_date ASC, priority DESC, id ASC LIMIT ${TASK_LIMIT}`,
      ...params,
    );
    res.json({ tasks: rows.map(toTask) });
  });

  router.post('/', (req, res) => {
    const input = parseTaskInput(req.body, { partial: false });
    const count = db.get('SELECT COUNT(*) AS n FROM tasks WHERE user_id = ?', req.user.id).n;
    if (count >= TASK_LIMIT) throw new ValidationError({ _body: `You can store at most ${TASK_LIMIT} tasks.` });
    const id = insertTask(db, req.user.id, input, now());
    res.status(201).json({ task: toTask(db.get('SELECT * FROM tasks WHERE id = ?', id)) });
  });

  router.get('/:id', (req, res) => {
    res.json({ task: toTask(load(req)) });
  });

  const update = (req, res) => {
    const row = load(req);
    const input = parseTaskInput(req.body, { partial: true });
    const ts = now().toISOString();
    const next = {
      title: input.title ?? row.title,
      subject: input.subject ?? row.subject,
      notes: input.notes ?? row.notes,
      due_date: input.dueDate !== undefined ? input.dueDate : row.due_date,
      estimated_minutes: input.estimatedMinutes ?? row.estimated_minutes,
      priority: input.priority ?? row.priority,
      status: input.status ?? row.status,
    };
    let completedAt = row.completed_at;
    if (next.status === 'done' && row.status !== 'done') completedAt = ts;
    if (next.status === 'pending') completedAt = null;
    db.run(
      `UPDATE tasks SET title = ?, subject = ?, notes = ?, due_date = ?, estimated_minutes = ?, priority = ?,
         status = ?, completed_at = ?, updated_at = ? WHERE id = ? AND user_id = ?`,
      next.title, next.subject, next.notes, next.due_date, next.estimated_minutes, next.priority,
      next.status, completedAt, ts, row.id, req.user.id,
    );
    res.json({ task: toTask(db.get('SELECT * FROM tasks WHERE id = ?', row.id)) });
  };
  router.put('/:id', update);
  router.patch('/:id', update);

  router.delete('/:id', (req, res) => {
    const row = load(req);
    db.run('DELETE FROM tasks WHERE id = ? AND user_id = ?', row.id, req.user.id);
    res.status(204).end();
  });

  return router;
}
