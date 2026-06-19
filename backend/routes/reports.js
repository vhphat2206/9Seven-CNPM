/**
 * /api/reports — analytics & dashboards
 *
 *   GET  /overview            top-level KPIs (today, this week, this month)
 *   GET  /revenue?from=&to=   revenue grouped by day
 *   GET  /tickets-by-status   count of tickets per status
 *   GET  /top-technicians     KTV ranking (revenue + ticket count)
 *   GET  /top-devices         most repaired device types
 */
const express = require('express');
const db = require('../db');
const { auth } = require('../middleware/auth');

const router = express.Router();

router.get('/overview', auth(['admin', 'manager']), (_req, res) => {
  const today = new Date().toISOString().slice(0, 10);

  const ticketsToday = db.prepare(`
    SELECT COUNT(*) AS count FROM tickets WHERE DATE(created_at) = ?
  `).get(today).count;

  const revenueToday = db.prepare(`
    SELECT COALESCE(SUM(final_amount), 0) AS sum FROM payments WHERE DATE(paid_at) = ?
  `).get(today).sum;

  const inProgress = db.prepare(`
    SELECT COUNT(*) AS count FROM tickets WHERE status IN ('in-progress','testing')
  `).get().count;

  const completedToday = db.prepare(`
    SELECT COUNT(*) AS count FROM tickets WHERE status IN ('done','delivered') AND DATE(last_status_at) = ?
  `).get(today).count;

  const pendingPayments = db.prepare(`
    SELECT COUNT(*) AS count, COALESCE(SUM(quote), 0) AS total
    FROM tickets WHERE quote > 0
      AND status = 'done'
      AND id NOT IN (SELECT ticket_id FROM payments)
  `).get();

  res.json({
    today: {
      tickets:   ticketsToday,
      revenue:   revenueToday,
      completed: completedToday,
    },
    in_progress: inProgress,
    pending_payments: pendingPayments,
  });
});

router.get('/revenue', auth(['admin', 'manager']), (req, res) => {
  const { from, to } = req.query;
  let sql = `
    SELECT DATE(paid_at) AS day, COUNT(*) AS count, COALESCE(SUM(final_amount), 0) AS revenue
    FROM payments WHERE 1=1
  `;
  const params = [];
  if (from) { sql += ' AND DATE(paid_at) >= ?'; params.push(from); }
  if (to)   { sql += ' AND DATE(paid_at) <= ?'; params.push(to); }
  sql += ' GROUP BY DATE(paid_at) ORDER BY day';
  res.json({ data: db.prepare(sql).all(...params) });
});

router.get('/tickets-by-status', auth(['admin', 'manager']), (_req, res) => {
  const rows = db.prepare(`
    SELECT status, COUNT(*) AS count FROM tickets GROUP BY status
  `).all();
  res.json({ data: rows });
});

router.get('/top-technicians', auth(['admin', 'manager']), (req, res) => {
  const limit = Math.min(50, parseInt(req.query.limit) || 10);
  const rows = db.prepare(`
    SELECT t.id, t.name, t.specialty,
           COUNT(DISTINCT tk.id) AS ticket_count,
           COALESCE(SUM(p.final_amount), 0) AS revenue
    FROM technicians t
    LEFT JOIN tickets tk ON tk.technician_id = t.id
    LEFT JOIN payments p ON p.ticket_id = tk.id
    WHERE t.is_active = 1
    GROUP BY t.id
    ORDER BY revenue DESC
    LIMIT ?
  `).all(limit);
  res.json({ data: rows });
});

router.get('/top-devices', auth(['admin', 'manager']), (req, res) => {
  const limit = Math.min(50, parseInt(req.query.limit) || 10);
  const rows = db.prepare(`
    SELECT device_type, COUNT(*) AS count
    FROM tickets WHERE device_type IS NOT NULL
    GROUP BY device_type
    ORDER BY count DESC
    LIMIT ?
  `).all(limit);
  res.json({ data: rows });
});

module.exports = router;
