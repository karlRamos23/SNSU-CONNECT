require('dotenv').config();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const db = require('../config/db');

// Change these before sharing the app. Run: npm run seed
const USERS = [
  { student_id: 'ADMIN-001', name: 'SNSU Administrator', email: 'admin@snsu.edu.ph', password: 'Admin@12345', role: 'admin', course: null, year: null, contact: '' },
  { student_id: '2026-00123', name: 'Juan Dela Cruz', email: 'juan.delacruz@snsu.edu.ph', password: 'Student@12345', role: 'student', course: 'BSCS - Bachelor of Science in Computer Science', year: 4, contact: '' },
];

const ins = db.prepare('INSERT OR IGNORE INTO users (student_id, name, email, password_hash, role, course, year_level, contact) VALUES (?,?,?,?,?,?,?,?)');
for (const u of USERS) ins.run(u.student_id, u.name, u.email, bcrypt.hashSync(u.password, 10), u.role, u.course, u.year, u.contact);

if (db.prepare('SELECT COUNT(*) AS c FROM events').get().c === 0) {
  const H = 36e5, n = Date.now();
  const adminId = db.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").get().id;
  const ev = db.prepare('INSERT INTO events (title, venue, start_at, end_at, capacity, qr_code, created_by) VALUES (?,?,?,?,?,?,?)');
  [
    ['SNSU IT Seminar 2026', 'SNSU Auditorium', n - H, n + 2 * H, 300],
    ['Student Leadership Workshop', 'College Auditorium', n + 26 * H, n + 30 * H, 150],
    ['Campus Sports Festival', 'SNSU Sports Complex', n + 50 * H, n + 58 * H, 500],
    ['Research Innovation Forum', 'AVR Hall', n - 50 * H, n - 46 * H, 200],
  ].forEach(([t, v, s, e, c]) => ev.run(t, v, s, e, c, crypto.randomBytes(8).toString('hex'), adminId));
}

console.log('Seed done. Sign in with:');
USERS.forEach((u) => console.log(`  ${u.role}: ${u.email} / ${u.password}`));
