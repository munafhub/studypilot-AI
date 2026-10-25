import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

// node:sqlite is built into Node >= 22.5 (no flag needed from 22.13).
// Loaded through createRequire so bundlers/test runners do not try to resolve it.
const require = createRequire(import.meta.url);

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  availability TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  subject TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  due_date TEXT,
  estimated_minutes INTEGER NOT NULL DEFAULT 60,
  minutes_done INTEGER NOT NULL DEFAULT 0,
  priority INTEGER NOT NULL DEFAULT 2,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','done')),
  completed_at TEXT,
  source TEXT NOT NULL DEFAULT 'manual',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tasks_user ON tasks(user_id, status);
CREATE TABLE IF NOT EXISTS plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scope TEXT NOT NULL CHECK (scope IN ('daily','weekly')),
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft','active','superseded','rejected')),
  source TEXT NOT NULL DEFAULT 'scheduler',
  summary TEXT NOT NULL DEFAULT '',
  warnings TEXT NOT NULL DEFAULT '[]',
  replaces_plan_id INTEGER,
  base_stamp TEXT,
  created_at TEXT NOT NULL,
  approved_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_plans_user ON plans(user_id, status);
CREATE TABLE IF NOT EXISTS plan_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_id INTEGER NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  minutes INTEGER NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','done','missed')),
  carried_from INTEGER
);
CREATE INDEX IF NOT EXISTS idx_sessions_plan ON plan_sessions(plan_id);
`;

export function openDatabase(file = ':memory:') {
  const { DatabaseSync } = require('node:sqlite');
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const raw = new DatabaseSync(file);
  raw.exec('PRAGMA foreign_keys = ON');
  if (file !== ':memory:') raw.exec('PRAGMA journal_mode = WAL');
  raw.exec(SCHEMA);

  return {
    raw,
    get(sql, ...params) {
      const row = raw.prepare(sql).get(...params);
      return row ? { ...row } : null;
    },
    all(sql, ...params) {
      return raw.prepare(sql).all(...params).map((r) => ({ ...r }));
    },
    run(sql, ...params) {
      const r = raw.prepare(sql).run(...params);
      return { changes: Number(r.changes), lastInsertRowid: Number(r.lastInsertRowid) };
    },
    /** Run fn inside a transaction (no nesting). */
    tx(fn) {
      raw.exec('BEGIN');
      try {
        const out = fn();
        raw.exec('COMMIT');
        return out;
      } catch (err) {
        raw.exec('ROLLBACK');
        throw err;
      }
    },
    close() {
      raw.close();
    },
  };
}
