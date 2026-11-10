const router = require('express').Router();
const { auth } = require('../middleware/auth');
const R = require('../services/reminders');

router.use(auth);

const wrap = (fn) => (req, res) => {
  try { fn(req, res); }
  catch (e) {
    if (e instanceof R.VErr) return res.status(400).json({ error: e.message });
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
};
const idOf = (req) => parseInt(req.params.id, 10);

router.get('/', wrap((req, res) => res.json({ reminders: R.list(req.user.id), prefs: R.getPrefs(req.user.id) })));
router.put('/prefs', wrap((req, res) => res.json(R.setPrefs(req.user.id, req.body || {}))));
router.post('/', wrap((req, res) => res.status(201).json(R.create(req.user.id, req.body || {}))));
router.put('/:id', wrap((req, res) => {
  const r = R.update(req.user.id, idOf(req), req.body || {});
  r ? res.json(r) : res.status(404).json({ error: 'Reminder not found.' });
}));
router.post('/:id/complete', wrap((req, res) => {
  const r = R.setDone(req.user.id, idOf(req), (req.body || {}).done !== false);
  r ? res.json(r) : res.status(404).json({ error: 'Reminder not found.' });
}));
router.delete('/:id', wrap((req, res) => {
  R.remove(req.user.id, idOf(req)) ? res.json({ ok: true }) : res.status(404).json({ error: 'Reminder not found.' });
}));

module.exports = router;
