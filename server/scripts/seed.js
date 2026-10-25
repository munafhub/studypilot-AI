// Creates a demo account with realistic tasks:  demo@studypilot.test / demo12345
import { loadConfig } from '../src/config.js';
import { openDatabase } from '../src/db.js';
import { hashPassword } from '../src/security.js';
import { insertTask } from '../src/routes/tasks.js';
import { DEFAULT_AVAILABILITY } from '../src/services/scheduler.js';
import { addDays, fmt } from '../src/utils/dates.js';

const config = loadConfig();
const db = openDatabase(config.dbPath);
const email = 'demo@studypilot.test';

if (db.get('SELECT id FROM users WHERE email = ?', email)) {
  console.log(`Demo user already exists (${email}).`);
  db.close();
  process.exit(0);
}

const now = new Date();
const today = fmt(now);
const { lastInsertRowid: userId } = db.run(
  'INSERT INTO users (email, name, password_hash, availability, created_at) VALUES (?, ?, ?, ?, ?)',
  email, 'Demo Student', await hashPassword('demo12345'),
  JSON.stringify({ ...DEFAULT_AVAILABILITY, sat: 180, sun: 60 }), now.toISOString(),
);

const tasks = [
  { title: 'Read chapters 4-5', subject: 'Biology', dueDate: addDays(today, 2), estimatedMinutes: 120, priority: 2 },
  { title: 'Lab report draft', subject: 'Biology', dueDate: addDays(today, 5), estimatedMinutes: 180, priority: 3 },
  { title: 'Problem set 6', subject: 'Calculus', dueDate: addDays(today, 3), estimatedMinutes: 90, priority: 2 },
  { title: 'Midterm revision', subject: 'Calculus', dueDate: addDays(today, 9), estimatedMinutes: 300, priority: 3 },
  { title: 'Essay outline', subject: 'History', dueDate: addDays(today, 4), estimatedMinutes: 60, priority: 1 },
];
for (const t of tasks) insertTask(db, userId, t, now);

console.log(`Created ${email} / demo12345 with ${tasks.length} tasks. Database: ${config.dbPath}`);
db.close();
