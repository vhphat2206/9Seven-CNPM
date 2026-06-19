/**
 * /api/auth — login (admin + customer), register (customer),
 *             current-user info, profile update.
 *
 *   POST /api/auth/login        { username, password }            → token + user
 *   POST /api/auth/login/customer { phone, password }             → token + customer
 *   POST /api/auth/register     { phone, full_name, password, ...} → token + customer
 *   GET  /api/auth/me           Authorization: Bearer <token>     → current user
 *   PUT  /api/auth/me           { full_name, email, address, ... }→ updated profile
 */
const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { auth, signToken } = require('../middleware/auth');

const router = express.Router();

/* ─── Admin / staff login ─────────────────────────────────── */
router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Thiếu username hoặc password' });
  }

  const user = db.prepare(
    'SELECT id, username, password, full_name, email, role, avatar_url, is_active FROM users WHERE username = ?'
  ).get(username);

  if (!user || !user.is_active) {
    return res.status(401).json({ error: 'Tài khoản không tồn tại hoặc đã bị khoá' });
  }
  if (!bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Mật khẩu không đúng' });
  }

  const token = signToken({
    sub: user.id, role: user.role, name: user.full_name, username: user.username,
  });
  const { password: _, ...safeUser } = user;
  res.json({ token, user: safeUser });
});

/* ─── Customer login (by phone + password) ───────────────── */
router.post('/login/customer', (req, res) => {
  const { phone, password } = req.body || {};
  if (!phone || !password) {
    return res.status(400).json({ error: 'Thiếu số điện thoại hoặc mật khẩu' });
  }

  const phoneKey = String(phone).replace(/\s/g, '');
  const customer = db.prepare(
    `SELECT id, phone, full_name, email, address, password, avatar_url
     FROM customers WHERE REPLACE(phone, ' ', '') = ?`
  ).get(phoneKey);

  if (!customer || !customer.password) {
    return res.status(401).json({ error: 'Số điện thoại chưa đăng ký hoặc chưa đặt mật khẩu' });
  }
  if (!bcrypt.compareSync(password, customer.password)) {
    return res.status(401).json({ error: 'Mật khẩu không đúng' });
  }

  const token = signToken({
    sub: customer.id, role: 'customer', name: customer.full_name, phone: customer.phone,
  });
  const { password: _, ...safeCustomer } = customer;
  res.json({ token, customer: safeCustomer });
});

/* ─── Customer self-register ──────────────────────────────── */
router.post('/register', (req, res) => {
  const { phone, full_name, password, email, address } = req.body || {};
  if (!phone || !full_name || !password) {
    return res.status(400).json({ error: 'Thiếu thông tin bắt buộc (phone, full_name, password)' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Mật khẩu phải tối thiểu 6 ký tự' });
  }

  const hash = bcrypt.hashSync(password, 10);

  try {
    const result = db.prepare(`
      INSERT INTO customers (phone, full_name, email, address, password)
      VALUES (?, ?, ?, ?, ?)
    `).run(phone, full_name, email || null, address || null, hash);

    const id = result.lastInsertRowid;
    const token = signToken({ sub: id, role: 'customer', name: full_name, phone });
    res.status(201).json({
      token,
      customer: { id, phone, full_name, email, address },
    });
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ error: 'Số điện thoại đã được đăng ký' });
    }
    throw err;
  }
});

/* ─── Current user info ──────────────────────────────────── */
router.get('/me', auth(), (req, res) => {
  const { sub, role } = req.user;
  if (role === 'customer') {
    const me = db.prepare(
      'SELECT id, phone, full_name, email, address, avatar_url, birthday, gender, created_at FROM customers WHERE id = ?'
    ).get(sub);
    if (!me) return res.status(404).json({ error: 'Không tìm thấy khách hàng' });
    return res.json({ role, customer: me });
  }
  const u = db.prepare(
    'SELECT id, username, full_name, email, role, avatar_url, created_at FROM users WHERE id = ?'
  ).get(sub);
  if (!u) return res.status(404).json({ error: 'Không tìm thấy user' });
  res.json({ role, user: u });
});

/* ─── Update current profile ─────────────────────────────── */
router.put('/me', auth(), (req, res) => {
  const { sub, role } = req.user;
  const { full_name, email, address, avatar_url, birthday, gender, current_password, new_password } = req.body || {};

  if (role === 'customer') {
    const existing = db.prepare('SELECT password FROM customers WHERE id = ?').get(sub);
    let passwordToSet = existing?.password;
    if (new_password) {
      if (!current_password || !bcrypt.compareSync(current_password, existing.password)) {
        return res.status(401).json({ error: 'Mật khẩu hiện tại không đúng' });
      }
      passwordToSet = bcrypt.hashSync(new_password, 10);
    }
    db.prepare(`
      UPDATE customers SET
        full_name = COALESCE(?, full_name),
        email     = COALESCE(?, email),
        address   = COALESCE(?, address),
        avatar_url= COALESCE(?, avatar_url),
        birthday  = COALESCE(?, birthday),
        gender    = COALESCE(?, gender),
        password  = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(full_name, email, address, avatar_url, birthday, gender, passwordToSet, sub);

    const updated = db.prepare(
      'SELECT id, phone, full_name, email, address, avatar_url, birthday, gender FROM customers WHERE id = ?'
    ).get(sub);
    return res.json({ customer: updated });
  }

  /* Admin/staff update */
  const existing = db.prepare('SELECT password FROM users WHERE id = ?').get(sub);
  let passwordToSet = existing?.password;
  if (new_password) {
    if (!current_password || !bcrypt.compareSync(current_password, existing.password)) {
      return res.status(401).json({ error: 'Mật khẩu hiện tại không đúng' });
    }
    passwordToSet = bcrypt.hashSync(new_password, 10);
  }
  db.prepare(`
    UPDATE users SET
      full_name = COALESCE(?, full_name),
      email     = COALESCE(?, email),
      avatar_url= COALESCE(?, avatar_url),
      password  = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(full_name, email, avatar_url, passwordToSet, sub);

  const updated = db.prepare(
    'SELECT id, username, full_name, email, role, avatar_url FROM users WHERE id = ?'
  ).get(sub);
  res.json({ user: updated });
});

module.exports = router;
