import { describe, it, expect } from 'vitest';
import { makeApp, signUp, authed, addTask, TODAY, NOW } from './helpers/setup.js';

async function setup(opts) {
  const ctx = makeApp(opts);
  const u = await signUp(ctx.app);
  const api = authed(ctx.app, u.token);
  return { ...ctx, api, u };
}

describe('plan generation and approval', () => {
  it('needs tasks first', async () => {
    const { api } = await setup();
    const res = await api.post('/api/plans/generate', { scope: 'weekly' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('NO_TASKS');
  });
  it('validates scope', async () => {
    const { api } = await setup();
    expect((await api.post('/api/plans/generate', { scope: 'monthly' })).status).toBe(400);
    expect((await api.post('/api/plans/generate', {})).status).toBe(400);
  });
  it('creates a DRAFT weekly plan that is not active until approved', async () => {
    const { api } = await setup();
    await addTask(api, { title: 'Essay', dueDate: '2026-10-29', estimatedMinutes: 240 });
    await addTask(api, { title: 'Reading', dueDate: '2026-11-02', estimatedMinutes: 90 });
    const res = await api.post('/api/plans/generate', { scope: 'weekly', today: TODAY });
    expect(res.status).toBe(201);
    const plan = res.body.plan;
    expect(plan.status).toBe('draft');
    expect(plan.source).toBe('scheduler');
    expect(plan.startDate).toBe(TODAY);
    expect(plan.endDate).toBe('2026-11-01');
    expect(plan.sessions.reduce((n, s) => n + s.minutes, 0)).toBe(330);
    expect((await api.get('/api/plans/active')).body.plan).toBeNull();
    expect((await api.get('/api/plans/draft')).body.plan.id).toBe(plan.id);

    const approved = await api.post(`/api/plans/${plan.id}/approve`);
    expect(approved.body.plan.status).toBe('active');
    expect((await api.get('/api/plans/active')).body.plan.id).toBe(plan.id);
    expect((await api.post(`/api/plans/${plan.id}/approve`)).status).toBe(409);
  });
  it('daily plans cover only today and respect availability', async () => {
    const { api } = await setup();
    await api.put('/api/settings', { availability: { mon: 45 } });
    await addTask(api, { estimatedMinutes: 300 });
    const { plan } = (await api.post('/api/plans/generate', { scope: 'daily', today: TODAY })).body;
    expect(plan.endDate).toBe(TODAY);
    expect(plan.sessions.reduce((n, s) => n + s.minutes, 0)).toBe(45);
  });
  it('reports NO_CAPACITY when there is no study time', async () => {
    const { api } = await setup();
    await api.put('/api/settings', { availability: { mon: 0, tue: 0, wed: 0, thu: 0, fri: 0, sat: 0, sun: 0 } });
    await addTask(api);
    const res = await api.post('/api/plans/generate', { scope: 'weekly', today: TODAY });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('NO_CAPACITY');
  });
  it('warns when work does not fit before a deadline', async () => {
    const { api } = await setup();
    await api.put('/api/settings', { availability: { mon: 30 } });
    await addTask(api, { title: 'Huge', dueDate: TODAY, estimatedMinutes: 600 });
    const { plan } = (await api.post('/api/plans/generate', { scope: 'daily', today: TODAY })).body;
    expect(plan.warnings.join(' ')).toContain('Huge');
  });
  it('can reject a draft, and a new draft replaces the old one', async () => {
    const { api } = await setup();
    await addTask(api);
    const first = (await api.post('/api/plans/generate', { scope: 'daily', today: TODAY })).body.plan;
    const second = (await api.post('/api/plans/generate', { scope: 'weekly', today: TODAY })).body.plan;
    expect((await api.get(`/api/plans/${first.id}`)).status).toBe(404);
    expect((await api.post(`/api/plans/${second.id}/reject`)).status).toBe(204);
    expect((await api.get('/api/plans/draft')).body.plan).toBeNull();
    expect((await api.post(`/api/plans/${second.id}/reject`)).status).toBe(404);
  });
  it('lets the student remove a session from a draft before approving', async () => {
    const { api } = await setup();
    await addTask(api, { estimatedMinutes: 240 });
    const { plan } = (await api.post('/api/plans/generate', { scope: 'weekly', today: TODAY })).body;
    const sid = plan.sessions[0].id;
    expect((await api.delete(`/api/plans/${plan.id}/sessions/${sid}`)).status).toBe(204);
    expect((await api.get(`/api/plans/${plan.id}`)).body.plan.sessions.length).toBe(plan.sessions.length - 1);
  });
  it('approving a new plan supersedes the old one', async () => {
    const { api } = await setup();
    await addTask(api);
    const p1 = (await api.post('/api/plans/generate', { scope: 'daily', today: TODAY })).body.plan;
    await api.post(`/api/plans/${p1.id}/approve`);
    const p2 = (await api.post('/api/plans/generate', { scope: 'weekly', today: TODAY })).body.plan;
    await api.post(`/api/plans/${p2.id}/approve`);
    expect((await api.get(`/api/plans/${p1.id}`)).body.plan.status).toBe('superseded');
    expect((await api.get('/api/plans/active')).body.plan.id).toBe(p2.id);
    expect((await api.get('/api/plans')).body.plans).toHaveLength(2);
  });
});

describe('session tracking and progress', () => {
  it('marks sessions done, updates task minutes and progress, and can undo', async () => {
    const { api } = await setup();
    const task = await addTask(api, { estimatedMinutes: 100, dueDate: '2026-10-30' });
    const { plan } = (await api.post('/api/plans/generate', { scope: 'weekly', today: TODAY })).body;
    expect((await api.patch(`/api/plans/${plan.id}/sessions/${plan.sessions[0].id}`, { status: 'done' })).status).toBe(409);
    await api.post(`/api/plans/${plan.id}/approve`);
    const s = plan.sessions[0];
    const upd = await api.patch(`/api/plans/${plan.id}/sessions/${s.id}`, { status: 'done' });
    expect(upd.body.session.status).toBe('done');
    expect((await api.get(`/api/tasks/${task.id}`)).body.task.minutesDone).toBe(s.minutes);
    const prog = (await api.get(`/api/plans/progress?today=${TODAY}`)).body;
    expect(prog.plan.sessionsDone).toBe(1);
    expect(prog.plan.minutesDone).toBe(s.minutes);
    expect(prog.tasks).toMatchObject({ total: 1, pending: 1, done: 0 });
    await api.patch(`/api/plans/${plan.id}/sessions/${s.id}`, { status: 'planned' });
    expect((await api.get(`/api/tasks/${task.id}`)).body.task.minutesDone).toBe(0);
    expect((await api.patch(`/api/plans/${plan.id}/sessions/${s.id}`, { status: 'weird' })).status).toBe(400);
    expect((await api.patch(`/api/plans/${plan.id}/sessions/9999`, { status: 'done' })).status).toBe(404);
  });
  it('progress works with no plan', async () => {
    const { api } = await setup();
    const prog = (await api.get('/api/plans/progress')).body;
    expect(prog.plan).toBeNull();
    expect(prog.tasks.total).toBe(0);
  });
});

describe('plan revision after missed sessions', () => {
  // Time moves: the plan is made on Monday, the student then misses Mon/Tue and comes back Wednesday.
  async function missedScenario() {
    let clock = NOW;
    const ctx = await setup({ now: () => clock });
    const { api } = ctx;
    await addTask(api, { title: 'Essay', dueDate: '2026-10-31', estimatedMinutes: 300 });
    const { plan } = (await api.post('/api/plans/generate', { scope: 'weekly', today: TODAY })).body;
    await api.post(`/api/plans/${plan.id}/approve`);
    const first = plan.sessions[0];
    await api.patch(`/api/plans/${plan.id}/sessions/${first.id}`, { status: 'done' });
    clock = new Date('2026-10-28T09:00:00Z');
    return { ...ctx, plan, first, wednesday: '2026-10-28' };
  }

  it('refuses to revise when nothing was missed', async () => {
    const { api } = await setup();
    await addTask(api);
    const { plan } = (await api.post('/api/plans/generate', { scope: 'weekly', today: TODAY })).body;
    await api.post(`/api/plans/${plan.id}/approve`);
    const res = await api.post('/api/plans/revise', { today: TODAY });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('NOTHING_TO_REVISE');
  });
  it('requires an active plan', async () => {
    const { api } = await setup();
    expect((await api.post('/api/plans/revise', {})).body.error.code).toBe('NO_ACTIVE_PLAN');
  });
  it('drafts a revision WITHOUT changing the saved plan, then applies it only on approval', async () => {
    const { api, plan, wednesday } = await missedScenario();
    const before = (await api.get(`/api/plans/${plan.id}`)).body.plan;
    const rev = (await api.post('/api/plans/revise', { today: wednesday })).body.plan;
    expect(rev.status).toBe('draft');
    expect(rev.replacesPlanId).toBe(plan.id);
    expect(rev.changes.missed.length).toBeGreaterThan(0);
    expect(rev.changes.added.length).toBeGreaterThan(0);
    expect(rev.changes.added.every((s) => s.date >= wednesday)).toBe(true);
    // saved plan untouched
    const unchanged = (await api.get(`/api/plans/${plan.id}`)).body.plan;
    expect(unchanged.status).toBe('active');
    expect(unchanged.sessions).toEqual(before.sessions);
    expect((await api.get('/api/plans/active')).body.plan.id).toBe(plan.id);

    const approved = (await api.post(`/api/plans/${rev.id}/approve`)).body.plan;
    expect(approved.status).toBe('active');
    expect((await api.get(`/api/plans/${plan.id}`)).body.plan.status).toBe('superseded');
    // history preserved: done session still done, remaining minutes sum to what is left
    const done = approved.sessions.filter((s) => s.status === 'done').reduce((n, s) => n + s.minutes, 0);
    const planned = approved.sessions.filter((s) => s.status === 'planned').reduce((n, s) => n + s.minutes, 0);
    expect(done + planned).toBe(300);
  });
  it('does not double count done minutes after a revision', async () => {
    const { api, first, wednesday } = await missedScenario();
    const rev = (await api.post('/api/plans/revise', { today: wednesday })).body.plan;
    await api.post(`/api/plans/${rev.id}/approve`);
    const tasks = (await api.get('/api/tasks')).body.tasks;
    expect(tasks[0].minutesDone).toBe(first.minutes);
  });
  it('rejects a stale revision if the saved plan changed meanwhile', async () => {
    const { api, plan, wednesday } = await missedScenario();
    const rev = (await api.post('/api/plans/revise', { today: wednesday })).body.plan;
    const target = plan.sessions.find((s) => s.date >= wednesday) ?? plan.sessions[plan.sessions.length - 1];
    await api.patch(`/api/plans/${plan.id}/sessions/${target.id}`, { status: 'done' });
    const res = await api.post(`/api/plans/${rev.id}/approve`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PLAN_CHANGED');
  });
  it('can discard a revision and keep the original plan', async () => {
    const { api, plan, wednesday } = await missedScenario();
    const rev = (await api.post('/api/plans/revise', { today: wednesday })).body.plan;
    expect((await api.post(`/api/plans/${rev.id}/reject`)).status).toBe(204);
    expect((await api.get('/api/plans/active')).body.plan.id).toBe(plan.id);
    const prog = (await api.get(`/api/plans/progress?today=${wednesday}`)).body;
    expect(prog.plan.needsRevision).toBe(true);
  });
});

describe('plan ownership', () => {
  it("hides other students' plans and sessions", async () => {
    const { app, api } = await setup();
    const other = authed(app, (await signUp(app)).token);
    await addTask(api);
    const { plan } = (await api.post('/api/plans/generate', { scope: 'daily', today: TODAY })).body;
    await api.post(`/api/plans/${plan.id}/approve`);
    expect((await other.get(`/api/plans/${plan.id}`)).status).toBe(404);
    expect((await other.post(`/api/plans/${plan.id}/approve`)).status).toBe(404);
    expect((await other.post(`/api/plans/${plan.id}/reject`)).status).toBe(404);
    expect((await other.patch(`/api/plans/${plan.id}/sessions/${plan.sessions[0].id}`, { status: 'done' })).status).toBe(404);
    expect((await other.get('/api/plans/active')).body.plan).toBeNull();
    expect((await other.get('/api/plans')).body.plans).toHaveLength(0);
  });
  it('deleting a task removes its sessions', async () => {
    const { api } = await setup();
    const t = await addTask(api);
    const { plan } = (await api.post('/api/plans/generate', { scope: 'daily', today: TODAY })).body;
    await api.delete(`/api/tasks/${t.id}`);
    expect((await api.get(`/api/plans/${plan.id}`)).body.plan.sessions).toHaveLength(0);
    const res = await api.post(`/api/plans/${plan.id}/approve`);
    expect(res.status).toBe(200);
  });
});
