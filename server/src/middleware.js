import { HttpError } from './errors.js';
import { hashToken } from './security.js';

export const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'",
  );
  next();
}

/** Fixed-window in-memory rate limiter. */
export function rateLimit({ windowMs, max, keyFn, clock = Date.now }) {
  const hits = new Map();
  return (req, res, next) => {
    const now = clock();
    if (hits.size > 5000) for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
    const key = keyFn(req);
    let entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(key, entry);
    }
    entry.count += 1;
    if (entry.count > max) {
      res.setHeader('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)));
      return next(new HttpError(429, 'RATE_LIMITED', 'Too many requests. Please wait a moment and try again.'));
    }
    next();
  };
}

export function requireAuth({ db, now }) {
  return (req, res, next) => {
    const header = req.headers.authorization || '';
    const match = /^Bearer\s+(\S+)$/i.exec(header);
    if (!match) return next(new HttpError(401, 'UNAUTHENTICATED', 'Please log in.'));
    const tokenHash = hashToken(match[1]);
    const row = db.get(
      `SELECT u.id, u.name, u.email, u.availability, s.expires_at
         FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?`,
      tokenHash,
    );
    if (!row || row.expires_at <= now().toISOString()) {
      if (row) db.run('DELETE FROM sessions WHERE token_hash = ?', tokenHash);
      return next(new HttpError(401, 'UNAUTHENTICATED', 'Your session has expired. Please log in again.'));
    }
    req.user = { id: row.id, name: row.name, email: row.email, availability: JSON.parse(row.availability) };
    req.tokenHash = tokenHash;
    next();
  };
}

export function errorHandler({ logger }) {
  // eslint-disable-next-line no-unused-vars
  return (err, req, res, next) => {
    if (err.type === 'entity.too.large') {
      return res.status(413).json({ error: { code: 'TOO_LARGE', message: 'That upload is too large.' } });
    }
    if (err.type === 'entity.parse.failed') {
      return res.status(400).json({ error: { code: 'BAD_JSON', message: 'The request body is not valid JSON.' } });
    }
    if (err instanceof HttpError) {
      const body = { code: err.code, message: err.message };
      if (err.fields) body.fields = err.fields;
      return res.status(err.status).json({ error: body });
    }
    logger.error('Unhandled error:', err);
    res.status(500).json({ error: { code: 'INTERNAL', message: 'Something went wrong on our side.' } });
  };
}
