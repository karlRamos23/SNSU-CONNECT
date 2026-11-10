const db = require('../config/db');

const MAX_OFF = 10080; // 7 days, in minutes
const DAY = 864e5;
class VErr extends Error {}

const normOffsets = (arr, force0) => {
  let x = Array.isArray(arr) ? arr : [];
  x = [...new Set(x.map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= MAX_OFF))];
  if (force0 && !x.includes(0)) x.push(0);
  return x.sort((a, b) => b - a).slice(0, 6);
};
const parseOff = (s) => { try { return normOffsets(JSON.parse(s)); } catch (e) { return []; } };
const statusOf = (r) => (r.completed_at ? 'Completed' : r.due_at < Date.now() ? 'Overdue' : 'Upcoming');
const pub = (r) => ({
  id: r.id, title: r.title, notes: r.notes || '', due_at: r.due_at,
  offsets: parseOff(r.offsets).filter((o) => o > 0), completed_at: r.completed_at, status: statusOf(r),
});

function getPrefs(userId) {
  const p = db.prepare('SELECT auto_events, offsets FROM reminder_prefs WHERE user_id = ?').get(userId);
  return { auto_events: p ? p.auto_events : 1, offsets: p ? parseOff(p.offsets) : [1440, 60, 10] };
}
function setPrefs(userId, b) {
  const auto = b.auto_events ? 1 : 0;
  const offs = normOffsets(b.offsets, false);
  db.prepare(`INSERT INTO reminder_prefs (user_id, auto_events, offsets) VALUES (?,?,?)
    ON CONFLICT(user_id) DO UPDATE SET auto_events = excluded.auto_events, offsets = excluded.offsets`)
    .run(userId, auto, JSON.stringify(offs));
  return getPrefs(userId);
}

function fields(b, partial) {
  const out = {};
  if (!partial || b.title !== undefined) {
    const t = String(b.title || '').trim().slice(0, 120);
    if (!t) throw new VErr('Please enter a title.');
    out.title = t;
  }
  if (b.notes !== undefined) out.notes = String(b.notes || '').trim().slice(0, 500);
  if (!partial || b.due_at !== undefined) {
    const d = Number(b.due_at);
    if (!Number.isFinite(d) || d <= 0) throw new VErr('Please choose a valid date and time.');
    if (d > Date.now() + 5 * 365 * DAY) throw new VErr('That date is too far away.');
    out.due_at = Math.round(d);
  }
  if (b.offsets !== undefined) out.offsets = normOffsets(b.offsets, true);
  return out;
}

// Alerts whose time has already passed when a reminder is created or changed are skipped silently
function primeFired(id, due, offs) {
  const now = Date.now();
  const ins = db.prepare('INSERT OR IGNORE INTO reminder_fired (reminder_id, offset_min, fired_at) VALUES (?,?,?)');
  offs.forEach((o) => { if (due - o * 60000 <= now) ins.run(id, o, now); });
}

const list = (userId) => db.prepare('SELECT * FROM reminders WHERE user_id = ? ORDER BY due_at').all(userId).map(pub);
const getRow = (userId, id) => db.prepare('SELECT * FROM reminders WHERE id = ? AND user_id = ?').get(id, userId);

function create(userId, b) {
  const f = fields(b, false);
  if (db.prepare('SELECT COUNT(*) AS c FROM reminders WHERE user_id = ?').get(userId).c >= 500) throw new VErr('You have reached the reminder limit. Delete some old reminders first.');
  const offs = f.offsets || normOffsets(getPrefs(userId).offsets, true);
  const info = db.prepare('INSERT INTO reminders (user_id, title, notes, due_at, offsets, created_at) VALUES (?,?,?,?,?,?)')
    .run(userId, f.title, f.notes || '', f.due_at, JSON.stringify(offs), Date.now());
  primeFired(info.lastInsertRowid, f.due_at, offs);
  return pub(db.prepare('SELECT * FROM reminders WHERE id = ?').get(info.lastInsertRowid));
}

function update(userId, id, b) {
  const row = getRow(userId, id);
  if (!row) return null;
  const f = fields(b, true);
  const due = f.due_at !== undefined ? f.due_at : row.due_at;
  const offs = f.offsets !== undefined ? f.offsets : parseOff(row.offsets);
  db.prepare('UPDATE reminders SET title = ?, notes = ?, due_at = ?, offsets = ? WHERE id = ?')
    .run(f.title !== undefined ? f.title : row.title, f.notes !== undefined ? f.notes : row.notes, due, JSON.stringify(offs), id);
  if (due !== row.due_at || f.offsets !== undefined) {
    db.prepare('DELETE FROM reminder_fired WHERE reminder_id = ?').run(id);
    primeFired(id, due, offs);
  }
  return pub(db.prepare('SELECT * FROM reminders WHERE id = ?').get(id));
}

function setDone(userId, id, done) {
  const row = getRow(userId, id);
  if (!row) return null;
  db.prepare('UPDATE reminders SET completed_at = ? WHERE id = ?').run(done ? Date.now() : null, id);
  if (!done) { db.prepare('DELETE FROM reminder_fired WHERE reminder_id = ?').run(id); primeFired(id, row.due_at, parseOff(row.offsets)); }
  return pub(db.prepare('SELECT * FROM reminders WHERE id = ?').get(id));
}

const remove = (userId, id) => db.prepare('DELETE FROM reminders WHERE id = ? AND user_id = ?').run(id, userId).changes > 0;
const upcomingEvents = (n = 10) => db.prepare('SELECT title, venue, start_at, reg_deadline FROM events WHERE end_at > ? ORDER BY start_at LIMIT ?').all(Date.now(), n);

module.exports = { VErr, MAX_OFF, normOffsets, parseOff, getPrefs, setPrefs, list, create, update, setDone, remove, upcomingEvents };
