import express from 'express';
import { HttpError } from '../errors.js';
import { Fields } from '../utils/validate.js';
import { asyncHandler, rateLimit, requireAuth } from '../middleware.js';
import { hashPassword, verifyPassword, newToken, hashToken } from '../security.js';
import { DEFAULT_AVAILABILITY } from '../services/scheduler.js';
import { toUser } from '../services/mappers.js';

const DUMMY_HASH = 'scrypt$AAAAAAAAAAAAAAAAAAAAAA==$' + Buffer.alloc(64).toString('base64');

export function authRoutes(ctx) {
  const { db, config, now } = ctx;
  const router = express.Router();
  const limiter = rateLimit({ ...config.authRateLimit, keyFn: (req) => req.ip || 'unknown' });

  function startSession(userRow) {
    const token = newToken();
    const expires = new Date(now().getTime() + config.sessionTtlDays * 86400000);
    db.run('DELETE FROM sessions WHERE expires_at <= ?', now().toISOString());
    db.run(
      'INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)',
      hashToken(token), userRow.id, expires.toISOString(), now().toISOString(),
    );
    return { user: toUser(userRow), token, expiresAt: expires.toISOString() };
  }

  router.post('/register', limiter, asyncHandler(async (req, res) => {
    const f = new Fields(req.body);
    const name = f.str('name', { min: 1, max: 80, label: 'Name' });
    const email = f.email('email');
    const password = f.str('password', { min: 8, max: 128, label: 'Password' });
    f.done();
    if (db.get('SELECT id FROM users WHERE email = ?', email)) {
      throw new HttpError(409, 'EMAIL_TAKEN', 'An account with that email already exists.');
    }
    const passwordHash = await hashPassword(password);
    const { lastInsertRowid } = db.run(
      'INSERT INTO users (email, name, password_hash, availability, created_at) VALUES (?, ?, ?, ?, ?)',
      email, name, passwordHash, JSON.stringify(DEFAULT_AVAILABILITY), now().toISOString(),
    );
    res.status(201).json(startSession(db.get('SELECT * FROM users WHERE id = ?', lastInsertRowid)));
  }));

  router.post('/login', limiter, asyncHandler(async (req, res) => {
    const f = new Fields(req.body);
    const email = f.email('email');
    const password = f.str('password', { min: 1, max: 128, label: 'Password' });
    f.done();
    const row = db.get('SELECT * FROM users WHERE email = ?', email);
    const ok = await verifyPassword(password, row ? row.password_hash : DUMMY_HASH);
    if (!row || !ok) throw new HttpError(401, 'INVALID_CREDENTIALS', 'Invalid email or password.');
    res.json(startSession(row));
  }));

  router.post('/logout', requireAuth(ctx), (req, res) => {
    db.run('DELETE FROM sessions WHERE token_hash = ?', req.tokenHash);
    res.status(204).end();
  });

  router.get('/me', requireAuth(ctx), (req, res) => {
    res.json({ user: req.user });
  });

  return router;
}
