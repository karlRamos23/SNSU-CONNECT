const router = require('express').Router();
const db = require('../config/db');
const { auth } = require('../middleware/auth');

const COLS = 'id, student_id, name, email, role, course, year_level, contact, photo';

router.put('/me', auth, (req, res) => {
  const b = req.body || {};
  const name = String(b.name || '').trim().slice(0, 100);
  if (!name) return res.status(400).json({ error: 'Name is required.' });
  const contact = String(b.contact || '').trim().slice(0, 30);
  const course = String(b.course || '').trim().slice(0, 120);
  const yl = parseInt(b.year_level);
  const year = yl >= 1 && yl <= 6 ? yl : null;
  db.prepare('UPDATE users SET name = ?, contact = ?, course = COALESCE(NULLIF(?, \'\'), course), year_level = COALESCE(?, year_level) WHERE id = ?')
    .run(name, contact, course, year, req.user.id);
  res.json(db.prepare(`SELECT ${COLS} FROM users WHERE id = ?`).get(req.user.id));
});

router.put('/me/photo', auth, (req, res) => {
  const photo = req.body.photo;
  if (photo === null) {
    db.prepare('UPDATE users SET photo = NULL WHERE id = ?').run(req.user.id);
  } else {
    if (typeof photo !== 'string' || photo.length > 400000 || !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(photo)) {
      return res.status(400).json({ error: 'Upload a JPG, PNG or WebP image.' });
    }
    db.prepare('UPDATE users SET photo = ? WHERE id = ?').run(photo, req.user.id);
  }
  res.json(db.prepare(`SELECT ${COLS} FROM users WHERE id = ?`).get(req.user.id));
});

module.exports = router;
