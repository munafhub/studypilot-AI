import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export function loadConfig(env = process.env) {
  const num = (v, d) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : d;
  };
  return {
    port: num(env.PORT, 3001),
    dbPath: env.DB_PATH || path.join(here, '..', 'data', 'studypilot.db'),
    sessionTtlDays: num(env.SESSION_TTL_DAYS, 7),
    anthropicApiKey: env.ANTHROPIC_API_KEY || '',
    anthropicModel: env.ANTHROPIC_MODEL || 'claude-sonnet-5-5',
    geminiApiKey: env.GEMINI_API_KEY || '',
    geminiModel: env.GEMINI_MODEL || 'gemini-2.5-flash',
    aiProvider: (env.AI_PROVIDER || 'auto').toLowerCase(),
    clientDist: env.CLIENT_DIST || path.join(here, '..', '..', 'client', 'dist'),
    authRateLimit: { windowMs: 15 * 60 * 1000, max: num(env.AUTH_RATE_LIMIT, 30) },
    aiRateLimit: { windowMs: 10 * 60 * 1000, max: num(env.AI_RATE_LIMIT, 40) },
    maxPdfBytes: 5 * 1024 * 1024,
    /**
     * Frontend origins allowed to call this API cross-origin (comma separated, "*" = any).
     * Defaults to allowing every origin so a separately hosted frontend (e.g. on Vercel)
     * works without extra hosting config. Set CORS_ORIGIN on the host to restrict it.
     */
    corsOrigins: (env.CORS_ORIGIN || '')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean)
      .concat(env.CORS_ORIGIN ? [] : ['*']),
  };
}
