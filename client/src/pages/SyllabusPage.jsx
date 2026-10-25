import { useRef, useState } from 'react';
import { api } from '../api.js';
import { Alert } from '../components/ui.jsx';

const KINDS = { exam: 'Exam', deadline: 'Deadline', event: 'Event', topic: 'Topic' };
const DEFAULT_MINUTES = { exam: 180, deadline: 120, event: 60, topic: 60 };

export default function SyllabusPage() {
  const [items, setItems] = useState(null);
  const [meta, setMeta] = useState(null);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  async function upload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    setSaved('');
    setItems(null);
    if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') {
      setError('Please choose a PDF file.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('That PDF is larger than 5 MB.');
      return;
    }
    setBusy(true);
    try {
      const res = await api.uploadPdf('/api/syllabus/extract', file);
      setMeta({ name: file.name, pages: res.pages, usedAI: res.usedAI, truncated: res.truncated });
      setItems(
        res.items.map((it, i) => ({
          key: i,
          include: true,
          title: it.title,
          dueDate: it.dueDate ?? '',
          kind: it.kind,
          ambiguous: it.ambiguous,
          estimatedMinutes: DEFAULT_MINUTES[it.kind] ?? 60,
          priority: it.kind === 'exam' ? 3 : 2,
        })),
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  const update = (key, patch) => setItems((list) => list.map((x) => (x.key === key ? { ...x, ...patch } : x)));

  async function confirm() {
    const chosen = items.filter((x) => x.include);
    if (chosen.length === 0) return setError('Select at least one item to save.');
    setBusy(true);
    setError('');
    try {
      const res = await api.post('/api/syllabus/confirm', {
        items: chosen.map((x) => ({
          title: x.title,
          dueDate: x.dueDate || null,
          estimatedMinutes: Number(x.estimatedMinutes),
          priority: Number(x.priority),
        })),
      });
      setSaved(`Saved ${res.tasks.length} task${res.tasks.length === 1 ? '' : 's'}. You can now build a plan in the Planner.`);
      setItems(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h1>Import a syllabus</h1>
      <p className="muted">Upload a text-based PDF. Review the extracted topics and dates, fix anything wrong, then save. Nothing is saved until you confirm.</p>
      <Alert onClose={() => setError('')}>{error}</Alert>
      <Alert kind="success" onClose={() => setSaved('')}>{saved}</Alert>

      <div className="card">
        <label className="btn btn-primary file-btn">
          {busy && !items ? 'Reading PDF…' : 'Choose syllabus PDF'}
          <input ref={fileRef} type="file" accept="application/pdf,.pdf" onChange={upload} disabled={busy} hidden />
        </label>
      </div>

      {items && (
        <section className="card">
          <h2>Review extracted items</h2>
          <p className="muted">
            {meta.name} · {meta.pages} page{meta.pages === 1 ? '' : 's'} · {items.length} items found {meta.usedAI ? '(AI-assisted)' : '(built-in parser)'}
            {meta.truncated && ' · only the first pages were read'}
          </p>
          {items.some((x) => x.ambiguous) && <Alert kind="warn">Some dates like 03/04/2026 could be day/month or month/day. Please double-check the ones marked ⚠.</Alert>}
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Save</th><th>Title</th><th>Type</th><th>Due date</th><th>Minutes</th><th>Priority</th></tr>
              </thead>
              <tbody>
                {items.map((x) => (
                  <tr key={x.key} className={x.include ? '' : 'dim'}>
                    <td><input type="checkbox" aria-label={`Include ${x.title}`} checked={x.include} onChange={(e) => update(x.key, { include: e.target.checked })} /></td>
                    <td><input aria-label="Title" value={x.title} onChange={(e) => update(x.key, { title: e.target.value })} /></td>
                    <td>{KINDS[x.kind]}</td>
                    <td>
                      <input aria-label="Due date" type="date" value={x.dueDate} onChange={(e) => update(x.key, { dueDate: e.target.value, ambiguous: false })} />
                      {x.ambiguous && <span title="Ambiguous date format"> ⚠</span>}
                    </td>
                    <td><input aria-label="Minutes" type="number" min="5" max="1440" step="5" value={x.estimatedMinutes} onChange={(e) => update(x.key, { estimatedMinutes: e.target.value })} /></td>
                    <td>
                      <select aria-label="Priority" value={x.priority} onChange={(e) => update(x.key, { priority: e.target.value })}>
                        <option value={1}>Low</option><option value={2}>Medium</option><option value={3}>High</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="row">
            <button className="btn btn-primary" onClick={confirm} disabled={busy}>
              {busy ? 'Saving…' : `Save ${items.filter((x) => x.include).length} selected as tasks`}
            </button>
            <button className="btn btn-ghost" onClick={() => setItems(null)}>Discard</button>
          </div>
        </section>
      )}
    </>
  );
}
