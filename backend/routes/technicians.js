/**
 * /api/technicians — KTV directory
 *
 *   GET  /                 list all
 *   GET  /:id              detail + active tickets + performance
 *   POST /                 create
 *   PUT  /:id              update
 *   GET  /:id/workload     active tickets count + breakdown
 */
const express = require('express');
const bcrypt  = require('bcryptjs');
const db = require('../db');
const { auth } = require('../middleware/auth');

const router = express.Router();

/* Đổi tên VN có dấu → slug ASCII không dấu, viết liền, lowercase.
   "Minh Triết" → "minhtriet", "Trần Văn A" → "tranvana" */
function nameToSlug(name) {
  return String(name || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')   /* strip combining diacritics */
    .replace(/đ/gi, 'd')
    .replace(/[^a-zA-Z0-9]/g, '')                       /* drop spaces + symbols */
    .toLowerCase();
}

/* Tạo username unique — nếu đã trùng, thêm số đếm: minhtriet → minhtriet2 → minhtriet3 */
function uniqueUsername(base) {
  let candidate = base;
  let n = 1;
  while (db.prepare('SELECT 1 FROM users WHERE username = ?').get(candidate)) {
    n += 1;
    candidate = base + n;
  }
  return candidate;
}

router.get('/', auth(), (_req, res) => {
  const rows = db.prepare(`
    SELECT t.*,
           (SELECT COUNT(*) FROM tickets WHERE technician_id = t.id
              AND status IN ('waiting','in-progress','testing')) AS current_load
    FROM technicians t
    WHERE t.is_active = 1
    ORDER BY t.name
  `).all();
  res.json({ data: rows });
});

router.get('/:id', auth(['admin', 'manager']), (req, res) => {
  const tech = db.prepare('SELECT * FROM technicians WHERE id = ?').get(req.params.id);
  if (!tech) return res.status(404).json({ error: 'Không tìm thấy KTV' });

  const recent = db.prepare(`
    SELECT code, device, issue, status, quote, created_at
    FROM tickets WHERE technician_id = ?
    ORDER BY created_at DESC LIMIT 20
  `).all(req.params.id);

  const monthlyRevenue = db.prepare(`
    SELECT COALESCE(SUM(p.final_amount), 0) AS revenue
    FROM payments p
    JOIN tickets t ON t.id = p.ticket_id
    WHERE t.technician_id = ?
      AND DATE(p.paid_at) >= DATE('now', 'start of month')
  `).get(req.params.id);

  res.json({ technician: tech, recent_tickets: recent, monthly_revenue: monthlyRevenue.revenue });
});

router.post('/', auth(['admin', 'manager']), (req, res) => {
  const { name, specialty, color, hire_date } = req.body || {};
  if (!name) return res.status(400).json({ error: 'Thiếu name' });

  /* Tự tạo user role=technician — username=password=slug(name).
     "Minh Triết" → "minhtriet" / "minhtriet". KTV đổi mật khẩu sau khi đăng nhập. */
  const baseSlug = nameToSlug(name);
  if (!baseSlug) return res.status(400).json({ error: 'Tên không hợp lệ (sau khi bỏ dấu rỗng)' });
  const username = uniqueUsername(baseSlug);
  const passwordHash = bcrypt.hashSync(baseSlug, 10);

  const userInsert = db.prepare(`
    INSERT INTO users (username, password, full_name, role)
    VALUES (?, ?, ?, 'technician')
  `).run(username, passwordHash, name);
  const userId = userInsert.lastInsertRowid;

  const r = db.prepare(`
    INSERT INTO technicians (name, specialty, color, user_id, hire_date)
    VALUES (?, ?, ?, ?, ?)
  `).run(name, specialty || null, color || '#2563eb', userId, hire_date || null);

  res.status(201).json({
    technician: db.prepare('SELECT * FROM technicians WHERE id = ?').get(r.lastInsertRowid),
    login: { username, password: baseSlug }, /* trả về cho admin xem 1 lần */
  });
});

router.put('/:id', auth(['admin', 'manager']), (req, res) => {
  const { name, specialty, color, is_active } = req.body || {};
  const result = db.prepare(`
    UPDATE technicians SET
      name      = COALESCE(?, name),
      specialty = COALESCE(?, specialty),
      color     = COALESCE(?, color),
      is_active = COALESCE(?, is_active)
    WHERE id = ?
  `).run(name, specialty, color, is_active === undefined ? null : (is_active ? 1 : 0), req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Không tìm thấy KTV' });
  res.json({ technician: db.prepare('SELECT * FROM technicians WHERE id = ?').get(req.params.id) });
});

router.get('/:id/workload', auth(['admin', 'manager']), (req, res) => {
  const tech = db.prepare('SELECT id, name FROM technicians WHERE id = ?').get(req.params.id);
  if (!tech) return res.status(404).json({ error: 'Không tìm thấy KTV' });
  const breakdown = db.prepare(`
    SELECT status, COUNT(*) AS count FROM tickets
    WHERE technician_id = ? AND status IN ('waiting','in-progress','testing')
    GROUP BY status
  `).all(req.params.id);
  res.json({ technician: tech, breakdown });
});

module.exports = router;
