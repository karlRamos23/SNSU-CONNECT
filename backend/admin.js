
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');

const db = new Database(
  path.join(__dirname, 'data.sqlite')
);

const email = 'admin.demo@snsu.edu.ph';
const password = 'SNSUdemo@2026';

try {
  const user = db.prepare(
    'SELECT id FROM users WHERE email = ?'
  ).get(email);

  if (!user) {
    console.log('Admin account not found. Register it first.');
    process.exitCode = 1;
  } else {
    const passwordHash = bcrypt.hashSync(password, 10);

    db.prepare(`
      UPDATE users
      SET role = 'admin', password_hash = ?
      WHERE email = ?
    `).run(passwordHash, email);

    console.log('\nAdmin demo account is ready!');
    console.log('Email:', email);
    console.log('Password:', password);
    console.log('Role: admin');
  }
} finally {
  db.close();
}
