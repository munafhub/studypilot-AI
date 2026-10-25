// All dates are plain 'YYYY-MM-DD' strings handled in UTC so results never depend on server timezone.
const DAY_MS = 86400000;
const RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

export const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

export function isValidDate(s) {
  if (typeof s !== 'string') return false;
  const m = RE.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (y < 2000 || y > 2100) return false;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

export const toDate = (s) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};
export const fmt = (dt) => dt.toISOString().slice(0, 10);
export const addDays = (s, n) => fmt(new Date(toDate(s).getTime() + n * DAY_MS));
export const diffDays = (a, b) => Math.round((toDate(b).getTime() - toDate(a).getTime()) / DAY_MS);
export const weekdayKey = (s) => KEYS[toDate(s).getUTCDay()];

export function eachDay(start, end) {
  const out = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}

/** The student's "today": trust the browser's local date if it is within a day of the server clock. */
export function resolveToday(clientToday, now) {
  const server = fmt(now);
  if (isValidDate(clientToday) && Math.abs(diffDays(server, clientToday)) <= 1) return clientToday;
  return server;
}
