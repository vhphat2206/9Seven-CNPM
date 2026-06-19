/**
 * /api/chats — support chat threads
 *
 *   GET    /                                list all threads (admin)
 *   GET    /:phone                          messages of one thread
 *   POST   /:phone/messages                 send message (customer or admin)
 *   PATCH  /:phone/read                     mark thread as read for current role
 */
const express = require('express');
const db = require('../db');
const { auth } = require('../middleware/auth');

const router = express.Router();

router.get('/', auth(['admin', 'manager', 'reception', 'technician']), (req, res) => {
  const { filter } = req.query;
  let sql = 'SELECT c.* FROM chats c';
  const params = [];

  /* KTV: chỉ thấy chat của khách hàng có phiếu được phân cho mình */
  if (req.user.role === 'technician') {
    sql += `
      WHERE c.customer_phone IN (
        SELECT DISTINCT cust.phone FROM tickets t
        JOIN customers cust ON cust.id = t.customer_id
        WHERE t.technician_id = (SELECT id FROM technicians WHERE user_id = ?)
      )
    `;
    params.push(req.user.sub);
    if (filter === 'unread') sql += ' AND c.admin_unread > 0';
  } else if (filter === 'unread') {
    sql += ' WHERE c.admin_unread > 0';
  }
  sql += ' ORDER BY c.last_message_at DESC';
  res.json({ data: db.prepare(sql).all(...params) });
});

router.get('/:phone', auth(), (req, res) => {
  /* Customer can only fetch own thread */
  if (req.user.role === 'customer') {
    const me = db.prepare('SELECT phone FROM customers WHERE id = ?').get(req.user.sub);
    if (!me || me.phone !== req.params.phone) {
      return res.status(403).json({ error: 'Không đủ quyền' });
    }
  }
  /* Technician: chỉ thread của khách có phiếu phân cho mình */
  if (req.user.role === 'technician') {
    const ok = db.prepare(`
      SELECT 1 FROM tickets t
      JOIN customers c ON c.id = t.customer_id
      WHERE c.phone = ? AND t.technician_id = (SELECT id FROM technicians WHERE user_id = ?)
      LIMIT 1
    `).get(req.params.phone, req.user.sub);
    if (!ok) return res.status(403).json({ error: 'Không đủ quyền' });
  }

  const chat = db.prepare('SELECT * FROM chats WHERE customer_phone = ?').get(req.params.phone);
  if (!chat) return res.json({ chat: null, messages: [] });

  const messages = db.prepare(
    'SELECT * FROM messages WHERE chat_id = ? ORDER BY sent_at'
  ).all(chat.id);
  res.json({ chat, messages });
});

router.post('/:phone/messages', auth(), (req, res) => {
  const { text } = req.body || {};
  if (!text || !text.trim()) return res.status(400).json({ error: 'Tin nhắn rỗng' });

  const isCustomer = req.user.role === 'customer';
  if (isCustomer) {
    const me = db.prepare('SELECT phone FROM customers WHERE id = ?').get(req.user.sub);
    if (!me || me.phone !== req.params.phone) {
      return res.status(403).json({ error: 'Không đủ quyền' });
    }
  }

  /* Ensure chat row exists */
  let chat = db.prepare('SELECT id FROM chats WHERE customer_phone = ?').get(req.params.phone);
  if (!chat) {
    let name = req.params.phone;
    const c = db.prepare('SELECT full_name FROM customers WHERE phone = ?').get(req.params.phone);
    if (c) name = c.full_name;
    const r = db.prepare('INSERT INTO chats (customer_phone, customer_name) VALUES (?, ?)').run(req.params.phone, name);
    chat = { id: r.lastInsertRowid };
  }

  const sender = isCustomer ? 'customer' : 'admin';
  db.prepare('INSERT INTO messages (chat_id, sender, text) VALUES (?, ?, ?)').run(chat.id, sender, text.trim());

  /* Increment unread counter for the other side */
  if (sender === 'customer') {
    db.prepare(`
      UPDATE chats SET admin_unread = admin_unread + 1, last_message_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(chat.id);
  } else {
    db.prepare(`
      UPDATE chats SET customer_unread = customer_unread + 1, last_message_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(chat.id);
  }

  const message = db.prepare('SELECT * FROM messages WHERE id = last_insert_rowid()').get();
  res.status(201).json({ message });
});

router.patch('/:phone/read', auth(), (req, res) => {
  const isCustomer = req.user.role === 'customer';
  const col = isCustomer ? 'customer_unread' : 'admin_unread';
  const result = db.prepare(`UPDATE chats SET ${col} = 0 WHERE customer_phone = ?`).run(req.params.phone);
  if (result.changes === 0) return res.status(404).json({ error: 'Không tìm thấy thread' });
  res.json({ ok: true });
});

module.exports = router;
