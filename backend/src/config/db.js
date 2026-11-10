const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(process.env.DB_FILE || path.join(__dirname, '..', '..', 'data.sqlite'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('student','admin')),
  course TEXT,
  year_level INTEGER,
  contact TEXT,
  photo TEXT,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  venue TEXT NOT NULL,
  lat REAL,
  lng REAL,
  radius_m INTEGER NOT NULL DEFAULT 50,
  start_at INTEGER NOT NULL,
  end_at INTEGER NOT NULL,
  capacity INTEGER NOT NULL DEFAULT 100,
  qr_code TEXT UNIQUE NOT NULL,
  created_by INTEGER REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS attendance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('Present','Failed')),
  kind TEXT,
  reason TEXT,
  distance_m INTEGER,
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS one_present ON attendance(user_id, event_id) WHERE status = 'Present';
CREATE INDEX IF NOT EXISTS att_event ON attendance(event_id);
`);

db.exec(`
CREATE TABLE IF NOT EXISTS reminders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  notes TEXT,
  due_at INTEGER NOT NULL,
  offsets TEXT NOT NULL DEFAULT '[0]',
  completed_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS rem_user ON reminders(user_id, due_at);
CREATE TABLE IF NOT EXISTS reminder_fired (
  reminder_id INTEGER NOT NULL REFERENCES reminders(id) ON DELETE CASCADE,
  offset_min INTEGER NOT NULL,
  fired_at INTEGER NOT NULL,
  PRIMARY KEY (reminder_id, offset_min)
);
CREATE TABLE IF NOT EXISTS auto_fired (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  offset_min INTEGER NOT NULL,
  fired_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, event_id, kind, offset_min)
);
CREATE TABLE IF NOT EXISTS reminder_prefs (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  auto_events INTEGER NOT NULL DEFAULT 1,
  offsets TEXT NOT NULL DEFAULT '[1440,60,10]'
);
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT,
  kind TEXT NOT NULL,
  reminder_id INTEGER,
  event_id INTEGER,
  created_at INTEGER NOT NULL,
  read_at INTEGER,
  push_status TEXT NOT NULL DEFAULT 'none'
);
CREATE INDEX IF NOT EXISTS notif_user ON notifications(user_id, created_at DESC);
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT UNIQUE NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
`);
// Adds the optional registration deadline to events created before this feature existed
if (!db.prepare('PRAGMA table_info(events)').all().some((c) => c.name === 'reg_deadline')) {
  db.exec('ALTER TABLE events ADD COLUMN reg_deadline INTEGER');
}

module.exports = db;
