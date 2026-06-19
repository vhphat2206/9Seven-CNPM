/**
 * /api/parts — parts inventory (kho linh kiện)
 *
 *   GET    /                list parts (filter ?category=&low_stock=1&search=)
 *   POST   /                create part
 *   PUT    /:id             update part
 *   POST   /:id/in          stock in (nhập kho)
 *   POST   /:id/out         stock out (xuất kho)
 *   GET    /:id/history     transaction history
 */
const express = require('express');
const db = require('../db');
const { auth } = require('../middleware/auth');

const router = express.Router();

router.get('/', auth(['admin', 'manager', 'reception']), (req, res) => {
  const { category, low_stock, search } = req.query;
  let sql = 'SELECT * FROM parts WHERE 1=1';
  const params = [];
  if (category) { sql += ' AND category = ?'; params.push(category); }
  if (low_stock === '1') sql += ' AND stock <= min_stock';
  if (search) {
    sql += ' AND (sku LIKE ? OR name LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }
  sql += ' ORDER BY name';
  res.json({ data: db.prepare(sql).all(...params) });
});

router.post('/', auth(['admin', 'manager']), (req, res) => {
  const { sku, name, category, unit_cost = 0, unit_price = 0, stock = 0, min_stock = 5, unit = 'cái' } = req.body || {};
  if (!sku || !name || !category) {
    return res.status(400).json({ error: 'Thiếu sku, name hoặc category' });
  }
  try {
    const r = db.prepare(`
      INSERT INTO parts (sku, name, category, unit_cost, unit_price, stock, min_stock, unit)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(sku, name, category, unit_cost, unit_price, stock, min_stock, unit);
    res.status(201).json({ part: db.prepare('SELECT * FROM parts WHERE id = ?').get(r.lastInsertRowid) });
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ error: 'SKU đã tồn tại' });
    }
    throw err;
  }
});

router.put('/:id', auth(['admin', 'manager']), (req, res) => {
  const { name, category, unit_cost, unit_price, min_stock, unit } = req.body || {};
  const result = db.prepare(`
    UPDATE parts SET
      name       = COALESCE(?, name),
      category   = COALESCE(?, category),
      unit_cost  = COALESCE(?, unit_cost),
      unit_price = COALESCE(?, unit_price),
      min_stock  = COALESCE(?, min_stock),
      unit       = COALESCE(?, unit)
    WHERE id = ?
  `).run(name, category, unit_cost, unit_price, min_stock, unit, req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Không tìm thấy linh kiện' });
  res.json({ part: db.prepare('SELECT * FROM parts WHERE id = ?').get(req.params.id) });
});

function stockMove(type) {
  return (req, res) => {
    const { quantity, ticket_id, note } = req.body || {};
    const qty = parseInt(quantity, 10);
    if (!qty || qty <= 0) return res.status(400).json({ error: 'Quantity phải > 0' });

    const part = db.prepare('SELECT * FROM parts WHERE id = ?').get(req.params.id);
    if (!part) return res.status(404).json({ error: 'Không tìm thấy linh kiện' });

    const delta = type === 'in' ? qty : -qty;
    if (type === 'out' && part.stock < qty) {
      return res.status(400).json({ error: 'Không đủ tồn kho' });
    }

    db.prepare('UPDATE parts SET stock = stock + ? WHERE id = ?').run(delta, req.params.id);
    db.prepare(`
      INSERT INTO part_transactions (part_id, type, quantity, ticket_id, note, created_by)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(req.params.id, type, qty, ticket_id || null, note || null, req.user.sub);

    res.json({ part: db.prepare('SELECT * FROM parts WHERE id = ?').get(req.params.id) });
  };
}

router.post('/:id/in', auth(['admin', 'manager', 'reception']), stockMove('in'));
router.post('/:id/out', auth(['admin', 'manager', 'reception']), stockMove('out'));

router.get('/:id/history', auth(['admin', 'manager']), (req, res) => {
  const rows = db.prepare(`
    SELECT pt.*, u.full_name AS user_name, t.code AS ticket_code
    FROM part_transactions pt
    LEFT JOIN users u   ON u.id = pt.created_by
    LEFT JOIN tickets t ON t.id = pt.ticket_id
    WHERE pt.part_id = ?
    ORDER BY pt.created_at DESC
  `).all(req.params.id);
  res.json({ data: rows });
});

module.exports = router;
