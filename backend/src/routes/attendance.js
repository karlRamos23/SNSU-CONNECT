const router = require('express').Router();
const db = require('../config/db');
const { auth, admin } = require('../middleware/auth');

const status = (e) => {
  const n = Date.now();
  return n < e.start_at ? 'Upcoming' : n > e.end_at ? 'Completed' : 'Active';
};
const pub = (e) => e && ({ id: e.id, title: e.title, venue: e.venue, radius_m: e.radius_m, start_at: e.start_at, end_at: e.end_at });

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000, rad = (d) => (d * Math.PI) / 180;
  const a = Math.sin(rad(lat2 - lat1) / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lon2 - lon1) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Student check-in: verifies QR, event, time and location, then records the result
router.post('/scan', auth, (req, res) => {
  if (req.user.role !== 'student') return res.status(403).json({ error: 'Only students can check in.' });
  const now = Date.now();
  const code = String(req.body.code || '').trim().replace(/^SNSU-/i, '');
  const ev = code ? db.prepare('SELECT * FROM events WHERE qr_code = ?').get(code) : null;
  const out = (st, reason, steps, distance = null) =>
    res.json({ status: st, reason, steps, distance, event: pub(ev), ts: now });
  const fail = (kind, reason, steps, distance = null) => {
    db.prepare("INSERT INTO attendance (user_id, event_id, status, kind, reason, distance_m, created_at) VALUES (?,?,'Failed',?,?,?,?)")
      .run(req.user.id, ev.id, kind, reason, distance, now);
    return out('Failed', reason, steps, distance);
  };

  if (!ev) return out('Failed', 'Invalid QR code.', ['no', '-', '-', '-', 'no']);
  if (db.prepare("SELECT 1 FROM attendance WHERE user_id = ? AND event_id = ? AND status = 'Present'").get(req.user.id, ev.id)) {
    return out('Failed', 'You already checked in to this event.', ['ok', 'ok', 'no', '-', 'no']);
  }
  const s = status(ev);
  if (s === 'Upcoming') return fail('early', 'This event has not opened yet. Scan again when it starts.', ['ok', 'ok', 'no', '-', 'no']);
  if (s === 'Completed') return fail('expired', 'This event has ended. The QR code is expired.', ['ok', 'ok', 'no', '-', 'no']);

  let distance = null;
  if (ev.lat != null && ev.lng != null && process.env.SKIP_GEOFENCE !== 'true') {
    const { lat, lng } = req.body;
    if (typeof lat !== 'number' || typeof lng !== 'number') {
      return fail('location', 'Location unavailable. Allow location access and try again.', ['ok', 'ok', 'ok', 'no', 'no']);
    }
    distance = Math.round(haversine(lat, lng, ev.lat, ev.lng));
    if (distance > ev.radius_m) {
      return fail('location', `You are outside the ${ev.radius_m} m venue range.`, ['ok', 'ok', 'ok', 'no', 'no'], distance);
    }
  }
  db.prepare("INSERT INTO attendance (user_id, event_id, status, distance_m, created_at) VALUES (?,?,'Present',?,?)")
    .run(req.user.id, ev.id, distance, now);
  out('Present', '', ['ok', 'ok', 'ok', 'ok', 'ok'], distance);
});

router.get('/mine', auth, (req, res) => {
  res.json(db.prepare(`SELECT a.id, a.event_id, e.title, a.status, a.reason, a.distance_m, a.created_at
    FROM attendance a JOIN events e ON e.id = a.event_id WHERE a.user_id = ? ORDER BY a.created_at DESC`).all(req.user.id));
});

function report(id) {
  const ev = db.prepare('SELECT * FROM events WHERE id = ?').get(id);
  if (!ev) return null;
  const registered = db.prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'student'").get().c;
  const attendees = db.prepare(`SELECT u.name, u.student_id, a.created_at, a.distance_m
    FROM attendance a JOIN users u ON u.id = a.user_id
    WHERE a.event_id = ? AND a.status = 'Present' ORDER BY a.created_at DESC`).all(id);
  const kinds = Object.fromEntries(db.prepare("SELECT kind, COUNT(*) AS c FROM attendance WHERE event_id = ? AND status = 'Failed' GROUP BY kind").all(id).map((r) => [r.kind, r.c]));
  return {
    event: { ...pub(ev), capacity: ev.capacity, status: status(ev) },
    registered, attended: attendees.length,
    rate: registered ? Math.round((attendees.length / registered) * 100) : 0,
    failedLocation: kinds.location || 0,
    failedExpired: (kinds.expired || 0) + (kinds.early || 0),
    attendees,
  };
}

router.get('/event/:id', auth, admin, (req, res) => {
  const r = report(req.params.id);
  r ? res.json(r) : res.status(404).json({ error: 'Event not found.' });
});

const cell = (v) => {
  let s = String(v ?? '');
  if (/^[=+\-@]/.test(s)) s = "'" + s; // stop spreadsheet formula injection
  return '"' + s.replace(/"/g, '""') + '"';
};
router.get('/event/:id/csv', auth, admin, (req, res) => {
  const r = report(req.params.id);
  if (!r) return res.status(404).json({ error: 'Event not found.' });
  const rows = [['Student ID', 'Name', 'Checked in', 'Distance (m)']]
    .concat(r.attendees.map((a) => [a.student_id, a.name, new Date(a.created_at).toISOString(), a.distance_m ?? '']));
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="attendance-${r.event.id}.csv"`);
  res.send(rows.map((x) => x.map(cell).join(',')).join('\r\n'));
});

module.exports = router;
