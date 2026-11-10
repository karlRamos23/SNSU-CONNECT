const router = require('express').Router();
const db = require('../config/db');
const { auth } = require('../middleware/auth');
const notify = require('../services/notify');
const scheduler = require('../services/scheduler');

router.use(auth);

const unreadCount = (uid) => db.prepare('SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND read_at IS NULL').get(uid).c;

router.get('/', (req, res) => {
  const items = db.prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 100').all(req.user.id);
  res.json({ items, unread: unreadCount(req.user.id) });
});

router.get('/unread', (req, res) => {
  const latest = db.prepare('SELECT id, title, body FROM notifications WHERE user_id = ? AND read_at IS NULL ORDER BY id DESC LIMIT 5').all(req.user.id);
  res.json({ count: unreadCount(req.user.id), latest });
});

router.get('/config', (req, res) => {
  const st = scheduler.state;
  res.json({
    pushEnabled: notify.pushEnabled,
    publicKey: notify.pushEnabled ? notify.publicKey : null,
    subscribedDevices: db.prepare('SELECT COUNT(*) AS c FROM push_subscriptions WHERE user_id = ?').get(req.user.id).c,
    scheduler: { lastRun: st.lastRun, intervalSec: st.intervalSec, error: st.lastError },
  });
});

router.post('/read', (req, res) => {
  const b = req.body || {};
  if (b.all) db.prepare('UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL').run(Date.now(), req.user.id);
  else if (Array.isArray(b.ids)) {
    const u = db.prepare('UPDATE notifications SET read_at = ? WHERE id = ? AND user_id = ? AND read_at IS NULL');
    b.ids.slice(0, 100).forEach((id) => u.run(Date.now(), parseInt(id, 10), req.user.id));
  }
  res.json({ unread: unreadCount(req.user.id) });
});

router.post('/push/subscribe', (req, res) => {
  if (!notify.pushEnabled) return res.status(400).json({ error: 'Push notifications are not set up on the server.' });
  const b = req.body || {}, k = b.keys || {};
  if (typeof b.endpoint !== 'string' || !/^https:\/\//.test(b.endpoint) || b.endpoint.length > 1000 || typeof k.p256dh !== 'string' || typeof k.auth !== 'string') {
    return res.status(400).json({ error: 'Invalid push subscription.' });
  }
  db.prepare(`INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, created_at) VALUES (?,?,?,?,?)
    ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth`)
    .run(req.user.id, b.endpoint, k.p256dh, k.auth, Date.now());
  res.status(201).json({ ok: true });
});

router.post('/push/unsubscribe', (req, res) => {
  db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?').run(String((req.body || {}).endpoint || ''), req.user.id);
  res.json({ ok: true });
});

router.post('/push/test', async (req, res, next) => {
  try {
    if (!notify.pushEnabled) return res.status(400).json({ error: 'Push notifications are not set up on the server.' });
    res.json(await notify.testPush(req.user.id));
  } catch (e) { next(e); }
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM notifications WHERE id = ? AND user_id = ?').run(parseInt(req.params.id, 10), req.user.id);
  res.json({ unread: unreadCount(req.user.id) });
});

module.exports = router;
