import { useState } from 'react';
import { api, localToday } from '../api.js';
import { Alert, ProgressBar, Spinner, useLoad, formatDate, formatMinutes, groupByDate } from '../components/ui.jsx';

function SessionList({ sessions, today, onToggle, onRemove, readOnly }) {
  if (sessions.length === 0) return <p className="muted">No sessions.</p>;
  return (
    <>
      {groupByDate(sessions).map(([date, list]) => (
        <div key={date} className="day">
          <h3>{formatDate(date)}{date === today && <span className="chip"> today</span>}</h3>
          {list.map((s) => {
            const missed = s.status === 'missed' || (s.status === 'planned' && s.date < today);
            return (
              <div key={s.id} className={`row session ${s.status} ${missed ? 'missed' : ''}`}>
                {!readOnly && (
                  <input
                    type="checkbox"
                    aria-label={`Mark ${s.taskTitle} done`}
                    checked={s.status === 'done'}
                    onChange={() => onToggle(s)}
                  />
                )}
                <span className="grow">
                  <b>{s.taskTitle}</b> <small className="muted">· {formatMinutes(s.minutes)}{s.note ? ` · ${s.note}` : ''}</small>
                </span>
                {missed && <span className="chip danger-chip">missed</span>}
                {s.status === 'done' && <span className="chip">done</span>}
                {onRemove && s.status === 'planned' && !s.carriedFrom && (
                  <button className="btn btn-ghost" onClick={() => onRemove(s)} aria-label={`Remove ${s.taskTitle} session`}>Remove</button>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </>
  );
}

function Changes({ changes }) {
  return (
    <div className="changes">
      <h3>What will change</h3>
      <div className="grid three">
        <div><b>Missed ({changes.missed.length})</b><p className="muted">Kept in your history, marked missed.</p>{changes.missed.map((s) => <div key={s.id}><small>{formatDate(s.date)} · {s.taskTitle}</small></div>)}</div>
        <div><b>Removed ({changes.removed.length})</b><p className="muted">Old future sessions replaced by the new schedule.</p>{changes.removed.map((s) => <div key={s.id}><small>{formatDate(s.date)} · {s.taskTitle}</small></div>)}</div>
        <div><b>Added ({changes.added.length})</b><p className="muted">New sessions that fit your time.</p>{changes.added.map((s) => <div key={s.id}><small>{formatDate(s.date)} · {s.taskTitle} · {formatMinutes(s.minutes)}</small></div>)}</div>
      </div>
    </div>
  );
}

export default function PlannerPage() {
  const today = localToday();
  const active = useLoad(() => api.get('/api/plans/active'), []);
  const draft = useLoad(() => api.get('/api/plans/draft'), []);
  const progress = useLoad(() => api.get(`/api/plans/progress?today=${today}`), []);
  const [scope, setScope] = useState('weekly');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const reloadAll = () => {
    active.reload();
    draft.reload();
    progress.reload();
  };
  const act = async (label, fn, okMsg) => {
    setBusy(label);
    setError('');
    setNotice('');
    try {
      await fn();
      if (okMsg) setNotice(okMsg);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy('');
      reloadAll();
    }
  };

  if (active.loading || draft.loading || progress.loading) return <Spinner />;
  const activePlan = active.data?.plan;
  const draftPlan = draft.data?.plan;
  const stats = progress.data?.plan;

  const toggle = (plan) => (s) =>
    act('toggle', () => api.patch(`/api/plans/${plan.id}/sessions/${s.id}`, { status: s.status === 'done' ? 'planned' : 'done' }));

  return (
    <>
      <h1>Study planner</h1>
      <Alert onClose={() => setError('')}>{error || active.error || draft.error}</Alert>
      <Alert kind="success" onClose={() => setNotice('')}>{notice}</Alert>

      {!draftPlan && (
        <section className="card">
          <h2>Create a plan</h2>
          <p className="muted">The AI proposes a schedule from your unfinished tasks and available study time (set in Settings). You review it before it is saved.</p>
          <div className="row">
            <select value={scope} onChange={(e) => setScope(e.target.value)} aria-label="Plan length">
              <option value="daily">Today only</option>
              <option value="weekly">Next 7 days</option>
            </select>
            <button className="btn btn-primary" disabled={!!busy} onClick={() => act('generate', () => api.post('/api/plans/generate', { scope, today }))}>
              {busy === 'generate' ? 'Planning…' : 'Generate plan'}
            </button>
            {activePlan && stats?.needsRevision && (
              <button className="btn btn-warn" disabled={!!busy} onClick={() => act('revise', () => api.post('/api/plans/revise', { today }))}>
                {busy === 'revise' ? 'Revising…' : `Revise for ${stats.missed} missed session${stats.missed === 1 ? '' : 's'}`}
              </button>
            )}
          </div>
        </section>
      )}

      {draftPlan && (
        <section className="card draft">
          <div className="row between">
            <h2>{draftPlan.replacesPlanId ? 'Proposed revision' : 'Proposed plan'} <span className="chip">draft · not saved yet</span></h2>
            <span className="chip">{draftPlan.source === 'ai' ? '✨ AI-planned' : 'Built-in scheduler'}</span>
          </div>
          <p>{draftPlan.summary}</p>
          {draftPlan.warnings.map((w) => <Alert key={w} kind="warn">{w}</Alert>)}
          {draftPlan.changes && <Changes changes={draftPlan.changes} />}
          <SessionList
            sessions={draftPlan.sessions}
            today={today}
            readOnly
            onRemove={(s) => act('remove', () => api.del(`/api/plans/${draftPlan.id}/sessions/${s.id}`))}
          />
          <div className="row">
            <button className="btn btn-primary" disabled={!!busy} onClick={() => act('approve', () => api.post(`/api/plans/${draftPlan.id}/approve`), 'Plan approved and saved.')}>
              {busy === 'approve' ? 'Saving…' : 'Approve & save'}
            </button>
            <button className="btn btn-ghost" disabled={!!busy} onClick={() => act('reject', () => api.post(`/api/plans/${draftPlan.id}/reject`), 'Draft discarded. Your saved plan is unchanged.')}>
              Discard
            </button>
          </div>
        </section>
      )}

      {activePlan && (
        <section className="card">
          <div className="row between">
            <h2>Your approved plan</h2>
            <span className="chip">{formatDate(activePlan.startDate)} → {formatDate(activePlan.endDate)}</span>
          </div>
          {stats && (
            <>
              <ProgressBar value={stats.minutesDone} max={stats.minutesPlanned} label="Plan progress" />
              <small className="muted">{formatMinutes(stats.minutesDone)} of {formatMinutes(stats.minutesPlanned)} · {stats.sessionsDone}/{stats.sessionsTotal} sessions done</small>
            </>
          )}
          {stats?.needsRevision && !draftPlan && (
            <Alert kind="warn">
              {stats.missed} session{stats.missed === 1 ? ' was' : 's were'} missed. Use "Revise" above to get a new proposal — nothing changes until you approve it.
            </Alert>
          )}
          <SessionList sessions={activePlan.sessions} today={today} onToggle={toggle(activePlan)} />
        </section>
      )}
    </>
  );
}
