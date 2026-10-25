import express from 'express';
import { HttpError, ValidationError } from '../errors.js';
import { Fields } from '../utils/validate.js';
import { asyncHandler } from '../middleware.js';
import { extractPdfText } from '../services/pdfExtract.js';
import { extractSyllabusItems } from '../services/aiService.js';
import { insertTask, TASK_LIMIT } from './tasks.js';
import { toTask } from '../services/mappers.js';

export function syllabusRoutes(ctx) {
  const { db, config, now } = ctx;
  const router = express.Router();

  // Step 1: extract a DRAFT. Nothing is saved here.
  router.post(
    '/extract',
    express.raw({ type: ['application/pdf', 'application/octet-stream'], limit: config.maxPdfBytes }),
    asyncHandler(async (req, res) => {
      if (!Buffer.isBuffer(req.body)) {
        throw new HttpError(415, 'PDF_INVALID', 'Send the PDF as the request body with Content-Type: application/pdf.');
      }
      const { text, pages, truncated } = await extractPdfText(req.body);
      const { items, usedAI } = await extractSyllabusItems(ctx, text);
      if (items.length === 0) {
        throw new HttpError(422, 'NO_ITEMS_FOUND', 'We read the PDF but could not find any topics or dates. You can add tasks manually.');
      }
      res.json({ items, pages, truncated, usedAI, textPreview: text.slice(0, 600) });
    }),
  );

  // Step 2: the student confirms (possibly edited) items; only then are tasks created.
  router.post('/confirm', (req, res) => {
    const body = req.body;
    if (!body || !Array.isArray(body.items) || body.items.length === 0 || body.items.length > 100) {
      throw new ValidationError({ items: 'Provide between 1 and 100 items to save.' });
    }
    const errors = {};
    const parsed = body.items.map((raw, i) => {
      const f = new Fields(raw);
      const item = {
        title: f.str('title', { min: 1, max: 200, label: 'Title' }),
        dueDate: f.date('dueDate', { optional: true, nullable: true, label: 'Due date' }) ?? null,
        estimatedMinutes: f.int('estimatedMinutes', { min: 5, max: 1440, optional: true, label: 'Estimated minutes' }),
        priority: f.int('priority', { min: 1, max: 3, optional: true, label: 'Priority' }),
        subject: f.str('subject', { max: 80, optional: true, label: 'Subject' }),
      };
      if (Object.keys(f.errors).length) errors[`items[${i}]`] = f.errors;
      return item;
    });
    if (Object.keys(errors).length) throw new ValidationError(errors);
    const count = db.get('SELECT COUNT(*) AS n FROM tasks WHERE user_id = ?', req.user.id).n;
    if (count + parsed.length > TASK_LIMIT) throw new ValidationError({ items: `That would exceed the ${TASK_LIMIT} task limit.` });

    const ids = db.tx(() => parsed.map((p) => insertTask(db, req.user.id, p, now(), 'syllabus')));
    const tasks = ids.map((id) => toTask(db.get('SELECT * FROM tasks WHERE id = ?', id)));
    res.status(201).json({ tasks });
  });

  return router;
}
