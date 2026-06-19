/**
 * Notification service — central place to create in-app bell notifications.
 *
 * Targets:
 *   - `customer_id` for customers
 *   - `user_id` for staff (admin/manager/cashier/reception)
 *   - `broadcastStaff()` notifies ALL active staff
 *
 * Frontend polls /api/notifications/unread-count every ~10s and refreshes the
 * dropdown when the bell is clicked.
 */
const db = require('../db');

function notifyCustomer({ customer_id, type, title, message, entity_type, entity_code }) {
  if (!customer_id) return;
  db.prepare(`
    INSERT INTO notifications (customer_id, type, title, message, entity_type, entity_code)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(customer_id, type, title, message, entity_type || null, entity_code || null);
}

function notifyUser({ user_id, type, title, message, entity_type, entity_code }) {
  if (!user_id) return;
  db.prepare(`
    INSERT INTO notifications (user_id, type, title, message, entity_type, entity_code)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(user_id, type, title, message, entity_type || null, entity_code || null);
}

/* Broadcast to all active staff (admin + manager + reception + cashier). */
function broadcastStaff({ type, title, message, entity_type, entity_code, exceptUserId }) {
  const staff = db.prepare(
    `SELECT id FROM users WHERE is_active = 1 AND role IN ('admin','manager','reception','cashier')`
  ).all();
  staff.forEach(s => {
    if (exceptUserId && s.id === exceptUserId) return;
    notifyUser({ user_id: s.id, type, title, message, entity_type, entity_code });
  });
}

/* Convenience: notify both customer + relevant staff (used for payments etc.) */
function notifyTicketEvent({ ticket, type, title, customerMessage, staffMessage, exceptUserId }) {
  if (!ticket) return;
  if (ticket.customer_id && customerMessage) {
    notifyCustomer({
      customer_id: ticket.customer_id,
      type,
      title,
      message: customerMessage,
      entity_type: 'ticket',
      entity_code: ticket.code,
    });
  }
  if (staffMessage) {
    broadcastStaff({
      type,
      title,
      message: staffMessage,
      entity_type: 'ticket',
      entity_code: ticket.code,
      exceptUserId,
    });
  }
}

module.exports = { notifyCustomer, notifyUser, broadcastStaff, notifyTicketEvent };
