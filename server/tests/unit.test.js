import { describe, it, expect } from 'vitest';
import { isValidDate, addDays, diffDays, weekdayKey, eachDay, resolveToday } from '../src/utils/dates.js';
import { Fields, parseAvailability, parseId } from '../src/utils/validate.js';
import { hashPassword, verifyPassword, newToken, hashToken } from '../src/security.js';
import { buildSchedule, coverageWarnings, capacityFor, defaultSummary, DEFAULT_AVAILABILITY } from '../src/services/scheduler.js';
import { validatePlanProposal, validateQuiz, validateExplanation, validateSyllabusItems } from '../src/services/validators.js';
import { parseSyllabusText, findDates } from '../src/services/syllabusParser.js';

describe('dates', () => {
  it('validates calendar dates', () => {
    expect(isValidDate('2026-02-28')).toBe(true);
    expect(isValidDate('2026-02-30')).toBe(false);
    expect(isValidDate('26-02-01')).toBe(false);
    expect(isValidDate(20260101)).toBe(false);
    expect(isValidDate('1999-01-01')).toBe(false);
  });
  it('does date maths in UTC', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(diffDays('2026-10-26', '2026-11-02')).toBe(7);
    expect(weekdayKey('2026-10-26')).toBe('mon');
    expect(eachDay('2026-10-26', '2026-10-28')).toEqual(['2026-10-26', '2026-10-27', '2026-10-28']);
  });
  it('uses the client date only when it is within a day of the server', () => {
    const now = new Date('2026-10-26T23:30:00Z');
    expect(resolveToday('2026-10-27', now)).toBe('2026-10-27');
    expect(resolveToday('2026-11-20', now)).toBe('2026-10-26');
    expect(resolveToday('nonsense', now)).toBe('2026-10-26');
  });
});

describe('validation helpers', () => {
  it('collects all errors', () => {
    const f = new Fields({ title: '', priority: 9, dueDate: 'x' });
    f.str('title', { min: 1, label: 'Title' });
    f.int('priority', { min: 1, max: 3 });
    f.date('dueDate');
    expect(() => f.done()).toThrow();
    expect(Object.keys(f.errors).sort()).toEqual(['dueDate', 'priority', 'title']);
  });
  it('rejects non-object bodies', () => {
    expect(() => new Fields(null).done()).toThrow();
    expect(() => new Fields([1]).done()).toThrow();
  });
  it('parses availability and ids', () => {
    expect(parseAvailability({ mon: 30 }, { mon: 60, tue: 60 })).toEqual({ mon: 30, tue: 60 });
    expect(() => parseAvailability({ mon: -5 })).toThrow();
    expect(() => parseAvailability({ funday: 5 })).toThrow();
    expect(() => parseAvailability('x')).toThrow();
    expect(parseId('12')).toBe(12);
    expect(parseId('abc')).toBeNull();
    expect(parseId('-1')).toBeNull();
  });
  it('normalises emails and numbers', () => {
    const f = new Fields({ email: ' A@B.com ', n: '15' });
    expect(f.email()).toBe('a@b.com');
    expect(f.int('n', { min: 1, max: 20 })).toBe(15);
  });
});

