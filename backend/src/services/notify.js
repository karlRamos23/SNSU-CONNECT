// Creates in-app notifications and (when configured) sends real Web Push messages.
const db = require('../config/db');

let webpush = null;
try { webpush = require('web-push'); } catch (e) { /* web-push not installed: push stays off */ }
const publicKey = process.env.VAPID_PUBLIC_KEY || '';
const pushEnabled = !!(webpush && publicKey && process.env.VAPID_PRIVATE_KEY);
if (pushEnabled) webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:admin@example.com', publicKey, process.env.VAPID_PRIVATE_KEY);

const subsFor = (userId) => db.prepare('SELECT * FROM push_subscriptions WHERE user_id = ?').all(userId);

function create(userId, { title, body, kind, reminder_id = null, event_id = null }) {
  const hasSubs = pushEnabled && subsFor(userId).length > 0;
  return db.prepare('INSERT INTO notifications (user_id, title, body, kind, reminder_id, event_id, created_at, push_status) VALUES (?,?,?,?,?,?,?,?)')
    .run(userId, title, body, kind, reminder_id, event_id, Date.now(), hasSubs ? 'pending' : 'none').lastInsertRowid;
}

async function sendAll(userId, payload) {
  let sent = 0, failed = 0;
  for (const s of subsFor(userId)) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { TTL: 3600 });
      sent++;
    } catch (e) {
      failed++;
      if (e.statusCode === 404 || e.statusCode === 410) db.prepare('DELETE FROM push_subscriptions WHERE id = ?').run(s.id);
      else console.error('[push]', e.statusCode || e.message);
    }
  }
  return { sent, failed };
}

async function push(userId, notifId, payload) {
  if (!pushEnabled) return;
  const r = await sendAll(userId, payload);
  if (r.sent + r.failed === 0) return;
  db.prepare('UPDATE notifications SET push_status = ? WHERE id = ?').run(r.sent ? 'sent' : 'failed', notifId);
}

async function testPush(userId) {
  if (!pushEnabled) return { total: 0, sent: 0, failed: 0 };
  const total = subsFor(userId).length;
  const r = await sendAll(userId, { title: 'SNSU Connects test', body: 'If you can read this, push notifications work on this device.', tag: 'test', url: '/' });
  return { total, ...r };
}

module.exports = { pushEnabled, publicKey, create, push, testPush };
