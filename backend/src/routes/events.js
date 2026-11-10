const router = require('express').Router();
const crypto = require('crypto');
const db = require('../config/db');
const { auth, admin } = require('../middleware/auth');

const status = (e) => {
  const n = Date.now();
  return n < e.start_at ? 'Upcoming' : n > e.end_at ? 'Completed' : 'Active';
};
const pub = (e) => ({
  id: e.id, title: e.title, venue: e.venue, lat: e.lat, lng: e.lng, radius_m: e.radius_m,
  start_at: e.start_at, end_at: e.end_at, capacity: e.capacity, status: status(e), reg_deadline: e.reg_deadline,
});
const num = (v) => (v === '' || v == null ? null : Number(v));

router.get('/', auth, (req, res) => {
  const students = db.prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'student'").get().c;
  const counts = Object.fromEntries(
    db.prepare("SELECT event_id, COUNT(*) AS c FROM attendance WHERE status = 'Present' GROUP BY event_id").all()
      .map((a) => [a.event_id, a.c])
  );
  const rows = db.prepare('SELECT * FROM events ORDER BY start_at').all();
  res.json(rows.map((e) => ({ ...pub(e), registered: students, attended: counts[e.id] || 0 })));
});

router.post('/', auth, admin, (req, res) => {
  const b = req.body || {};
  const title = String(b.title || '').trim().slice(0, 120);
  const venue = String(b.venue || '').trim().slice(0, 120);
  const s = Number(b.start_at), e = Number(b.end_at);
  if (!title || !venue || !Number.isFinite(s) || !Number.isFinite(e) || e <= s) {
    return res.status(400).json({ error: 'Enter a title, venue and a valid start and end time.' });
  }
  const lat = num(b.lat), lng = num(b.lng);
  const reg = b.reg_deadline == null || b.reg_deadline === '' ? null : Number(b.reg_deadline);
  if (reg !== null && (!Number.isFinite(reg) || reg > e)) {
    return res.status(400).json({ error: 'The registration deadline must be before the event ends.' });
  }
  if ((lat !== null && (!Number.isFinite(lat) || Math.abs(lat) > 90)) || (lng !== null && (!Number.isFinite(lng) || Math.abs(lng) > 180))) {
    return res.status(400).json({ error: 'Latitude or longitude is not valid.' });
  }
  const info = db
    .prepare('INSERT INTO events (title, venue, lat, lng, radius_m, start_at, end_at, capacity, qr_code, created_by, reg_deadline) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
    .run(title, venue, lat, lng, Math.max(10, Math.min(1000, parseInt(b.radius_m) || 50)), s, e,
      Math.max(1, parseInt(b.capacity) || 100), crypto.randomBytes(8).toString('hex'), req.user.id, reg);
  res.status(201).json(pub(db.prepare('SELECT * FROM events WHERE id = ?').get(info.lastInsertRowid)));
});

router.delete('/:id', auth, admin, (req, res) => {
  const r = db.prepare('DELETE FROM events WHERE id = ?').run(req.params.id);
  if (!r.changes) return res.status(404).json({ error: 'Event not found.' });
  res.json({ ok: true });
});

// The text to encode in the event QR code
router.get('/:id/qr', auth, admin, (req, res) => {
  const e = db.prepare('SELECT id, title, qr_code FROM events WHERE id = ?').get(req.params.id);
  if (!e) return res.status(404).json({ error: 'Event not found.' });
  res.json({ title: e.title, code: 'SNSU-' + e.qr_code });
});

module.exports = router;
