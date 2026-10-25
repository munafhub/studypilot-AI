import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { makeApp, signUp, authed } from './helpers/setup.js';

describe('authentication', () => {
  it('registers, returns a token, and never leaks the password hash', async () => {
    const { app } = makeApp();
    const res = await request(app).post('/api/auth/register').send({ name: 'Ada', email: 'Ada@Example.com', password: 'longenough1' });
    expect(res.status).toBe(201);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user.email).toBe('ada@example.com');
    expect(JSON.stringify(res.body)).not.toContain('scrypt');
    expect(res.body.user.availability.mon).toBe(120);
  });
  it('rejects invalid registration input with field errors', async () => {
    const { app } = makeApp();
    const res = await request(app).post('/api/auth/register').send({ name: '', email: 'nope', password: 'short' });
    expect(res.status).toBe(400);
    expect(Object.keys(res.body.error.fields).sort()).toEqual(['email', 'name', 'password']);
  });
  it('rejects duplicate emails (case-insensitive)', async () => {
    const { app } = makeApp();
    await signUp(app, { email: 'dup@example.com' });
    const res = await request(app).post('/api/auth/register').send({ name: 'X', email: 'DUP@example.com', password: 'password123' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_TAKEN');
  });
  it('logs in with correct credentials only', async () => {
    const { app } = makeApp();
    const u = await signUp(app);
    const ok = await request(app).post('/api/auth/login').send({ email: u.email, password: u.password });
    expect(ok.status).toBe(200);
    const bad = await request(app).post('/api/auth/login').send({ email: u.email, password: 'wrong-password' });
    expect(bad.status).toBe(401);
    const ghost = await request(app).post('/api/auth/login').send({ email: 'nobody@example.com', password: 'whatever12' });
    expect(ghost.status).toBe(401);
    expect(ghost.body.error.message).toBe(bad.body.error.message);
  });
  it('protects routes and supports /me and logout', async () => {
    const { app } = makeApp();
    expect((await request(app).get('/api/tasks')).status).toBe(401);
    expect((await request(app).get('/api/tasks').set('Authorization', 'Bearer bogus')).status).toBe(401);
    const u = await signUp(app);
    const api = authed(app, u.token);
    expect((await api.get('/api/auth/me')).body.user.email).toBe(u.email);
    expect((await api.post('/api/auth/logout')).status).toBe(204);
    expect((await api.get('/api/auth/me')).status).toBe(401);
  });
  it('expires sessions', async () => {
    let t = new Date('2026-10-26T09:00:00Z');
    const { app } = makeApp({ now: () => t });
    const u = await signUp(app);
    t = new Date('2026-11-30T09:00:00Z');
    const res = await authed(app, u.token).get('/api/auth/me');
    expect(res.status).toBe(401);
  });
  it('rate-limits repeated login attempts', async () => {
    const { app } = makeApp({ config: { authRateLimit: { windowMs: 60000, max: 3 } } });
    let last;
    for (let i = 0; i < 5; i += 1) last = await request(app).post('/api/auth/login').send({ email: 'a@b.com', password: 'xxxxxxxx' });
    expect(last.status).toBe(429);
    expect(last.headers['retry-after']).toBeDefined();
  });
  it('handles malformed JSON and unknown routes', async () => {
    const { app } = makeApp();
    const bad = await request(app).post('/api/auth/login').set('Content-Type', 'application/json').send('{oops');
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('BAD_JSON');
    expect((await request(app).get('/api/nope')).status).toBe(404);
    const h = await request(app).get('/api/health');
    expect(h.headers['x-content-type-options']).toBe('nosniff');
    expect(h.headers['x-powered-by']).toBeUndefined();
  });
});

describe('settings', () => {
  it('reads and updates availability', async () => {
    const { app } = makeApp();
    const api = authed(app, (await signUp(app)).token);
    const put = await api.put('/api/settings', { name: 'New Name', availability: { mon: 30, sun: 0 } });
    expect(put.status).toBe(200);
    const get = await api.get('/api/settings');
    expect(get.body.availability.mon).toBe(30);
    expect(get.body.availability.tue).toBe(120);
    expect(get.body.name).toBe('New Name');
    expect((await api.put('/api/settings', { availability: { mon: 5000 } })).status).toBe(400);
  });
});
