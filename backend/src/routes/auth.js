const { OAuth2Client } = require('google-auth-library');
const router = require('express').Router();
const bcrypt = require('bcryptjs');
const db = require('../config/db');
const { sign, auth } = require('../middleware/auth');

const COLS = 'id, student_id, name, email, role, course, year_level, contact, photo';
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// LOGIN
router.post('/login', (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');

  if (!email || !password) {
    return res.status(400).json({
      error: 'Enter your email and password to continue.'
    });
  }

  const u = db.prepare(
    'SELECT * FROM users WHERE email = ?'
  ).get(email);

  if (!u || !bcrypt.compareSync(password, u.password_hash)) {
    return res.status(401).json({
      error: 'Incorrect email or password.'
    });
  }

  const user = db.prepare(
    `SELECT ${COLS} FROM users WHERE id = ?`
  ).get(u.id);

  res.json({
    token: sign(u),
    user
  });
});

// REGISTER STUDENT
router.post('/register', (req, res) => {
  const student_id = String(req.body.student_id || '')
    .trim().slice(0, 30);

  const name = String(req.body.name || '')
    .trim().slice(0, 100);

  const email = String(req.body.email || '')
    .trim().toLowerCase().slice(0, 120);

  const password = String(req.body.password || '');

  if (!student_id || !name || !EMAIL.test(email)) {
    return res.status(400).json({
      error: 'Enter your student ID, name and a valid email.'
    });
  }

  if (password.length < 8) {
    return res.status(400).json({
      error: 'Password must be at least 8 characters.'
    });
  }

  const clash = db.prepare(
    'SELECT 1 FROM users WHERE email = ? OR student_id = ?'
  ).get(email, student_id);

  if (clash) {
    return res.status(409).json({
      error: 'That email or student ID is already registered.'
    });
  }

  const info = db.prepare(
    "INSERT INTO users (student_id, name, email, password_hash, role) VALUES (?, ?, ?, ?, 'student')"
  ).run(
    student_id,
    name,
    email,
    bcrypt.hashSync(password, 10)
  );

  const user = db.prepare(
    `SELECT ${COLS} FROM users WHERE id = ?`
  ).get(info.lastInsertRowid);

  res.status(201).json({
    token: sign(user),
    user
  });
});


/* ==========================================
   GOOGLE SIGN-IN
   POST /api/auth/google
   ========================================== */

const googleClient = new OAuth2Client();

// GOOGLE LOGIN
router.post('/google', async (req, res) => {
  try {
    const credential = req.body?.credential;

    if (
      typeof credential !== 'string' ||
      !credential ||
      credential.length > 10000
    ) {
      return res.status(400).json({
        error: 'Google credential is missing or invalid.'
      });
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;

    if (!clientId) {
      console.error('GOOGLE_CLIENT_ID is not configured.');

      return res.status(503).json({
        error: 'Google Sign-In is not configured.'
      });
    }

    // Verify the credential with Google's library
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: clientId
    });

    const payload = ticket.getPayload();

    if (
      !payload ||
      !payload.sub ||
      payload.email_verified !== true ||
      !payload.email
    ) {
      return res.status(401).json({
        error: 'Your Google account could not be verified.'
      });
    }

    const email = payload.email.trim().toLowerCase();

    // Email-only matching is restricted to accounts
    // where Google is authoritative for the email.
    const googleOwnsEmail =
      email.endsWith('@gmail.com') ||
      (typeof payload.hd === 'string' && !!payload.hd);

    if (!googleOwnsEmail) {
      return res.status(403).json({
        error:
          'This email requires secure account linking. ' +
          'Please sign in with your existing password.'
      });
    }

    // Student must already have an SNSU Connects account
    const existingUser = db.prepare(
      'SELECT * FROM users WHERE email = ?'
    ).get(email);

    if (!existingUser) {
      return res.status(404).json({
        error:
          'No SNSU Connects account is registered with ' +
          'this Google email. Please register first.'
      });
    }

    // Do not automatically link administrator accounts
    if (existingUser.role !== 'student') {
      return res.status(403).json({
        error:
          'Google Sign-In is currently available ' +
          'for student accounts only.'
      });
    }

    // Retrieve the existing safe user fields
    const user = db.prepare(
      `SELECT ${COLS} FROM users WHERE id = ?`
    ).get(existingUser.id);

    return res.json({
      token: sign(existingUser),
      user
    });

  } catch (error) {
    console.error(
      'Google Sign-In verification failed:',
      error.message
    );

    return res.status(401).json({
      error:
        'Google authentication failed. ' +
        'Please try again.'
    });
  }
});

// GET CURRENT USER
router.get('/me', auth, (req, res) => {
  res.json(req.user);
});

module.exports = router;
