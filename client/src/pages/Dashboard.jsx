import { api, localToday } from '../api.js';
import { Alert, ProgressBar, Spinner, useLoad, formatDate, formatMinutes } from '../components/ui.jsx';

export default function Dashboard({ user }) {
  const today = localToday();
  const progress = useLoad(() => api.get(`/api/plans/progress?today=${today}`), []);
  const tasks = useLoad(() => api.get('/api/tasks?status=pending'), []);

  if (progress.loading || tasks.loading) return <Spinner />;
  if (progress.error) return <Alert>{progress.error}</Alert>;
  const { tasks: t, plan } = progress.data;
  const upcoming = (tasks.data?.tasks ?? []).slice(0, 5);

  async function toggle(session) {
    const status = session.status === 'done' ? 'planned' : 'done';
    await api.patch(`/api/plans/${plan.id}/sessions/${session.id}`, { status });
    progress.reload();
    tasks.reload();
  }

  return (
    <>
      <h1>Hi {user.name.split(' ')[0]} 👋</h1>
      <div className="grid stats">
        <div className="card stat"><b>{t.pending}</b><span>Open tasks</span></div>
        <div className="card stat"><b>{t.done}</b><span>Completed</span></div>
        <div className={`card stat ${t.overdue ? 'warn' : ''}`}><b>{t.overdue}</b><span>Overdue</span></div>
        <div className="card stat">
          <b>{plan ? `${plan.sessionsDone}/${plan.sessionsTotal}` : '–'}</b>
          <span>Plan sessions done</span>
        </div>
      </div>

      <div className="grid two">
        <section className="card">
          <h2>Today's study sessions</h2>
          {!plan && (
            <p className="muted">
              No approved plan yet. <a href="#/planner">Create a study plan →</a>
            </p>
          )}
          {plan && plan.today.length === 0 && <p className="muted">Nothing scheduled for today.</p>}
          {plan?.today.map((s) => (
            <label key={s.id} className={`row session ${s.status}`}>
              <input type="checkbox" checked={s.status === 'done'} onChange={() => toggle(s)} />
              <span>
                <b>{s.taskTitle}</b>
                <small className="muted"> · {formatMinutes(s.minutes)}{s.note ? ` · ${s.note}` : ''}</small>
              </span>
            </label>
          ))}
          {plan && (
            <>
              <ProgressBar value={plan.minutesDone} max={plan.minutesPlanned} label="Plan progress" />
              <small className="muted">{formatMinutes(plan.minutesDone)} of {formatMinutes(plan.minutesPlanned)} studied in this plan</small>
            </>
          )}
          {plan?.needsRevision && (
            <Alert kind="warn">
              You have {plan.missed} missed session{plan.missed === 1 ? '' : 's'}. <a href="#/planner">Revise your plan →</a>
            </Alert>
          )}
        </section>

        <section className="card">
          <h2>Next deadlines</h2>
          {upcoming.length === 0 && <p className="muted">No open tasks. <a href="#/tasks">Add one →</a></p>}
          {upcoming.map((x) => (
            <div key={x.id} className="row between">
              <span><b>{x.title}</b>{x.subject && <small className="muted"> · {x.subject}</small>}</span>
              <small className={x.dueDate && x.dueDate < today ? 'danger' : 'muted'}>{formatDate(x.dueDate)}</small>
            </div>
          ))}
        </section>
      </div>
    </>
  );
}
