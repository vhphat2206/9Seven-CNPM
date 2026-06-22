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
    return res.status(400).json({ error: 'Thiếu tên đăng nhập hoặc mật khẩu' });
  }

  /* Try staff/KTV first (users table) */
  const staff = db.prepare(
    'SELECT id, username, password, full_name, email, role, avatar_url, is_active FROM users WHERE username = ?'
  ).get(username);

  if (staff && staff.is_active) {
    if (!bcrypt.compareSync(password, staff.password)) {
      return res.status(401).json({ error: 'Mật khẩu không đúng' });
    }
    const token = signToken({
      sub: staff.id, role: staff.role, name: staff.full_name, username: staff.username,
    });
    const { password: _, ...safeUser } = staff;
    return res.json({ token, user: safeUser });
  }

  /* Fallback: customer (lookup by username column) */
  const customer = db.prepare(
    `SELECT id, phone, username, full_name, email, address, password, avatar_url
     FROM customers WHERE username = ?`
  ).get(username);

  if (!customer || !customer.password) {
    return res.status(401).json({ error: 'Tài khoản không tồn tại hoặc đã bị khoá' });
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

/* ─── Customer login (by phone OR username + password) ───────
 * Giữ lại để backward-compatible với code FE cũ. */
router.post('/login/customer', (req, res) => {
  const { phone, username, password } = req.body || {};
  const identifier = (username || phone || '').toString().replace(/\s/g, '');
  if (!identifier || !password) {
    return res.status(400).json({ error: 'Thiếu tên đăng nhập/số điện thoại hoặc mật khẩu' });
  }

  const customer = db.prepare(
    `SELECT id, phone, username, full_name, email, address, password, avatar_url
     FROM customers WHERE username = ? OR REPLACE(phone, ' ', '') = ?`
  ).get(identifier, identifier);

  if (!customer || !customer.password) {
    return res.status(401).json({ error: 'Tài khoản không tồn tại hoặc chưa đặt mật khẩu' });
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
  const { phone, username, full_name, password, email, address } = req.body || {};
  if (!phone || !username || !full_name || !password) {
    return res.status(400).json({ error: 'Thiếu thông tin bắt buộc (họ tên, số điện thoại, tên đăng nhập, mật khẩu)' });
  }
  /* Username: only a-z, 0-9, no spaces, no diacritics, no special chars */
  if (!/^[a-z0-9]{3,30}$/.test(username)) {
    return res.status(400).json({ error: 'Tên đăng nhập phải 3-30 ký tự, chỉ chữ thường (a-z) và số (0-9), không dấu, không khoảng trắng, không ký tự đặc biệt' });
  }
  /* Phone: 9-11 digits */
  if (!/^\d{9,11}$/.test(String(phone).replace(/\s/g, ''))) {
    return res.status(400).json({ error: 'Số điện thoại không hợp lệ (9-11 chữ số)' });
  }
  /* Password: ≥8 chars, has uppercase + lowercase + digit */
  if (password.length < 8 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password)) {
    return res.status(400).json({ error: 'Mật khẩu tối thiểu 8 ký tự, gồm chữ hoa, chữ thường và số' });
  }

  const hash = bcrypt.hashSync(password, 10);

  try {
    const result = db.prepare(`
      INSERT INTO customers (phone, username, full_name, email, address, password)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(String(phone).replace(/\s/g, ''), username.toLowerCase(), full_name, email || null, address || null, hash);

    const id = result.lastInsertRowid;
    const token = signToken({ sub: id, role: 'customer', name: full_name, phone, username });
    res.status(201).json({
      token,
      customer: { id, phone, username, full_name, email, address },
    });
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      const msg = err.message.includes('username') ? 'Tên đăng nhập đã tồn tại' : 'Số điện thoại đã được đăng ký';
      return res.status(409).json({ error: msg });
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
