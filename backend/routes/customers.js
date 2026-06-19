/**
 * /api/customers — customer directory
 *
 *   GET  /                customer list (admin)
 *   GET  /:phone          one customer + their tickets
 *   POST /                create new customer
 *   PUT  /:phone          update info
 */
const express = require('express');
const db = require('../db');
const { auth } = require('../middleware/auth');

const router = express.Router();

router.get('/', auth(['admin', 'manager', 'reception']), (req, res) => {
  const { search, include_walkin } = req.query;
  let sql = `
    SELECT id, phone, full_name, email, address, total_spent, ticket_count, last_visit, created_at
    FROM customers WHERE 1=1
  `;
  /* Default: only registered accounts (password set). Walk-in customers
     created from tickets/bookings without password are hidden unless
     explicitly requested via ?include_walkin=1. */
  if (include_walkin !== '1') {
    sql += " AND password IS NOT NULL AND password != ''";
  }
  const params = [];
  if (search) {
    sql += ' AND (full_name LIKE ? OR phone LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }
  sql += ' ORDER BY COALESCE(last_visit, created_at) DESC';
  res.json({ data: db.prepare(sql).all(...params) });
});

router.get('/:phone', auth(['admin', 'manager', 'reception']), (req, res) => {
  const customer = db.prepare(
    'SELECT id, phone, full_name, email, address, birthday, gender, created_at FROM customers WHERE phone = ?'
  ).get(req.params.phone);
  if (!customer) return res.status(404).json({ error: 'Không tìm thấy khách hàng' });

  const tickets = db.prepare(`
    SELECT t.*, tech.name AS technician_name
    FROM tickets t
    LEFT JOIN technicians tech ON tech.id = t.technician_id
    WHERE t.customer_id = ?
    ORDER BY t.created_at DESC
  `).all(customer.id);

  const stats = db.prepare(`
    SELECT
      COUNT(*) AS total_tickets,
      SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) AS completed,
      COALESCE(SUM(quote), 0) AS total_quoted
    FROM tickets WHERE customer_id = ?
  `).get(customer.id);

  const totalPaid = db.prepare(`
    SELECT COALESCE(SUM(final_amount), 0) AS sum FROM payments WHERE customer_id = ?
  `).get(customer.id).sum;

  res.json({ customer, tickets, stats: { ...stats, total_paid: totalPaid } });
});

router.post('/', auth(['admin', 'manager', 'reception']), (req, res) => {
  const { phone, full_name, email, address, birthday, gender } = req.body || {};
  if (!phone || !full_name) {
    return res.status(400).json({ error: 'Thiếu phone hoặc full_name' });
  }
  try {
    const r = db.prepare(`
      INSERT INTO customers (phone, full_name, email, address, birthday, gender)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(phone, full_name, email || null, address || null, birthday || null, gender || null);
    res.status(201).json({ customer: db.prepare('SELECT * FROM customers WHERE id = ?').get(r.lastInsertRowid) });
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ error: 'Số điện thoại đã tồn tại' });
    }
    throw err;
  }
});

router.put('/:phone', auth(['admin', 'manager', 'reception']), (req, res) => {
  const { full_name, email, address, birthday, gender } = req.body || {};
  const result = db.prepare(`
    UPDATE customers SET
      full_name = COALESCE(?, full_name),
      email     = COALESCE(?, email),
      address   = COALESCE(?, address),
      birthday  = COALESCE(?, birthday),
      gender    = COALESCE(?, gender),
      updated_at = CURRENT_TIMESTAMP
    WHERE phone = ?
  `).run(full_name, email, address, birthday, gender, req.params.phone);
  if (result.changes === 0) return res.status(404).json({ error: 'Không tìm thấy khách hàng' });
  res.json({ customer: db.prepare('SELECT * FROM customers WHERE phone = ?').get(req.params.phone) });
});

module.exports = router;
