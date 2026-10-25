import { describe, it, expect } from 'vitest';
import { makeApp, signUp, authed } from './helpers/setup.js';
import { makePdf } from './helpers/makePdf.js';
import { extractPdfText } from '../src/services/pdfExtract.js';

const SYLLABUS = [
  'Biology 101 - Fall 2026', 'Week 1: Cell structure', 'Week 2: Photosynthesis',
  'Lab report 1 due Nov 5, 2026', 'Midterm Exam - Nov 12, 2026', 'Final project due 2026-12-08',
];

describe('PDF text extraction', () => {
  it('extracts text lines from a text PDF', async () => {
    const { text, pages } = await extractPdfText(makePdf(SYLLABUS));
    expect(pages).toBe(1);
    expect(text).toContain('Midterm Exam - Nov 12, 2026');
    expect(text.split('\n')[1]).toBe('Week 1: Cell structure');
  });
  it('reads multiple pages', async () => {
    const { text, pages } = await extractPdfText(makePdf([['Page one has enough text here'], ['Page two also has enough text']]));
    expect(pages).toBe(2);
    expect(text).toContain('Page two');
  });
  it('fails clearly on empty, non-PDF, corrupt, and image-only PDFs', async () => {
    await expect(extractPdfText(Buffer.alloc(0))).rejects.toMatchObject({ code: 'PDF_EMPTY', status: 400 });
    await expect(extractPdfText(Buffer.from('hello world, definitely not a pdf'))).rejects.toMatchObject({ code: 'PDF_INVALID', status: 415 });
    await expect(extractPdfText(Buffer.from('%PDF-1.4\nthis is garbage'))).rejects.toMatchObject({ code: 'PDF_CORRUPT' });
    await expect(extractPdfText(makePdf(['']))).rejects.toMatchObject({ code: 'PDF_NO_TEXT', status: 422 });
  });
});

describe('syllabus upload -> review -> confirm', () => {
  it('returns a draft without saving anything', async () => {
    const { app } = makeApp();
    const api = authed(app, (await signUp(app)).token);
    const res = await api.pdf('/api/syllabus/extract', makePdf(SYLLABUS));
    expect(res.status).toBe(200);
    expect(res.body.usedAI).toBe(false);
    const titles = res.body.items.map((i) => i.title);
    expect(titles.some((t) => /midterm/i.test(t))).toBe(true);
    const midterm = res.body.items.find((i) => /midterm/i.test(i.title));
    expect(midterm).toMatchObject({ dueDate: '2026-11-12', kind: 'exam' });
    expect((await api.get('/api/tasks')).body.tasks).toHaveLength(0);
  });
  it('rejects bad uploads with helpful errors', async () => {
    const { app } = makeApp();
    const api = authed(app, (await signUp(app)).token);
    const notPdf = await api.pdf('/api/syllabus/extract', Buffer.from('plain text file contents here'));
    expect(notPdf.status).toBe(415);
    expect(notPdf.body.error.code).toBe('PDF_INVALID');
    const scanned = await api.pdf('/api/syllabus/extract', makePdf(['']));
    expect(scanned.status).toBe(422);
    expect(scanned.body.error.code).toBe('PDF_NO_TEXT');
    const wrongType = await api.pdf('/api/syllabus/extract', Buffer.from('x'), 'text/plain');
    expect(wrongType.status).toBe(415);
    const nothing = await api.pdf('/api/syllabus/extract', makePdf(['This PDF has text but nothing that looks like a schedule at all']));
    expect(nothing.status).toBe(422);
    expect(nothing.body.error.code).toBe('NO_ITEMS_FOUND');
  });
  it('enforces the upload size limit', async () => {
    const { app } = makeApp({ config: { maxPdfBytes: 2000 } });
    const api = authed(app, (await signUp(app)).token);
    const res = await api.pdf('/api/syllabus/extract', Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(5000, 65)]));
    expect(res.status).toBe(413);
  });
  it('requires login', async () => {
    const { app } = makeApp();
    const request = (await import('supertest')).default;
    const res = await request(app).post('/api/syllabus/extract').set('Content-Type', 'application/pdf').send(makePdf(SYLLABUS));
    expect(res.status).toBe(401);
  });
  it('saves only the confirmed (edited) items as tasks', async () => {
    const { app } = makeApp();
    const api = authed(app, (await signUp(app)).token);
    const res = await api.post('/api/syllabus/confirm', {
      items: [{ title: 'Midterm', dueDate: '2026-11-12', estimatedMinutes: 180, priority: 3, subject: 'Biology' }, { title: 'Week 1 reading', dueDate: null }],
    });
    expect(res.status).toBe(201);
    expect(res.body.tasks).toHaveLength(2);
    expect(res.body.tasks[0]).toMatchObject({ source: 'syllabus', estimatedMinutes: 180, subject: 'Biology' });
    expect((await api.get('/api/tasks')).body.tasks).toHaveLength(2);
  });
  it('validates confirm payloads atomically', async () => {
    const { app } = makeApp();
    const api = authed(app, (await signUp(app)).token);
    const bad = await api.post('/api/syllabus/confirm', { items: [{ title: 'OK' }, { title: '', dueDate: 'nope' }] });
    expect(bad.status).toBe(400);
    expect(bad.body.error.fields['items[1]']).toBeDefined();
    expect((await api.get('/api/tasks')).body.tasks).toHaveLength(0);
    expect((await api.post('/api/syllabus/confirm', { items: [] })).status).toBe(400);
    expect((await api.post('/api/syllabus/confirm', {})).status).toBe(400);
  });
});
