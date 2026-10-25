import { useState } from 'react';
import { api, localToday } from '../api.js';
import { Alert, Field, Spinner, useLoad, formatDate, formatMinutes } from '../components/ui.jsx';

const EMPTY = { title: '', subject: '', dueDate: '', estimatedMinutes: 60, priority: 2, notes: '' };
const PRIORITY = { 1: 'Low', 2: 'Medium', 3: 'High' };

function TaskForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState({ ...EMPTY, ...initial, dueDate: initial?.dueDate ?? '' });
  const [error, setError] = useState('');
  const [fields, setFields] = useState({});
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setFields({});
    const body = {
      title: form.title,
      subject: form.subject,
      notes: form.notes,
      dueDate: form.dueDate || null,
      estimatedMinutes: Number(form.estimatedMinutes),
      priority: Number(form.priority),
    };
    try {
      await onSave(body);
    } catch (err) {
      setError(err.message);
      setFields(err.fields || {});
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card form-grid" onSubmit={submit} noValidate>
      <Alert>{error}</Alert>
      <Field label="Title" error={fields.title}><input value={form.title} onChange={set('title')} required /></Field>
      <Field label="Subject" error={fields.subject}><input value={form.subject} onChange={set('subject')} placeholder="e.g. Biology" /></Field>
      <Field label="Due date" error={fields.dueDate}><input type="date" value={form.dueDate} onChange={set('dueDate')} /></Field>
      <Field label="Estimated minutes" error={fields.estimatedMinutes}>
        <input type="number" min="5" max="1440" step="5" value={form.estimatedMinutes} onChange={set('estimatedMinutes')} />
      </Field>
      <Field label="Priority" error={fields.priority}>
        <select value={form.priority} onChange={set('priority')}>
          <option value={1}>Low</option><option value={2}>Medium</option><option value={3}>High</option>
        </select>
      </Field>
      <Field label="Notes" error={fields.notes}><input value={form.notes} onChange={set('notes')} /></Field>
      <div className="row">
        <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save task'}</button>
        {onCancel && <button type="button" className="btn btn-ghost" onClick={onCancel}>Cancel</button>}
      </div>
    </form>
  );
}

export default function TasksPage() {
  const [filter, setFilter] = useState('pending');
  const [editing, setEditing] = useState(null); // task | 'new' | null
  const [error, setError] = useState('');
  const { data, loading, error: loadError, reload } = useLoad(() => api.get(`/api/tasks?status=${filter}`), [filter]);
  const today = localToday();

  const run = async (fn) => {
    setError('');
    try {
      await fn();
      reload();
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <>
      <div className="row between">
        <h1>Study tasks</h1>
        {!editing && <button className="btn btn-primary" onClick={() => setEditing('new')}>+ Add task</button>}
      </div>
      <Alert onClose={() => setError('')}>{error || loadError}</Alert>

      {editing && (
        <TaskForm
          initial={editing === 'new' ? null : editing}
          onCancel={() => setEditing(null)}
          onSave={async (body) => {
            if (editing === 'new') await api.post('/api/tasks', body);
            else await api.put(`/api/tasks/${editing.id}`, body);
            setEditing(null);
            reload();
          }}
        />
      )}

      <div className="tabs" role="tablist">
        {['pending', 'done', 'all'].map((f) => (
          <button key={f} role="tab" aria-selected={filter === f} className={filter === f ? 'active' : ''} onClick={() => setFilter(f)}>
            {f === 'pending' ? 'To do' : f === 'done' ? 'Completed' : 'All'}
          </button>
        ))}
      </div>

      {loading && <Spinner />}
      {!loading && data?.tasks.length === 0 && <p className="muted">No tasks here yet.</p>}
      <ul className="list">
        {data?.tasks.map((t) => (
          <li key={t.id} className={`card task ${t.status}`}>
            <input
              type="checkbox"
              aria-label={`Mark "${t.title}" ${t.status === 'done' ? 'not done' : 'done'}`}
              checked={t.status === 'done'}
              onChange={() => run(() => api.patch(`/api/tasks/${t.id}`, { status: t.status === 'done' ? 'pending' : 'done' }))}
            />
            <div className="grow">
              <b>{t.title}</b>
              <div className="meta">
                {t.subject && <span className="chip">{t.subject}</span>}
                <span className={t.status === 'pending' && t.dueDate && t.dueDate < today ? 'chip danger-chip' : 'chip'}>{formatDate(t.dueDate)}</span>
                <span className="chip">{formatMinutes(t.estimatedMinutes)} · {formatMinutes(t.minutesDone)} done</span>
                <span className={`chip p${t.priority}`}>{PRIORITY[t.priority]}</span>
                {t.source === 'syllabus' && <span className="chip">from syllabus</span>}
              </div>
              {t.notes && <small className="muted">{t.notes}</small>}
            </div>
            <div className="row">
              <button className="btn btn-ghost" onClick={() => setEditing(t)}>Edit</button>
              <button
                className="btn btn-ghost danger"
                onClick={() => window.confirm(`Delete "${t.title}"?`) && run(() => api.del(`/api/tasks/${t.id}`))}
              >
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
