/**
 * /api/bookings — online repair booking requests
 *
 *   POST   /                  customer submits a booking from the form
 *   GET    /                  admin lists all bookings (filter ?status=)
 *   GET    /:id               detail
 *   POST   /:id/confirm       admin confirms → creates a real ticket
 *   POST   /:id/reject        admin rejects with reason
 */
const express = require('express');
const db = require('../db');
const { auth } = require('../middleware/auth');
const { notifyCustomer, broadcastStaff } = require('../services/notify');

const router = express.Router();

function nextBookingCode() {
  const row = db.prepare(
    `SELECT code FROM bookings WHERE code LIKE 'FFC-ONL-%'
     ORDER BY CAST(SUBSTR(code, 9) AS INTEGER) DESC LIMIT 1`
  ).get();
  const lastNum = row ? parseInt(row.code.slice(8), 10) || 0 : 0;
  return 'FFC-ONL-' + String(lastNum + 1).padStart(3, '0');
}

/* ─── Customer submits booking (public — no auth needed) ─── */
router.post('/', (req, res) => {
  const {
    customer_name, customer_phone, customer_email,
    service_type, device, issue, method, address,
    appointment_date, time_slot, note,
  } = req.body || {};

  if (!customer_name || !customer_phone || !device || !issue || !method) {
    return res.status(400).json({
      error: 'Thiếu thông tin bắt buộc (customer_name, customer_phone, device, issue, method)'
    });
  }
  if (!['store', 'ship', 'onsite'].includes(method)) {
    return res.status(400).json({ error: 'Hình thức tiếp nhận không hợp lệ' });
  }

  const code = nextBookingCode();
  const result = db.prepare(`
    INSERT INTO bookings (
      code, customer_name, customer_phone, customer_email,
      service_type, device, issue, method, address,
      appointment_date, time_slot, note, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
  `).run(
    code, customer_name, customer_phone, customer_email || null,
    service_type || null, device, issue, method, address || null,
    appointment_date || null, time_slot || null, note || null
  );

  /* Push system message to admin chat queue */
  let chat = db.prepare('SELECT id FROM chats WHERE customer_phone = ?').get(customer_phone);
  if (!chat) {
    const r = db.prepare('INSERT INTO chats (customer_phone, customer_name) VALUES (?, ?)').run(customer_phone, customer_name);
    chat = { id: r.lastInsertRowid };
  }
  const methodLabel = { store: 'tại tiệm', ship: 'ship máy đến tiệm', onsite: 'KTV đến nhà' }[method];
  db.prepare(`
    INSERT INTO messages (chat_id, sender, text)
    VALUES (?, 'system', ?)
  `).run(chat.id,
    `Khách ${customer_name} đã đặt lịch online ${code} — ${device} (${issue}). Hẹn ${appointment_date || '—'} ${time_slot || ''}, hình thức: ${methodLabel}.`
  );
  db.prepare(`
    UPDATE chats SET admin_unread = admin_unread + 1, last_message_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(chat.id);

  /* In-app bell: ping all staff that a new online booking arrived */
  broadcastStaff({
    type: 'booking_new',
    title: `📅 Khách đặt lịch online — ${code}`,
    message: `${customer_name} (${customer_phone}) — ${device} · ${issue}`,
    entity_type: 'booking',
    entity_code: code,
  });

  const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ booking });
});

/* ─── List bookings (admin) ───────────────────────────────── */
router.get('/', auth(['admin', 'manager', 'reception']), (req, res) => {
  const { status, phone } = req.query;
  let sql = 'SELECT * FROM bookings WHERE 1=1';
  const params = [];
  if (status) { sql += ' AND status = ?'; params.push(status); }
  if (phone)  { sql += ' AND customer_phone LIKE ?'; params.push(`%${phone}%`); }
  sql += ' ORDER BY created_at DESC';
  res.json({ data: db.prepare(sql).all(...params) });
});

/* ─── Booking detail ──────────────────────────────────────── */
router.get('/:id', auth(['admin', 'manager', 'reception']), (req, res) => {
  const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(req.params.id);
  if (!booking) return res.status(404).json({ error: 'Không tìm thấy lịch hẹn' });
  res.json({ booking });
});

/* ─── Confirm booking → create ticket ─────────────────────── */
router.post('/:id/confirm', auth(['admin', 'manager', 'reception']), (req, res) => {
  const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(req.params.id);
  if (!booking) return res.status(404).json({ error: 'Không tìm thấy lịch hẹn' });
  if (booking.status !== 'pending') {
    return res.status(400).json({ error: 'Lịch hẹn đã được xử lý' });
  }

  const { technician_id, quote = 0 } = req.body || {};

  /* Upsert customer */
  let customer = db.prepare('SELECT id FROM customers WHERE phone = ?').get(booking.customer_phone);
  if (!customer) {
    const r = db.prepare(`
      INSERT INTO customers (phone, full_name, email, address)
      VALUES (?, ?, ?, ?)
    `).run(booking.customer_phone, booking.customer_name, booking.customer_email, booking.address);
    customer = { id: r.lastInsertRowid };
  }

  /* Use booking code as ticket code so customer can recognize it */
  const issueText = booking.issue
    + (booking.method === 'ship' ? ' · 🚚 Ship đến tiệm' :
        booking.method === 'onsite' ? ' · 🏠 KTV đến nhà' : '');
  const internalNote = [
    booking.appointment_date && `Hẹn ${booking.appointment_date} ${booking.time_slot || ''}`,
    booking.address && `Địa chỉ: ${booking.address}`,
    booking.note,
  ].filter(Boolean).join(' | ');

  const ticketResult = db.prepare(`
    INSERT INTO tickets (
      code, customer_id, technician_id, device, device_type, issue, quote,
      status, urgent, source, internal_note, last_status_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'waiting', 0, 'online', ?, CURRENT_TIMESTAMP)
  `).run(
    booking.code, customer.id, technician_id || null,
    booking.device, booking.service_type, issueText, quote,
    internalNote || null
  );

  db.prepare(`
    INSERT INTO ticket_status_history (ticket_id, from_status, to_status, changed_by, note)
    VALUES (?, NULL, 'waiting', ?, 'Tiếp nhận từ đặt lịch online')
  `).run(ticketResult.lastInsertRowid, req.user.sub);

  /* Mark booking as converted */
  db.prepare('UPDATE bookings SET status = ?, ticket_id = ? WHERE id = ?')
    .run('converted', ticketResult.lastInsertRowid, booking.id);

  if (technician_id) {
    db.prepare('UPDATE technicians SET active_tickets = active_tickets + 1 WHERE id = ?').run(technician_id);
  }

  /* Notify customer that booking was confirmed → real ticket created */
  notifyCustomer({
    customer_id: customer.id,
    type: 'booking_confirmed',
    title: `✅ Đã xác nhận đặt lịch ${booking.code}`,
    message: `FFC đã tiếp nhận yêu cầu sửa ${booking.device}. KTV sẽ liên hệ bạn sớm.`,
    entity_type: 'ticket',
    entity_code: booking.code,
  });

  const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(ticketResult.lastInsertRowid);
  res.status(201).json({ booking_id: booking.id, ticket });
});

/* ─── Reject booking ──────────────────────────────────────── */
router.post('/:id/reject', auth(['admin', 'manager', 'reception']), (req, res) => {
  const { reason } = req.body || {};
  const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(req.params.id);
  if (!booking) return res.status(404).json({ error: 'Không tìm thấy lịch hẹn' });

  db.prepare('UPDATE bookings SET status = ?, rejected_reason = ? WHERE id = ?')
    .run('rejected', reason || null, booking.id);
  res.json({ ok: true });
});

module.exports = router;
