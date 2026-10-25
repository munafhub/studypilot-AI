import { describe, it, expect } from 'vitest';
import { makeApp, signUp, authed, addTask } from './helpers/setup.js';

describe('task CRUD', () => {
  it('creates, reads, updates, completes and deletes a task', async () => {
    const { app } = makeApp();
    const api = authed(app, (await signUp(app)).token);
    const task = await addTask(api, { title: 'Write essay', subject: 'English', priority: 3 });
    expect(task).toMatchObject({ title: 'Write essay', subject: 'English', priority: 3, status: 'pending', estimatedMinutes: 120 });

    expect((await api.get(`/api/tasks/${task.id}`)).body.task.title).toBe('Write essay');
    const edited = await api.put(`/api/tasks/${task.id}`, { title: 'Write final essay', dueDate: null });
    expect(edited.body.task.title).toBe('Write final essay');
    expect(edited.body.task.dueDate).toBeNull();
    expect(edited.body.task.priority).toBe(3);

    const done = await api.patch(`/api/tasks/${task.id}`, { status: 'done' });
    expect(done.body.task.status).toBe('done');
    expect(done.body.task.completedAt).toBeTruthy();
    const reopened = await api.patch(`/api/tasks/${task.id}`, { status: 'pending' });
    expect(reopened.body.task.completedAt).toBeNull();

    expect((await api.delete(`/api/tasks/${task.id}`)).status).toBe(204);
    expect((await api.get(`/api/tasks/${task.id}`)).status).toBe(404);
  });
  it('lists with status filter and sensible ordering', async () => {
    const { app } = makeApp();
    const api = authed(app, (await signUp(app)).token);
    await addTask(api, { title: 'Later', dueDate: '2026-12-01' });
    await addTask(api, { title: 'Sooner', dueDate: '2026-11-01' });
    const t3 = await addTask(api, { title: 'No date', dueDate: null });
    await api.patch(`/api/tasks/${t3.id}`, { status: 'done' });
    const all = (await api.get('/api/tasks')).body.tasks.map((t) => t.title);
    expect(all).toEqual(['Sooner', 'Later', 'No date']);
    expect((await api.get('/api/tasks?status=done')).body.tasks).toHaveLength(1);
    expect((await api.get('/api/tasks?status=pending')).body.tasks).toHaveLength(2);
    expect((await api.get('/api/tasks?status=bogus')).status).toBe(400);
  });
  it('validates input', async () => {
    const { app } = makeApp();
    const api = authed(app, (await signUp(app)).token);
    const res = await api.post('/api/tasks', { title: '', dueDate: '2026-02-31', estimatedMinutes: 2, priority: 7 });
    expect(res.status).toBe(400);
    expect(Object.keys(res.body.error.fields).sort()).toEqual(['dueDate', 'estimatedMinutes', 'priority', 'title']);
    expect((await api.post('/api/tasks', { title: 'x'.repeat(201) })).status).toBe(400);
    expect((await api.get('/api/tasks/abc')).status).toBe(404);
    expect((await api.put('/api/tasks/999', { title: 'x' })).status).toBe(404);
  });
});

describe('task ownership', () => {
  it("never lets one student read, change or delete another's tasks", async () => {
    const { app } = makeApp();
    const a = authed(app, (await signUp(app)).token);
    const b = authed(app, (await signUp(app)).token);
    const task = await addTask(a, { title: 'Private' });
    expect((await b.get(`/api/tasks/${task.id}`)).status).toBe(404);
    expect((await b.put(`/api/tasks/${task.id}`, { title: 'Hacked' })).status).toBe(404);
    expect((await b.delete(`/api/tasks/${task.id}`)).status).toBe(404);
    expect((await b.get('/api/tasks')).body.tasks).toHaveLength(0);
    expect((await a.get(`/api/tasks/${task.id}`)).body.task.title).toBe('Private');
  });
});
