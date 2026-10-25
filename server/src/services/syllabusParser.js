import { addDays, diffDays, isValidDate, fmt } from '../utils/dates.js';

const MONTHS = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5,
  jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9,
  oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};
const MONTH_RE = '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\.?';
const monthNum = (s) => MONTHS[s.toLowerCase().replace('.', '')];

const PATTERNS = [
  { re: /\b(\d{4})-(\d{2})-(\d{2})\b/g, build: (m) => ({ y: +m[1], mo: +m[2], d: +m[3] }) },
  {
    re: new RegExp(`\\b(${MONTH_RE})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?\\b`, 'gi'),
    build: (m) => ({ mo: monthNum(m[1]), d: +m[2], y: m[3] ? +m[3] : null }),
  },
  {
    re: new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${MONTH_RE})(?:,?\\s+(\\d{4}))?\\b`, 'gi'),
    build: (m) => ({ mo: monthNum(m[2]), d: +m[1], y: m[3] ? +m[3] : null }),
  },
  {
    re: /\b(\d{1,2})([/.])(\d{1,2})\2(\d{4}|\d{2})\b/g,
    build: (m) => {
      const a = +m[1];
      const b = +m[3];
      const y = m[4].length === 2 ? 2000 + +m[4] : +m[4];
      if (m[2] === '.') return { d: a, mo: b, y };
      if (a > 12) return { d: a, mo: b, y };
      if (b > 12) return { mo: a, d: b, y };
      return { mo: a, d: b, y, ambiguous: a !== b };
    },
  },
];

const pad = (n) => String(n).padStart(2, '0');

/** Find calendar dates in a line. Returns [{start,end,date,ambiguous}] without overlaps. */
export function findDates(line, now = new Date()) {
  const found = [];
  const today = fmt(now);
  for (const { re, build } of PATTERNS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(line))) {
      const parts = build(m);
      if (!parts.mo || parts.mo > 12) continue;
      let year = parts.y ?? now.getUTCFullYear();
      let iso = `${year}-${pad(parts.mo)}-${pad(parts.d)}`;
      if (!isValidDate(iso)) continue;
      if (parts.y == null && diffDays(iso, today) > 183) {
        year += 1;
        iso = `${year}-${pad(parts.mo)}-${pad(parts.d)}`;
        if (!isValidDate(iso)) continue;
      }
      found.push({ start: m.index, end: m.index + m[0].length, date: iso, ambiguous: !!parts.ambiguous });
    }
  }
  found.sort((a, b) => a.start - b.start || b.end - a.end);
  const out = [];
  for (const f of found) if (!out.length || f.start >= out[out.length - 1].end) out.push(f);
  return out;
}

const EXAM_RE = /\b(exam|midterm|mid-term|final|test|quiz)\b/i;
const DEADLINE_RE = /\b(due|assignment|homework|project|essay|report|submit|submission|deadline|lab|paper|presentation)\b/i;
const TOPIC_START_RE = /^\s*(?:week|wk\.?|unit|module|chapter|ch\.?|lecture|lec\.?|session|topic|part)\s*\d+/i;
const BULLET_RE = /^\s*(?:[•●▪◦·*-]|\d{1,2}[.)])\s+(\S.*)$/;

function cleanTitle(text) {
  let t = text
    .replace(/\(\s*\)|\[\s*\]/g, ' ')
    .replace(/(?:\s*[|–—:;,-]\s*){2,}/g, ' – ')
    .replace(/^\s*(?:[•●▪◦·*-]|\d{1,2}[.)])\s+/, '')
    .replace(/\b(?:due|by|on|deadline|date)\s*[:-]?\s*$/i, '')
    .replace(/^\s*(?:due|by|on)\s*[:-]?\s+/i, '')
    .replace(/\s+/g, ' ')
    .replace(/^[\s\-–—:;,|•*·.]+|[\s\-–—:;,|•*·.]+$/g, '')
    .trim();
  if (t.length > 200) t = `${t.slice(0, 197)}...`;
  return t;
}

/**
 * Heuristic syllabus parser. Returns a DRAFT list; the student reviews it before anything is saved.
 * items: [{ title, dueDate|null, kind: 'exam'|'deadline'|'event'|'topic', ambiguous }]
 */
export function parseSyllabusText(text, { now = new Date(), max = 100 } = {}) {
  const lines = String(text)
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => l.length >= 3);

  const items = [];
  const seen = new Set();
  let prevText = null;

  const push = (item) => {
    const key = `${item.title.toLowerCase()}|${item.dueDate ?? ''}`;
    if (seen.has(key) || items.length >= max) return;
    seen.add(key);
    items.push(item);
  };

  for (const line of lines) {
    if (line.length > 160 || /@|https?:\/\//i.test(line)) {
      prevText = null;
      continue;
    }
    const dates = findDates(line, now);
    if (dates.length) {
      let rest = line;
      for (const d of [...dates].reverse()) rest = `${rest.slice(0, d.start)} ${rest.slice(d.end)}`;
      let title = cleanTitle(rest);
      const kind = EXAM_RE.test(line) ? 'exam' : DEADLINE_RE.test(line) ? 'deadline' : 'event';
      if (title.length < 3) {
        title = prevText && prevText.length >= 3 ? prevText : kind === 'exam' ? 'Exam' : 'Deadline';
      }
      const last = dates[dates.length - 1];
      push({ title, dueDate: last.date, kind, ambiguous: dates.some((d) => d.ambiguous) });
      prevText = null;
      continue;
    }
    const bullet = BULLET_RE.exec(line);
    if (TOPIC_START_RE.test(line) || bullet) {
      const title = cleanTitle(bullet ? bullet[1] : line);
      if (title.length >= 3) push({ title, dueDate: null, kind: 'topic', ambiguous: false });
      prevText = null;
    } else {
      prevText = cleanTitle(line);
    }
  }
  return items;
}

export { addDays };
