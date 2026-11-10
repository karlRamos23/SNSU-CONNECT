const router = require('express').Router();
const { auth } = require('../middleware/auth');
const A = require('../services/assistant');
const { VErr } = require('../services/reminders');

router.use(auth);

// Simple per-user rate limit: 20 messages per minute
const hits = new Map();
function limited(uid) {
  const now = Date.now(), list = (hits.get(uid) || []).filter((t) => now - t < 60000);
  list.push(now); hits.set(uid, list);
  return list.length > 20;
}

router.get('/mode', (req, res) => res.json({ mode: A.mode() }));

router.post('/', async (req, res) => {
  if (limited(req.user.id)) return res.status(429).json({ error: 'You are sending messages too fast. Please wait a moment.' });
  const off = Number((req.body || {}).tzOffsetMin);
  const offset = Number.isFinite(off) && Math.abs(off) <= 840 ? Math.round(off) : 480;
  try {
    res.json(await A.chat(req.user, (req.body || {}).messages, offset));
  } catch (e) {
    if (e instanceof VErr) return res.status(400).json({ error: e.message });
    console.error('[assistant]', e);
    res.status(500).json({ error: 'The assistant had a problem. Please try again.' });
  }
});

module.exports = router;
