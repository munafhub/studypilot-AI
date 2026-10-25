import express from 'express';
import { Fields, parseAvailability } from '../utils/validate.js';

export function settingsRoutes({ db }) {
  const router = express.Router();

  router.get('/', (req, res) => {
    res.json({ name: req.user.name, email: req.user.email, availability: req.user.availability });
  });

  router.put('/', (req, res) => {
    const f = new Fields(req.body);
    const name = f.str('name', { min: 1, max: 80, optional: true, label: 'Name' });
    f.done();
    const availability = req.body.availability !== undefined ? parseAvailability(req.body.availability, req.user.availability) : req.user.availability;
    db.run('UPDATE users SET name = ?, availability = ? WHERE id = ?', name ?? req.user.name, JSON.stringify(availability), req.user.id);
    res.json({ name: name ?? req.user.name, email: req.user.email, availability });
  });

  return router;
}
