const jwt = require('jsonwebtoken');
const db = require('../config/db');

const SECRET = process.env.JWT_SECRET;
if (!SECRET || SECRET.length < 16) {
  throw new Error('Set a JWT_SECRET of at least 16 characters in your .env file');
}

const sign = (user) => jwt.sign({ id: user.id }, SECRET, { expiresIn: '7d' });

function auth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  try {
    const p = jwt.verify(token, SECRET);
    const u = db
      .prepare('SELECT id, student_id, name, email, role, course, year_level, contact, photo FROM users WHERE id = ?')
      .get(p.id);
    if (!u) throw new Error('no user');
    req.user = u;
    next();
  } catch (e) {
    res.status(401).json({ error: 'Please sign in again' });
  }
}

const admin = (req, res, next) =>
  req.user.role === 'admin' ? next() : res.status(403).json({ error: 'Admins only' });

module.exports = { sign, auth, admin };