describe('security helpers', () => {
  it('hashes and verifies passwords', async () => {
    const h = await hashPassword('secret-pass');
    expect(h.startsWith('scrypt$')).toBe(true);
    expect(await verifyPassword('secret-pass', h)).toBe(true);
    expect(await verifyPassword('wrong', h)).toBe(false);
    expect(await verifyPassword('x', 'garbage')).toBe(false);
    expect(await verifyPassword('x', undefined)).toBe(false);
  });
  it('creates unguessable tokens and hashes them', () => {
    const a = newToken();
    expect(a.length).toBeGreaterThan(30);
    expect(a).not.toBe(newToken());
    expect(hashToken(a)).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('scheduler', () => {
  const avail = { ...DEFAULT_AVAILABILITY, sat: 0, sun: 0 };
  const tasks = [
    { id: 1, title: 'Essay', dueDate: '2026-10-30', priority: 2, remaining: 180 },
    { id: 2, title: 'Exam prep', dueDate: '2026-10-28', priority: 2, remaining: 120 },
    { id: 3, title: 'Reading', dueDate: null, priority: 1, remaining: 60 },
  ];
  it('schedules earliest deadlines first and never exceeds daily capacity', () => {
    const { sessions } = buildSchedule({ tasks, availability: avail, startDate: '2026-10-26', endDate: '2026-11-01' });
    expect(sessions[0].taskId).toBe(2);
    const perDay = {};
    for (const s of sessions) perDay[s.date] = (perDay[s.date] ?? 0) + s.minutes;
    for (const [date, total] of Object.entries(perDay)) expect(total).toBeLessThanOrEqual(capacityFor(date, avail));
    expect(sessions.some((s) => s.date === '2026-10-31' || s.date === '2026-11-01')).toBe(false);
  });
  it('does not schedule after the due date and warns when time is short', () => {
    const tight = [{ id: 1, title: 'Big', dueDate: '2026-10-26', priority: 3, remaining: 600 }];
    const { sessions } = buildSchedule({ tasks: tight, availability: avail, startDate: '2026-10-26', endDate: '2026-10-30' });
    expect(sessions.every((s) => s.date === '2026-10-26')).toBe(true);
    const warnings = coverageWarnings({ tasks: tight, sessions, startDate: '2026-10-26', endDate: '2026-10-30' });
    expect(warnings[0]).toContain('Big');
  });
  it('treats overdue tasks as schedulable on any day', () => {
    const overdue = [{ id: 1, title: 'Late', dueDate: '2026-10-01', priority: 2, remaining: 60 }];
    const { sessions } = buildSchedule({ tasks: overdue, availability: avail, startDate: '2026-10-26', endDate: '2026-10-26' });
    expect(sessions).toHaveLength(1);
    const w = coverageWarnings({ tasks: [{ ...overdue[0], remaining: 600 }], sessions, startDate: '2026-10-26', endDate: '2026-10-26' });
    expect(w[0]).toContain('overdue');
  });
  it('respects already-used minutes and ignores finished tasks', () => {
    const { sessions } = buildSchedule({
      tasks: [{ id: 1, title: 'A', dueDate: null, priority: 2, remaining: 100 }, { id: 2, title: 'B', dueDate: null, priority: 2, remaining: 0 }],
      availability: { ...DEFAULT_AVAILABILITY }, startDate: '2026-10-26', endDate: '2026-10-26', used: { '2026-10-26': 100 },
    });
    expect(sessions.reduce((n, s) => n + s.minutes, 0)).toBe(20);
    expect(sessions.every((s) => s.taskId === 1)).toBe(true);
  });
  it('summarises plans', () => {
    expect(defaultSummary([{ taskId: 1, minutes: 60 }], 1)).toContain('1 study session');
    expect(defaultSummary([{ taskId: 1, minutes: 30 }, { taskId: 2, minutes: 30 }], 2)).toContain('2 tasks');
  });
});

describe('plan proposal validation', () => {
  const ctx = {
    tasks: [{ id: 1, title: 'A', dueDate: '2026-10-28', remaining: 60 }, { id: 2, title: 'B', dueDate: null, remaining: 500 }],
    availability: { ...DEFAULT_AVAILABILITY }, startDate: '2026-10-26', endDate: '2026-10-30', used: {},
  };
  it('accepts a good plan and sanitises notes', () => {
    const r = validatePlanProposal({ summary: ' hi ', sessions: [{ taskId: 1, date: '2026-10-26', minutes: 60, note: 'Focus\n\n on  basics' }] }, ctx);
    expect(r.ok).toBe(true);
    expect(r.sessions[0].note).toBe('Focus on basics');
    expect(r.summary).toBe('hi');
  });
  it.each([
    ['unknown task', { taskId: 99, date: '2026-10-26', minutes: 30 }],
    ['date outside range', { taskId: 1, date: '2026-11-15', minutes: 30 }],
    ['bad minutes', { taskId: 1, date: '2026-10-26', minutes: 1 }],
    ['after due date', { taskId: 1, date: '2026-10-29', minutes: 30 }],
    ['non-integer minutes', { taskId: 1, date: '2026-10-26', minutes: 'lots' }],
  ])('rejects %s', (_, session) => {
    expect(validatePlanProposal({ sessions: [session] }, ctx).ok).toBe(false);
  });
  it('rejects overbooked days, over-scheduled tasks and malformed input', () => {
    expect(validatePlanProposal({ sessions: [{ taskId: 2, date: '2026-10-26', minutes: 200 }] }, ctx).ok).toBe(false);
    expect(validatePlanProposal({ sessions: [{ taskId: 1, date: '2026-10-26', minutes: 45 }, { taskId: 1, date: '2026-10-27', minutes: 45 }] }, ctx).ok).toBe(false);
    expect(validatePlanProposal({ sessions: [] }, ctx).ok).toBe(false);
    expect(validatePlanProposal({}, ctx).ok).toBe(false);
    expect(validatePlanProposal(null, ctx).ok).toBe(false);
  });
});

describe('AI output validation', () => {
  const q = { question: 'Q?', options: ['a', 'b', 'c', 'd'], answerIndex: 2, explanation: 'because' };
  it('validates quizzes', () => {
    expect(validateQuiz({ questions: [q] }, 5).ok).toBe(true);
    expect(validateQuiz({ questions: [{ ...q, options: ['a', 'a', 'c', 'd'] }] }, 5).ok).toBe(false);
    expect(validateQuiz({ questions: [{ ...q, answerIndex: 7 }] }, 5).ok).toBe(false);
    expect(validateQuiz({ questions: [{ ...q, options: ['a', 'b'] }] }, 5).ok).toBe(false);
    expect(validateQuiz({ questions: [{ ...q, question: '' }] }, 5).ok).toBe(false);
    expect(validateQuiz({ questions: [] }, 5).ok).toBe(false);
    expect(validateQuiz({ questions: [q, q, q] }, 2).value.questions).toHaveLength(2);
  });
  it('validates explanations and syllabus items', () => {
    expect(validateExplanation({ explanation: 'x'.repeat(40), keyPoints: ['one'] }).ok).toBe(true);
    expect(validateExplanation({ explanation: 'short' }).ok).toBe(false);
    const ok = validateSyllabusItems({ items: [{ title: 'Midterm', dueDate: '2026-11-03', kind: 'exam' }, { title: 'Midterm', dueDate: '2026-11-03', kind: 'exam' }, { title: 'Bad date', dueDate: '2026-13-40', kind: 'weird' }] });
    expect(ok.ok).toBe(true);
    expect(ok.value).toHaveLength(2);
    expect(ok.value[1].dueDate).toBeNull();
    expect(validateSyllabusItems({ items: [{ title: '' }] }).ok).toBe(false);
    expect(validateSyllabusItems(null).ok).toBe(false);
  });
});

describe('syllabus parser', () => {
  const now = new Date('2026-09-01T00:00:00Z');
  it('finds dates in several formats', () => {
    expect(findDates('Due Oct 12, 2026', now)[0].date).toBe('2026-10-12');
    expect(findDates('12 October 2026', now)[0].date).toBe('2026-10-12');
    expect(findDates('2026-11-03', now)[0].date).toBe('2026-11-03');
    expect(findDates('due 15/11/2026', now)[0].date).toBe('2026-11-15');
    expect(findDates('due 12.11.2026', now)[0].date).toBe('2026-11-12');
    expect(findDates('Sept 9th', now)[0].date).toBe('2026-09-09');
    expect(findDates('Feb 30 2026', now)).toHaveLength(0);
  });
  it('flags ambiguous numeric dates and rolls past dates into next year', () => {
    const d = findDates('due 03/04/2026', now)[0];
    expect(d.ambiguous).toBe(true);
    expect(findDates('Jan 10', new Date('2026-10-20T00:00:00Z'))[0].date).toBe('2027-01-10');
  });
  it('extracts deadlines, exams and topics from lines', () => {
    const items = parseSyllabusText(
      [
        'CS 101 Syllabus', 'Instructor: prof@uni.edu',
        'Week 1: Intro to algorithms',
        'Week 2 (Sep 14): Sorting',
        'Assignment 1 due Sep 20, 2026',
        'Midterm Exam - Oct 15, 2026',
        '• Graph traversal',
        'Final exam', '2026-12-10',
        'Project report | Nov 30, 2026',
      ].join('\n'),
      { now },
    );
    const by = (t) => items.find((i) => i.title.toLowerCase().includes(t));
    expect(by('intro to algorithms').kind).toBe('topic');
    expect(by('sorting').dueDate).toBe('2026-09-14');
    expect(by('assignment 1').kind).toBe('deadline');
    expect(by('midterm').kind).toBe('exam');
    expect(by('midterm').dueDate).toBe('2026-10-15');
    expect(by('graph traversal').dueDate).toBeNull();
    expect(by('final exam').dueDate).toBe('2026-12-10');
    expect(by('project report').dueDate).toBe('2026-11-30');
    expect(items.some((i) => i.title.includes('prof@'))).toBe(false);
  });
  it('dedupes and caps results', () => {
    const text = Array.from({ length: 150 }, (_, i) => `Assignment ${i} due Oct 1, 2026`).join('\n');
    expect(parseSyllabusText(text, { now })).toHaveLength(100);
    expect(parseSyllabusText('Quiz Oct 1, 2026\nQuiz Oct 1, 2026', { now })).toHaveLength(1);
    expect(parseSyllabusText('nothing useful here at all', { now })).toEqual([]);
  });
});
