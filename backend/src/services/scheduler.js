// Background scheduler: checks the database on a fixed interval and creates real notifications.
// Every alert is recorded (reminder_fired / auto_fired) so it is sent at most once.
const db = require('../config/db');
const notify = require('./notify');
const { parseOff, MAX_OFF } = require('./reminders');

const MIN = 6e4, GRACE = 24 * 36e5;
const state = { lastRun: null, lastError: null, running: false, intervalSec: 30, started: false };

function human(ms) {
  const m = Math.round(Math.abs(ms) / MIN);
  if (m < 1) return 'less than a minute';
  if (m < 120) return `${m} minute${m === 1 ? '' : 's'}`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} hours`;
  return `${Math.round(h / 24)} days`;
}

function tickReminders(now, out) {
  const rows = db.prepare('SELECT * FROM reminders WHERE completed_at IS NULL AND due_at <= ? AND due_at >= ?').all(now + MAX_OFF * MIN, now - GRACE);
  const firedQ = db.prepare('SELECT offset_min FROM reminder_fired WHERE reminder_id = ?');
  const mark = db.prepare('INSERT OR IGNORE INTO reminder_fired (reminder_id, offset_min, fired_at) VALUES (?,?,?)');
  for (const r of rows) {
    const done = new Set(firedQ.all(r.id).map((x) => x.offset_min));
    const offs = parseOff(r.offsets);
    if (!offs.includes(0)) offs.push(0);
    const due = offs.filter((o) => !done.has(o) && r.due_at - o * MIN <= now);
    if (!due.length) continue;
    const rem = r.due_at - now;
    const title = rem > 30000 ? `Reminder: ${r.title}` : `Due now: ${r.title}`;
    const body = rem > 30000 ? `Due in ${human(rem)}.` : rem > -MIN ? 'Due now.' : `Was due ${human(rem)} ago.`;
    const id = db.transaction(() => {
      due.forEach((o) => mark.run(r.id, o, now));
      return notify.create(r.user_id, { title, body, kind: 'reminder', reminder_id: r.id });
    })();
    out.push({ userId: r.user_id, id, payload: { title, body, tag: 'rem-' + r.id, url: '/' } });
  }
}

function tickEvents(now, out) {
  const win = now + MAX_OFF * MIN;
  const evs = db.prepare('SELECT id, title, start_at, reg_deadline FROM events WHERE (start_at > ? AND start_at <= ?) OR (reg_deadline > ? AND reg_deadline <= ?)').all(now, win, now, win);
  if (!evs.length) return;
  const students = db.prepare("SELECT u.id, COALESCE(p.auto_events, 1) AS auto, p.offsets AS offs FROM users u LEFT JOIN reminder_prefs p ON p.user_id = u.id WHERE u.role = 'student'").all();
  const ids = evs.map((e) => e.id), ph = ids.map(() => '?').join(',');
  const fired = new Set(db.prepare(`SELECT user_id, event_id, kind, offset_min FROM auto_fired WHERE event_id IN (${ph})`).all(...ids).map((r) => `${r.user_id}|${r.event_id}|${r.kind}|${r.offset_min}`));
  const present = new Set(db.prepare(`SELECT user_id, event_id FROM attendance WHERE status = 'Present' AND event_id IN (${ph})`).all(...ids).map((r) => `${r.user_id}|${r.event_id}`));
  const mark = db.prepare('INSERT OR IGNORE INTO auto_fired (user_id, event_id, kind, offset_min, fired_at) VALUES (?,?,?,?,?)');
  for (const s of students) {
    if (!s.auto) continue;
    const offs = s.offs ? parseOff(s.offs) : [1440, 60, 10];
    if (!offs.length) continue;
    for (const e of evs) {
      if (present.has(`${s.id}|${e.id}`)) continue;
      for (const [kind, at] of [['event', e.start_at], ['deadline', e.reg_deadline]]) {
        if (!at || at <= now || at - MAX_OFF * MIN > now) continue;
        const due = offs.filter((o) => !fired.has(`${s.id}|${e.id}|${kind}|${o}`) && at - o * MIN <= now);
        if (!due.length) continue;
        const rem = at - now;
        const title = kind === 'event' ? `Upcoming event: ${e.title}` : `Registration closing: ${e.title}`;
        const body = kind === 'event' ? `Starts in ${human(rem)}.` : `Registration closes in ${human(rem)}.`;
        const id = db.transaction(() => {
          due.forEach((o) => { mark.run(s.id, e.id, kind, o, now); fired.add(`${s.id}|${e.id}|${kind}|${o}`); });
          return notify.create(s.id, { title, body, kind, event_id: e.id });
        })();
        out.push({ userId: s.id, id, payload: { title, body, tag: `ev-${e.id}-${kind}`, url: '/' } });
      }
    }
  }
}

async function run() {
  if (state.running) return;
  state.running = true;
  try {
    const now = Date.now(), out = [];
    tickReminders(now, out);
    tickEvents(now, out);
    state.lastRun = now; state.lastError = null;
    for (const p of out) await notify.push(p.userId, p.id, p.payload);
  } catch (e) {
    state.lastError = String(e.message || e);
    console.error('[scheduler]', e);
  } finally { state.running = false; }
}

function start() {
  if (state.started) return;
  state.started = true;
  state.intervalSec = Math.max(10, parseInt(process.env.SCHEDULER_SECONDS) || 30);
  run();
  setInterval(run, state.intervalSec * 1000);
  console.log(`[scheduler] checking reminders every ${state.intervalSec}s. Web push: ${notify.pushEnabled ? 'ON' : 'OFF (no VAPID keys)'}`);
}

module.exports = { start, run, state };
