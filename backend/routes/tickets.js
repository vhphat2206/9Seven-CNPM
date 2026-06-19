/**
 * /api/tickets — repair tickets (phiếu sửa chữa)
 *
 *   GET    /                  list + filter (?status=&technician=&search=&page=)
 *   GET    /:code             ticket detail + history
 *   POST   /                  create (admin/reception)
 *   PATCH  /:code             update fields (assign KTV, quote, urgent...)
 *   PATCH  /:code/status      change status + log history
 *   DELETE /:code             cancel (admin)
 *   GET    /me                tickets of the logged-in customer
 */
const express = require('express');
const db = require('../db');
const { auth } = require('../middleware/auth');
const { notifyCustomer, broadcastStaff } = require('../services/notify');

const router = express.Router();

const STATUS_FLOW = ['waiting', 'in-progress', 'testing', 'done', 'delivered'];
const VALID_STATUS = new Set([...STATUS_FLOW, 'cancelled']);

/* Generate next ticket code (FFC-XXXX). Uses MAX(code) to ensure no collisions. */
function nextTicketCode() {
  const row = db.prepare(
    `SELECT code FROM tickets WHERE code LIKE 'FFC-%' AND code NOT LIKE 'FFC-ONL-%'
     ORDER BY CAST(SUBSTR(code, 5) AS INTEGER) DESC LIMIT 1`
  ).get();
  const lastNum = row ? parseInt(row.code.slice(4), 10) || 0 : 0;
  return 'FFC-' + String(lastNum + 1).padStart(4, '0');
}

