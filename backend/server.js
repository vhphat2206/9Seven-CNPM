/**
 * FFC (Fix Fast Center) — Express API server.
 *
 * Run:
 *   npm install
 *   npm run seed   # one-time: seed admin + technicians + demo data
 *   npm start      # production
 *   npm run dev    # auto-reload on file change
 *
 * Mount points:
 *   /api/auth         — login, register, /me, logout
 *   /api/tickets      — repair tickets CRUD + status flow
 *   /api/bookings     — online booking requests
 *   /api/customers    — customer directory + history
 *   /api/chats        — support chat threads + messages
 *   /api/payments     — payments + invoices
 *   /api/technicians  — KTV directory + workload
 *   /api/parts        — parts inventory (kho linh kiện)
 *   /api/reports      — revenue + stats
 *   /api/health       — liveness probe
 */
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');

const app = express();
const PORT = process.env.PORT || 3001;
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

/* ─── Middleware ─────────────────────────────────────────── */
app.use(cors({ origin: CORS_ORIGIN === '*' ? true : CORS_ORIGIN.split(','), credentials: true }));
app.use(express.json({ limit: '2mb' }));
app.use(morgan('dev'));

/* ─── Routes ─────────────────────────────────────────────── */
app.use('/api/auth',        require('./routes/auth'));
app.use('/api/tickets',     require('./routes/tickets'));
app.use('/api/bookings',    require('./routes/bookings'));
app.use('/api/customers',   require('./routes/customers'));
app.use('/api/chats',       require('./routes/chats'));
app.use('/api/payments',    require('./routes/payments'));
app.use('/api/technicians', require('./routes/technicians'));
app.use('/api/parts',       require('./routes/parts'));
app.use('/api/reports',     require('./routes/reports'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/pricing',     require('./routes/pricing'));

/* ─── Health probe ───────────────────────────────────────── */
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'ffc-backend', timestamp: new Date().toISOString() });
});

/* ─── Root info ──────────────────────────────────────────── */
app.get('/', (_req, res) => {
  res.json({
    name: 'FFC Backend API',
    version: '1.0.0',
    endpoints: [
      'POST   /api/auth/login',
      'POST   /api/auth/register',
      'GET    /api/auth/me',
      'GET    /api/tickets',
      'POST   /api/tickets',
      'PATCH  /api/tickets/:code/status',
      'GET    /api/bookings',
      'POST   /api/bookings',
      'POST   /api/bookings/:id/confirm',
      'GET    /api/customers',
      'GET    /api/chats',
      'POST   /api/chats/:phone/messages',
      'POST   /api/payments',
      'GET    /api/technicians',
      'GET    /api/reports/revenue',
    ],
  });
});

/* ─── 404 + global error handler ─────────────────────────── */
app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

app.use((err, _req, res, _next) => {
  console.error('[ERROR]', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
  });
});

app.listen(PORT, () => {
  console.log(`✓ FFC backend running on http://localhost:${PORT}`);
  console.log(`✓ CORS origin: ${CORS_ORIGIN}`);
});
