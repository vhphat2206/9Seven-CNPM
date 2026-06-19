/**
 * /api/notifications — in-app bell notifications
 *
 *   GET   /              list (latest 50) for current user
 *   GET   /unread-count  badge counter
 *   PATCH /:id/read      mark one as read
 *   POST  /read-all      mark all as read
 *   DELETE /:id          delete one
 */
const express = require('express');
const db = require('../db');
const { auth } = require('../middleware/auth');

const router = express.Router();

function scopeFor(req) {
  return req.user.role === 'customer'
    ? { col: 'customer_id', value: req.user.sub }
    : { col: 'user_id', value: req.user.sub };
}

router.get('/', auth(), (req, res) => {
  const { col, value } = scopeFor(req);
  const rows = db.prepare(
    `SELECT * FROM notifications WHERE ${col} = ?
     ORDER BY created_at DESC LIMIT 50`
  ).all(value);
  res.json({ data: rows });
});

router.get('/unread-count', auth(), (req, res) => {
  const { col, value } = scopeFor(req);
  const r = db.prepare(
    `SELECT COUNT(*) AS count FROM notifications WHERE ${col} = ? AND is_read = 0`
  ).get(value);
  res.json({ count: r.count });
});

router.patch('/:id/read', auth(), (req, res) => {
  const { col, value } = scopeFor(req);
  const r = db.prepare(
    `UPDATE notifications SET is_read = 1 WHERE id = ? AND ${col} = ?`
  ).run(req.params.id, value);
  if (r.changes === 0) return res.status(404).json({ error: 'Không tìm thấy' });
  res.json({ ok: true });
});

router.post('/read-all', auth(), (req, res) => {
  const { col, value } = scopeFor(req);
  db.prepare(`UPDATE notifications SET is_read = 1 WHERE ${col} = ? AND is_read = 0`).run(value);
  res.json({ ok: true });
});

router.delete('/:id', auth(), (req, res) => {
  const { col, value } = scopeFor(req);
  const r = db.prepare(`DELETE FROM notifications WHERE id = ? AND ${col} = ?`).run(req.params.id, value);
  if (r.changes === 0) return res.status(404).json({ error: 'Không tìm thấy' });
  res.json({ ok: true });
});

module.exports = router;
