import request from 'supertest';
import { openDatabase } from '../../src/db.js';
import { loadConfig } from '../../src/config.js';
import { createApp } from '../../src/app.js';
import { createMockProvider } from '../../src/llm/mock.js';

export const NOW = new Date('2026-10-26T09:00:00Z'); // a Monday
export const TODAY = '2026-10-26';
export const silent = { error() {}, warn() {}, info() {}, log() {} };

export function makeApp({ llm = createMockProvider(), config = {}, now = () => NOW } = {}) {
  const db = openDatabase(':memory:');
  const cfg = { ...loadConfig({}), dbPath: ':memory:', clientDist: '/nonexistent', ...config };
  const app = createApp({ db, config: cfg, llm, now, logger: silent });
  return { app, db, config: cfg };
}

let counter = 0;
export async function signUp(app, overrides = {}) {
  counter += 1;
  const body = { name: 'Test Student', email: `student${counter}@example.com`, password: 'password123', ...overrides };
  const res = await request(app).post('/api/auth/register').send(body);
  if (res.status !== 201) throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { token: res.body.token, user: res.body.user, email: body.email, password: body.password };
}

export const authed = (app, token) => ({
  get: (url) => request(app).get(url).set('Authorization', `Bearer ${token}`),
  post: (url, body) => request(app).post(url).set('Authorization', `Bearer ${token}`).send(body ?? {}),
  put: (url, body) => request(app).put(url).set('Authorization', `Bearer ${token}`).send(body ?? {}),
  patch: (url, body) => request(app).patch(url).set('Authorization', `Bearer ${token}`).send(body ?? {}),
  delete: (url) => request(app).delete(url).set('Authorization', `Bearer ${token}`),
  pdf: (url, buf, type = 'application/pdf') =>
    request(app).post(url).set('Authorization', `Bearer ${token}`).set('Content-Type', type).send(buf),
});

export async function addTask(api, over = {}) {
  const res = await api.post('/api/tasks', { title: 'Read chapter 1', dueDate: '2026-10-30', estimatedMinutes: 120, ...over });
  if (res.status !== 201) throw new Error(`addTask failed: ${JSON.stringify(res.body)}`);
  return res.body.task;
}