/* Upsert customer by phone — used when creating tickets */
function upsertCustomer({ phone, full_name, email, address }) {
  const existing = db.prepare('SELECT id FROM customers WHERE phone = ?').get(phone);
  if (existing) {
    db.prepare(`
      UPDATE customers SET
        full_name = COALESCE(?, full_name),
        email     = COALESCE(?, email),
        address   = COALESCE(?, address),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(full_name, email, address, existing.id);
    return existing.id;
  }
  const result = db.prepare(
    'INSERT INTO customers (phone, full_name, email, address) VALUES (?, ?, ?, ?)'
  ).run(phone, full_name, email || null, address || null);
  return result.lastInsertRowid;
}

/* ─── Public lookup — khách tra cứu phiếu bằng mã + SĐT ─── */
router.get('/lookup', (req, res) => {
  const { code, phone } = req.query;
  if (!code || !phone) {
    return res.status(400).json({ error: 'Thiếu mã phiếu hoặc số điện thoại' });
  }
  const phoneKey = String(phone).replace(/\s/g, '');
  const row = db.prepare(`
    SELECT t.code, t.device, t.issue, t.status, t.quote, t.created_at, t.last_status_at,
           c.full_name AS customer_name, c.phone AS customer_phone,
           tech.name AS technician_name,
           p.invoice_no AS paid_invoice_no, p.method AS paid_method,
           p.final_amount AS paid_final_amount, p.paid_at AS paid_at
    FROM tickets t
    JOIN customers c       ON c.id = t.customer_id
    LEFT JOIN technicians tech ON tech.id = t.technician_id
    LEFT JOIN payments p   ON p.ticket_id = t.id
    WHERE t.code = ? AND REPLACE(c.phone, ' ', '') = ?
  `).get(code, phoneKey);
  if (!row) {
    /* Check bookings (chưa thành ticket) */
    const booking = db.prepare(`
      SELECT code, customer_name, customer_phone, device, issue, method,
             appointment_date, time_slot, status, created_at
      FROM bookings WHERE code = ? AND REPLACE(customer_phone, ' ', '') = ?
    `).get(code, phoneKey);
    if (booking) {
      return res.json({
        type: 'booking',
        data: { ...booking, status_label: 'Chờ xác nhận' },
      });
    }
    return res.status(404).json({ error: 'Không tìm thấy phiếu khớp với mã và SĐT' });
  }
  res.json({ type: 'ticket', data: row });
});

/* ─── List tickets (admin) ───────────────────────────────── */
router.get('/', auth(), (req, res) => {
  const { status, technician_id, search, page = 1, limit = 50, recent_days = 30 } = req.query;
  const offset = (Math.max(1, parseInt(page)) - 1) * parseInt(limit);

  let sql = `
    SELECT t.*, c.full_name AS customer_name, c.phone AS customer_phone,
           tech.name AS technician_name,
           p.invoice_no AS paid_invoice_no, p.method AS paid_method,
           p.paid_at AS paid_at, p.final_amount AS paid_final_amount
    FROM tickets t
    LEFT JOIN customers c     ON c.id = t.customer_id
    LEFT JOIN technicians tech ON tech.id = t.technician_id
    LEFT JOIN payments p      ON p.ticket_id = t.id
    WHERE 1=1
  `;
  const params = [];

  /* Customer scope: only their own tickets */
  if (req.user.role === 'customer') {
    sql += ' AND t.customer_id = ?';
    params.push(req.user.sub);
  }
  /* Technician scope: chỉ phiếu được phân cho KTV này (qua technicians.user_id) */
  if (req.user.role === 'technician') {
    sql += ' AND t.technician_id = (SELECT id FROM technicians WHERE user_id = ?)';
    params.push(req.user.sub);
  }
  if (status && VALID_STATUS.has(status)) { sql += ' AND t.status = ?'; params.push(status); }
  if (technician_id) { sql += ' AND t.technician_id = ?'; params.push(technician_id); }
  if (search) {
    sql += ' AND (t.code LIKE ? OR c.full_name LIKE ? OR c.phone LIKE ? OR t.device LIKE ?)';
    const q = `%${search}%`;
    params.push(q, q, q, q);
  }

  /* Auto-archive: ẩn phiếu đã giao/huỷ quá `recent_days` ngày khỏi list mặc định.
     Active tickets luôn hiện. Đặt recent_days=0 để xem toàn bộ lịch sử. */
  const days = parseInt(recent_days);
  if (!status && days > 0) {
    sql += ` AND NOT (t.status IN ('delivered','cancelled')
             AND t.updated_at < datetime('now', '-' || ? || ' days'))`;
    params.push(days);
  }

  sql += ' ORDER BY t.created_at DESC LIMIT ? OFFSET ?';
  params.push(parseInt(limit), offset);

  const rows = db.prepare(sql).all(...params);
  res.json({ data: rows, page: parseInt(page), limit: parseInt(limit), recent_days: days });
});

/* ─── Current customer's tickets (+ pending bookings) ─────
   Customer sees both:
     - Real tickets (admin has confirmed/created)
     - Pending bookings (waiting for admin confirmation)
   Pending bookings are returned as "virtual tickets" with status='booking'. */
router.get('/me', auth(['customer']), (req, res) => {
  /* 1. Real tickets */
  const tickets = db.prepare(`
    SELECT t.*, tech.name AS technician_name,
           p.invoice_no AS paid_invoice_no, p.method AS paid_method,
           p.paid_at AS paid_at, p.final_amount AS paid_final_amount
    FROM tickets t
    LEFT JOIN technicians tech ON tech.id = t.technician_id
    LEFT JOIN payments p       ON p.ticket_id = t.id
    WHERE t.customer_id = ?
    ORDER BY
      CASE WHEN t.status IN ('delivered','cancelled') THEN 1 ELSE 0 END,
      t.created_at DESC
  `).all(req.user.sub);

  /* 2. Pending bookings (chưa được admin xác nhận → chưa có ticket) */
  const me = db.prepare('SELECT phone FROM customers WHERE id = ?').get(req.user.sub);
  let pendingBookings = [];
  if (me) {
    pendingBookings = db.prepare(`
      SELECT
        code,
        customer_name AS customer_name,
        customer_phone,
        device,
        'phone' AS device_type,
        issue,
        method AS booking_method,
        address AS booking_address,
        appointment_date AS booking_date,
        time_slot AS booking_slot,
        note AS booking_note,
        0 AS quote,
        'booking' AS status,
        1 AS urgent,
        'online' AS source,
        created_at,
        NULL AS technician_name,
        NULL AS paid_invoice_no, NULL AS paid_method,
        NULL AS paid_at, NULL AS paid_final_amount,
        NULL AS last_status_at
      FROM bookings
      WHERE customer_phone = ? AND status = 'pending'
      ORDER BY created_at DESC
    `).all(me.phone);
  }

  /* Pending bookings appear at the top (most urgent for customer) */
  res.json({ data: [...pendingBookings, ...tickets] });
});

/* ─── Get one ticket by code ─────────────────────────────── */
router.get('/:code', auth(), (req, res) => {
  const ticket = db.prepare(`
    SELECT t.*, c.full_name AS customer_name, c.phone AS customer_phone, c.email AS customer_email,
           tech.name AS technician_name, tech.specialty AS technician_specialty
    FROM tickets t
    LEFT JOIN customers c      ON c.id = t.customer_id
    LEFT JOIN technicians tech ON tech.id = t.technician_id
    WHERE t.code = ?
  `).get(req.params.code);

  if (!ticket) return res.status(404).json({ error: 'Không tìm thấy phiếu' });

  /* Customer can only see own tickets */
  if (req.user.role === 'customer' && ticket.customer_id !== req.user.sub) {
    return res.status(403).json({ error: 'Không đủ quyền' });
  }

  const history = db.prepare(`
    SELECT h.*, u.full_name AS changed_by_name
    FROM ticket_status_history h
    LEFT JOIN users u ON u.id = h.changed_by
    WHERE h.ticket_id = ?
    ORDER BY h.changed_at
  `).all(ticket.id);

  res.json({ ticket, history });
});

/* ─── Create new ticket ──────────────────────────────────── */
router.post('/', auth(['admin', 'manager', 'reception']), (req, res) => {
  const {
    phone, customer_name, customer_email, customer_address,
    device, device_type, imei, color, issue, accessories,
    quote, technician_id, urgent, priority, source, internal_note, due_date,
  } = req.body || {};

  if (!phone || !customer_name || !device || !issue) {
    return res.status(400).json({ error: 'Thiếu thông tin bắt buộc (phone, customer_name, device, issue)' });
  }

  const customerId = upsertCustomer({
    phone, full_name: customer_name, email: customer_email, address: customer_address,
  });

  const code = nextTicketCode();
  const result = db.prepare(`
    INSERT INTO tickets (
      code, customer_id, technician_id, device, device_type, imei, color, issue,
      accessories, quote, status, urgent, priority, source, internal_note, due_date,
      last_status_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'waiting', ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `).run(
    code, customerId, technician_id || null, device, device_type || null, imei || null, color || null,
    issue, accessories ? JSON.stringify(accessories) : null, parseInt(quote) || 0,
    urgent ? 1 : 0, priority || 'normal', source || 'walkin', internal_note || null, due_date || null
  );

  /* Initial status entry */
  db.prepare(`
    INSERT INTO ticket_status_history (ticket_id, from_status, to_status, changed_by, note)
    VALUES (?, NULL, 'waiting', ?, 'Tiếp nhận phiếu')
  `).run(result.lastInsertRowid, req.user.sub);

  /* Increment KTV workload if assigned */
  if (technician_id) {
    db.prepare('UPDATE technicians SET active_tickets = active_tickets + 1 WHERE id = ?').run(technician_id);
    /* Notify the KTV (if linked to a user account) */
    const tech = db.prepare('SELECT user_id, name FROM technicians WHERE id = ?').get(technician_id);
    if (tech && tech.user_id) {
      const { notifyUser } = require('../services/notify');
      notifyUser({
        user_id: tech.user_id,
        type: 'ktv_assigned',
        title: `🔧 Phiếu mới được phân cho bạn — ${code}`,
        message: `${device} · ${issue}`,
        entity_type: 'ticket',
        entity_code: code,
      });
    }
  }

  /* Notify the customer that their device has been received */
  notifyCustomer({
    customer_id: customerId,
    type: 'ticket_intake',
    title: `📥 Đã tiếp nhận ${code}`,
    message: `FFC đã nhận máy ${device} của bạn. Mọi cập nhật sẽ báo cho bạn tại đây.`,
    entity_type: 'ticket',
    entity_code: code,
  });

  const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ ticket });
});

/* ─── Update ticket fields ───────────────────────────────── */
router.patch('/:code', auth(['admin', 'manager', 'reception']), (req, res) => {
  const ticket = db.prepare('SELECT * FROM tickets WHERE code = ?').get(req.params.code);
  if (!ticket) return res.status(404).json({ error: 'Không tìm thấy phiếu' });

  const { technician_id, quote, issue, urgent, priority, internal_note, due_date } = req.body || {};

  /* Recompute KTV workload if reassigning */
  if (technician_id !== undefined && technician_id !== ticket.technician_id) {
    const activeStatuses = ['waiting', 'in-progress', 'testing'];
    if (ticket.technician_id && activeStatuses.includes(ticket.status)) {
      db.prepare('UPDATE technicians SET active_tickets = MAX(0, active_tickets - 1) WHERE id = ?').run(ticket.technician_id);
    }
    if (technician_id && activeStatuses.includes(ticket.status)) {
      db.prepare('UPDATE technicians SET active_tickets = active_tickets + 1 WHERE id = ?').run(technician_id);
    }
  }

  db.prepare(`
    UPDATE tickets SET
      technician_id = COALESCE(?, technician_id),
      quote         = COALESCE(?, quote),
      issue         = COALESCE(?, issue),
      urgent        = COALESCE(?, urgent),
      priority      = COALESCE(?, priority),
      internal_note = COALESCE(?, internal_note),
      due_date      = COALESCE(?, due_date),
      updated_at    = CURRENT_TIMESTAMP
    WHERE code = ?
  `).run(
    technician_id, quote, issue,
    urgent === undefined ? null : (urgent ? 1 : 0),
    priority, internal_note, due_date,
    req.params.code
  );

  const updated = db.prepare('SELECT * FROM tickets WHERE code = ?').get(req.params.code);
  res.json({ ticket: updated });
});

/* ─── Change ticket status ───────────────────────────────── */
router.patch('/:code/status', auth(['admin', 'manager', 'reception']), (req, res) => {
  const { status, note } = req.body || {};
  if (!VALID_STATUS.has(status)) {
    return res.status(400).json({ error: 'Trạng thái không hợp lệ' });
  }

  const ticket = db.prepare('SELECT * FROM tickets WHERE code = ?').get(req.params.code);
  if (!ticket) return res.status(404).json({ error: 'Không tìm thấy phiếu' });
  if (ticket.status === status) {
    return res.status(400).json({ error: 'Phiếu đã ở trạng thái này' });
  }

  db.prepare(`
    UPDATE tickets SET status = ?, last_status_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(status, ticket.id);

  db.prepare(`
    INSERT INTO ticket_status_history (ticket_id, from_status, to_status, changed_by, note)
    VALUES (?, ?, ?, ?, ?)
  `).run(ticket.id, ticket.status, status, req.user.sub, note || null);

  /* Update KTV workload counters */
  if (ticket.technician_id) {
    const wasActive = ['waiting','in-progress','testing'].includes(ticket.status);
    const nowActive = ['waiting','in-progress','testing'].includes(status);
    if (wasActive && !nowActive) {
      db.prepare('UPDATE technicians SET active_tickets = MAX(0, active_tickets - 1) WHERE id = ?').run(ticket.technician_id);
    } else if (!wasActive && nowActive) {
      db.prepare('UPDATE technicians SET active_tickets = active_tickets + 1 WHERE id = ?').run(ticket.technician_id);
    }
    if (status === 'delivered' && ticket.status !== 'delivered') {
      db.prepare('UPDATE technicians SET completed_total = completed_total + 1 WHERE id = ?').run(ticket.technician_id);
    }
  }

  /* Push system message into customer chat */
  const customer = db.prepare('SELECT phone, full_name FROM customers WHERE id = ?').get(ticket.customer_id);
  if (customer) {
    let chat = db.prepare('SELECT id FROM chats WHERE customer_phone = ?').get(customer.phone);
    if (!chat) {
      const r = db.prepare('INSERT INTO chats (customer_phone, customer_name) VALUES (?, ?)').run(customer.phone, customer.full_name);
      chat = { id: r.lastInsertRowid };
    }
    const statusLabel = {
      waiting: 'Chờ xử lý', 'in-progress': 'Đang sửa',
      testing: 'Đang test', done: 'Xong', delivered: 'Đã giao', cancelled: 'Đã huỷ',
    }[status];
    db.prepare(`
      INSERT INTO messages (chat_id, sender, text)
      VALUES (?, 'system', ?)
    `).run(chat.id, `Phiếu ${ticket.code} đã chuyển sang [${statusLabel}]`);
    db.prepare(`
      UPDATE chats SET customer_unread = customer_unread + 1, last_message_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(chat.id);
  }

  /* In-app bell notification for the customer */
  const statusLabelMap = {
    waiting: 'Chờ xử lý', 'in-progress': 'Đang sửa',
    testing: 'Đang test', done: 'Đã sửa xong', delivered: 'Đã giao', cancelled: 'Đã huỷ',
  };
  notifyCustomer({
    customer_id: ticket.customer_id,
    type: 'ticket_status',
    title: `Phiếu ${ticket.code} — ${statusLabelMap[status] || status}`,
    message: status === 'done'
      ? `Máy ${ticket.device} đã sửa xong! Ghé tiệm hoặc liên hệ để nhận máy nhé.`
      : `Phiếu của bạn đã chuyển sang "${statusLabelMap[status] || status}".`,
    entity_type: 'ticket',
    entity_code: ticket.code,
  });

  const updated = db.prepare('SELECT * FROM tickets WHERE id = ?').get(ticket.id);
  res.json({ ticket: updated });
});

/* ─── Cancel ticket ──────────────────────────────────────── */
router.delete('/:code', auth(['admin', 'manager']), (req, res) => {
  const ticket = db.prepare('SELECT * FROM tickets WHERE code = ?').get(req.params.code);
  if (!ticket) return res.status(404).json({ error: 'Không tìm thấy phiếu' });

  db.prepare('UPDATE tickets SET status = "cancelled", updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(ticket.id);
  db.prepare(`
    INSERT INTO ticket_status_history (ticket_id, from_status, to_status, changed_by, note)
    VALUES (?, ?, 'cancelled', ?, ?)
  `).run(ticket.id, ticket.status, req.user.sub, req.body?.reason || 'Đã huỷ');

  if (ticket.technician_id && ['waiting','in-progress','testing'].includes(ticket.status)) {
    db.prepare('UPDATE technicians SET active_tickets = MAX(0, active_tickets - 1) WHERE id = ?').run(ticket.technician_id);
  }
  res.json({ ok: true });
});

module.exports = router;
