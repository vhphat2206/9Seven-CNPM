/**
 * /api/payments — payments + invoices
 *
 *   POST   /                    create payment (admin/cashier)
 *   GET    /                    list payments (filter ?from=&to=&method=)
 *   GET    /:invoice_no         payment detail
 *   GET    /stats/today         today's pending vs collected
 */
const express = require('express');
const db = require('../db');
const { auth } = require('../middleware/auth');
const { notifyCustomer, broadcastStaff } = require('../services/notify');

const router = express.Router();

const VALID_METHODS = ['cash', 'bank', 'card', 'pickup'];

function nextInvoiceNo() {
  const year = new Date().getFullYear();
  const prefix = `INV-${year}-`;
  const row = db.prepare(
    `SELECT invoice_no FROM payments WHERE invoice_no LIKE ?
     ORDER BY CAST(SUBSTR(invoice_no, LENGTH(?)+1) AS INTEGER) DESC LIMIT 1`
  ).get(`${prefix}%`, prefix);
  const lastNum = row ? parseInt(row.invoice_no.slice(prefix.length), 10) || 0 : 140;
  return prefix + String(lastNum + 1).padStart(4, '0');
}

/* ─── Create payment ─────────────────────────────────────── */
router.post('/', auth(['admin', 'manager', 'cashier']), (req, res) => {
  const {
    ticket_code, method, discount_pct = 0, received, note,
  } = req.body || {};

  if (!ticket_code || !method) {
    return res.status(400).json({ error: 'Thiếu ticket_code hoặc method' });
  }
  if (!VALID_METHODS.includes(method)) {
    return res.status(400).json({ error: 'Phương thức thanh toán không hợp lệ' });
  }

  const ticket = db.prepare('SELECT * FROM tickets WHERE code = ?').get(ticket_code);
  if (!ticket) return res.status(404).json({ error: 'Không tìm thấy phiếu' });
  if (ticket.quote <= 0) return res.status(400).json({ error: 'Phiếu chưa có báo giá' });

  const existing = db.prepare('SELECT id FROM payments WHERE ticket_id = ?').get(ticket.id);
  if (existing) return res.status(409).json({ error: 'Phiếu đã được thu tiền' });

  const subtotal = ticket.quote;
  const pct = Math.max(0, Math.min(100, parseFloat(discount_pct) || 0));
  const discountAmount = Math.round(subtotal * pct / 100);
  const finalAmount = subtotal - discountAmount;
  const changeBack = received ? Math.max(0, parseInt(received) - finalAmount) : null;

  const invoiceNo = nextInvoiceNo();
  const result = db.prepare(`
    INSERT INTO payments (
      invoice_no, ticket_id, customer_id, amount, discount_pct,
      discount_amount, final_amount, method, received, change_back, note, cashier_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    invoiceNo, ticket.id, ticket.customer_id, subtotal, pct,
    discountAmount, finalAmount, method,
    received ? parseInt(received) : null, changeBack, note || null, req.user.sub
  );

  /* Auto-advance ticket to "delivered" */
  db.prepare(`
    UPDATE tickets SET status = 'delivered', last_status_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(ticket.id);
  db.prepare(`
    INSERT INTO ticket_status_history (ticket_id, from_status, to_status, changed_by, note)
    VALUES (?, ?, 'delivered', ?, ?)
  `).run(ticket.id, ticket.status, req.user.sub, `Thanh toán ${invoiceNo}`);

  /* Update customer stats */
  db.prepare(`
    UPDATE customers SET
      total_spent = total_spent + ?,
      last_visit  = CURRENT_TIMESTAMP,
      updated_at  = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(finalAmount, ticket.customer_id);

  /* Push system message to chat */
  const customer = db.prepare('SELECT phone, full_name FROM customers WHERE id = ?').get(ticket.customer_id);
  if (customer) {
    let chat = db.prepare('SELECT id FROM chats WHERE customer_phone = ?').get(customer.phone);
    if (!chat) {
      const r = db.prepare('INSERT INTO chats (customer_phone, customer_name) VALUES (?, ?)').run(customer.phone, customer.full_name);
      chat = { id: r.lastInsertRowid };
    }
    const methodLabel = { cash: 'Tiền mặt', bank: 'Chuyển khoản', card: 'Thẻ', pickup: 'Tại quầy' }[method];
    const text = `Phiếu ${ticket.code} đã thanh toán xong (${finalAmount.toLocaleString('vi-VN')}₫ · ${methodLabel}). Mã HĐ: ${invoiceNo}. Cảm ơn quý khách!`;
    db.prepare(`INSERT INTO messages (chat_id, sender, text) VALUES (?, 'system', ?)`).run(chat.id, text);
    db.prepare('UPDATE chats SET customer_unread = customer_unread + 1, last_message_at = CURRENT_TIMESTAMP WHERE id = ?').run(chat.id);
  }

  /* In-app bell: notify customer + all staff */
  const methodLabelMap = { cash: 'Tiền mặt', bank: 'Chuyển khoản', card: 'Thẻ', pickup: 'Tại quầy' };
  notifyCustomer({
    customer_id: ticket.customer_id,
    type: 'payment',
    title: `Đã nhận thanh toán ${finalAmount.toLocaleString('vi-VN')}₫`,
    message: `Hoá đơn ${invoiceNo} cho phiếu ${ticket.code} (${methodLabelMap[method] || method}). Cảm ơn quý khách!`,
    entity_type: 'payment',
    entity_code: invoiceNo,
  });
  broadcastStaff({
    type: 'payment',
    title: `Đã thu ${finalAmount.toLocaleString('vi-VN')}₫ · ${invoiceNo}`,
    message: `Phiếu ${ticket.code} của ${customer ? customer.full_name : 'khách'} đã hoàn tất thanh toán.`,
    entity_type: 'ticket',
    entity_code: ticket.code,
    exceptUserId: req.user.sub,
  });

  const payment = db.prepare('SELECT * FROM payments WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ payment });
});

/* ─── List payments ──────────────────────────────────────── */
router.get('/', auth(['admin', 'manager', 'cashier']), (req, res) => {
  const { from, to, method } = req.query;
  let sql = `
    SELECT p.*, t.code AS ticket_code, t.device, c.full_name AS customer_name, c.phone AS customer_phone
    FROM payments p
    LEFT JOIN tickets t   ON t.id = p.ticket_id
    LEFT JOIN customers c ON c.id = p.customer_id
    WHERE 1=1
  `;
  const params = [];
  if (from)   { sql += ' AND DATE(p.paid_at) >= ?'; params.push(from); }
  if (to)     { sql += ' AND DATE(p.paid_at) <= ?'; params.push(to); }
  if (method) { sql += ' AND p.method = ?'; params.push(method); }
  sql += ' ORDER BY p.paid_at DESC';
  res.json({ data: db.prepare(sql).all(...params) });
});

/* ─── Today stats ─────────────────────────────────────────── */
router.get('/stats/today', auth(['admin', 'manager', 'cashier']), (_req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const collected = db.prepare(`
    SELECT COUNT(*) AS count, COALESCE(SUM(final_amount), 0) AS total
    FROM payments WHERE DATE(paid_at) = ?
  `).get(today);
  const pending = db.prepare(`
    SELECT COUNT(*) AS count, COALESCE(SUM(quote), 0) AS total
    FROM tickets WHERE quote > 0
      AND status = 'done'
      AND id NOT IN (SELECT ticket_id FROM payments)
  `).get();
  const allTime = db.prepare(`
    SELECT COUNT(*) AS count, COALESCE(SUM(final_amount), 0) AS total
    FROM payments
  `).get();
  res.json({ collected, pending, all_time: allTime });
});

router.get('/:invoice_no', auth(['admin', 'manager', 'cashier']), (req, res) => {
  const payment = db.prepare(`
    SELECT p.*, t.code AS ticket_code, t.device, t.issue, t.technician_id,
           c.full_name AS customer_name, c.phone AS customer_phone, c.address AS customer_address,
           u.full_name AS cashier_name
    FROM payments p
    LEFT JOIN tickets   t ON t.id = p.ticket_id
    LEFT JOIN customers c ON c.id = p.customer_id
    LEFT JOIN users     u ON u.id = p.cashier_id
    WHERE p.invoice_no = ?
  `).get(req.params.invoice_no);
  if (!payment) return res.status(404).json({ error: 'Không tìm thấy hoá đơn' });
  res.json({ payment });
});

module.exports = router;
