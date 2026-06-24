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
const { sendOtpEmail } = require('../services/mailer');

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

  /* Fallback: customer (lookup by username OR phone OR email) */
  const ident = String(username).trim();
  const customer = db.prepare(
    `SELECT id, phone, username, full_name, email, address, password, avatar_url
     FROM customers
     WHERE username = ? OR REPLACE(phone, ' ', '') = ? OR LOWER(email) = LOWER(?)`
  ).get(ident, ident, ident);

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
  const {
    phone, username, full_name, password, email, address, birthday,
    /* Hồ sơ mở rộng (optional) */
    student_profile,   // { type, level, school, student_id, cccd, card_name, card_exp, school_email, card_front, card_back }
    business_profile,  // { tax_code, company_name, company_address, company_email, auth_person_cccd, note, license, auth_letter }
  } = req.body || {};
  if (!phone || !username || !full_name || !password) {
    return res.status(400).json({ error: 'Thiếu thông tin bắt buộc (họ tên, số điện thoại, tên đăng nhập, mật khẩu)' });
  }
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return res.status(400).json({ error: 'Email không hợp lệ (cần để gửi OTP khi quên mật khẩu)' });
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
    /* Quyết định account_type theo profile có được gửi không */
    let account_type = 'individual';
    if (business_profile && business_profile.tax_code) account_type = 'business';
    else if (student_profile && student_profile.type)   account_type = 'student';

    const result = db.prepare(`
      INSERT INTO customers (phone, username, full_name, email, address, birthday, password, account_type)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(String(phone).replace(/\s/g, ''), username.toLowerCase(), full_name, email || null, address || null, birthday || null, hash, account_type);

    const id = result.lastInsertRowid;

    /* Tạo profile row nếu có dữ liệu — auto-approve cho demo */
    if (account_type === 'student' && student_profile) {
      db.prepare(`
        INSERT INTO student_profiles
          (customer_id, student_type, level, school, student_id, cccd, card_name, card_exp, school_email, card_front_url, card_back_url, status, reviewed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved', CURRENT_TIMESTAMP)
      `).run(
        id,
        student_profile.type || 'student',
        student_profile.level || null,
        student_profile.school || null,
        student_profile.student_id || null,
        student_profile.cccd || null,
        student_profile.card_name || null,
        student_profile.card_exp || null,
        student_profile.school_email || null,
        student_profile.card_front || null,
        student_profile.card_back || null,
      );
    } else if (account_type === 'business' && business_profile) {
      db.prepare(`
        INSERT INTO business_profiles
          (customer_id, tax_code, company_name, company_address, company_email, auth_person_cccd, note, license_url, auth_letter_url, status, reviewed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved', CURRENT_TIMESTAMP)
      `).run(
        id,
        business_profile.tax_code,
        business_profile.company_name || null,
        business_profile.company_address || null,
        business_profile.company_email || null,
        business_profile.auth_person_cccd || null,
        business_profile.note || null,
        business_profile.license || null,
        business_profile.auth_letter || null,
      );
    }

    const token = signToken({ sub: id, role: 'customer', name: full_name, phone, username });
    res.status(201).json({
      token,
      customer: { id, phone, username, full_name, email, address, birthday, account_type },
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
      'SELECT id, phone, full_name, email, address, avatar_url, birthday, gender, account_type, created_at FROM customers WHERE id = ?'
    ).get(sub);
    if (!me) return res.status(404).json({ error: 'Không tìm thấy khách hàng' });
    /* Đính kèm profile mở rộng nếu có */
    if (me.account_type === 'student') {
      me.student_profile = db.prepare(
        'SELECT student_type, level, school, student_id, cccd, card_name, card_exp, school_email, status FROM student_profiles WHERE customer_id = ?'
      ).get(sub) || null;
    } else if (me.account_type === 'business') {
      me.business_profile = db.prepare(
        'SELECT tax_code, company_name, company_address, company_email, auth_person_cccd, status FROM business_profiles WHERE customer_id = ?'
      ).get(sub) || null;
    }
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

/* ─── Forgot password — Step 1: generate + send OTP ────────
   POST /auth/forgot { email }
   - Tìm customer theo email
   - Sinh OTP 6 số, lưu DB (TTL 5 phút), gọi mailer
   - Trả về { ok, devOtp? } (devOtp chỉ có ở demo mode để frontend hiện toast)
*/
router.post('/forgot', async (req, res) => {
  const { email } = req.body || {};
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return res.status(400).json({ error: 'Email không hợp lệ' });
  }
  const customer = db.prepare('SELECT id, full_name FROM customers WHERE email = ?').get(email);
  if (!customer) {
    /* Không lộ thông tin email không tồn tại — vẫn trả ok */
    return res.json({ ok: true, message: 'Nếu email tồn tại, mã OTP đã được gửi.' });
  }
  /* Rate-limit: tối đa 3 OTP trong 5 phút cho 1 email */
  const recent = db.prepare(
    "SELECT COUNT(*) AS c FROM password_resets WHERE email = ? AND created_at > datetime('now', '-5 minutes')"
  ).get(email);
  if (recent.c >= 3) {
    return res.status(429).json({ error: 'Bạn đã yêu cầu OTP quá nhiều lần. Vui lòng đợi 5 phút.' });
  }
  /* Invalidate tất cả OTP cũ chưa dùng → mỗi request là clean slate */
  db.prepare('UPDATE password_resets SET used = 1 WHERE email = ? AND used = 0').run(email);

  /* Sinh OTP 6 số */
  const otp = String(Math.floor(100000 + Math.random() * 900000));
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  db.prepare(`
    INSERT INTO password_resets (email, otp, expires_at, ip)
    VALUES (?, ?, ?, ?)
  `).run(email, otp, expiresAt, req.ip || null);

  try {
    const { devOtp } = await sendOtpEmail({ to: email, otp, fullName: customer.full_name });
    /* devOtp chỉ trả khi demo mode */
    return res.json({ ok: true, message: 'Mã OTP đã được gửi tới email.', devOtp });
  } catch (err) {
    console.error('[forgot] mailer error:', err);
    return res.status(500).json({ error: 'Lỗi gửi email. Vui lòng thử lại sau.' });
  }
});

/* ─── Forgot password — Step 1.5: verify OTP only (không đổi MK) ──
   POST /auth/verify-otp { email, otp } → 200 nếu OTP đúng + còn hạn
   - Không mark `used=1` để Step 2 (reset-password) còn verify lại
   - Có tăng `attempts` để rate-limit
*/
router.post('/verify-otp', (req, res) => {
  const { email, otp } = req.body || {};
  if (!email || !otp) return res.status(400).json({ error: 'Thiếu email hoặc OTP' });
  const row = db.prepare(`
    SELECT * FROM password_resets
    WHERE email = ? AND used = 0
    ORDER BY created_at DESC LIMIT 1
  `).get(email);
  if (!row) return res.status(404).json({ error: 'Chưa có OTP cho email này. Vui lòng yêu cầu lại.' });
  if (new Date(row.expires_at) < new Date()) {
    return res.status(400).json({ error: 'OTP đã hết hạn. Vui lòng yêu cầu mã mới.' });
  }
  if (row.attempts >= 5) {
    return res.status(429).json({ error: 'Sai OTP quá 5 lần. Vui lòng yêu cầu mã mới.' });
  }
  if (row.otp !== String(otp).trim()) {
    db.prepare('UPDATE password_resets SET attempts = attempts + 1 WHERE id = ?').run(row.id);
    return res.status(400).json({ error: 'Mã OTP không đúng' });
  }
  res.json({ ok: true });
});

/* ─── Forgot password — Step 2: verify OTP + đổi mật khẩu ──
   POST /auth/reset-password { email, otp, new_password }
*/
router.post('/reset-password', (req, res) => {
  const { email, otp, new_password } = req.body || {};
  if (!email || !otp || !new_password) {
    return res.status(400).json({ error: 'Thiếu email, OTP hoặc mật khẩu mới' });
  }
  if (new_password.length < 8 || !/[A-Z]/.test(new_password) || !/[a-z]/.test(new_password) || !/\d/.test(new_password)) {
    return res.status(400).json({ error: 'Mật khẩu tối thiểu 8 ký tự, gồm chữ HOA, chữ thường và số' });
  }
  /* Lấy OTP mới nhất chưa dùng cho email này */
  const row = db.prepare(`
    SELECT * FROM password_resets
    WHERE email = ? AND used = 0
    ORDER BY created_at DESC LIMIT 1
  `).get(email);
  if (!row) return res.status(404).json({ error: 'Chưa có OTP cho email này. Vui lòng yêu cầu lại.' });
  if (new Date(row.expires_at) < new Date()) {
    return res.status(400).json({ error: 'OTP đã hết hạn. Vui lòng yêu cầu mã mới.' });
  }
  if (row.attempts >= 5) {
    return res.status(429).json({ error: 'Sai OTP quá 5 lần. Vui lòng yêu cầu mã mới.' });
  }
  if (row.otp !== String(otp).trim()) {
    db.prepare('UPDATE password_resets SET attempts = attempts + 1 WHERE id = ?').run(row.id);
    return res.status(400).json({ error: 'Mã OTP không đúng' });
  }
  /* Update password + đánh dấu OTP đã dùng */
  const hash = bcrypt.hashSync(new_password, 10);
  db.prepare('UPDATE customers SET password = ?, updated_at = CURRENT_TIMESTAMP WHERE email = ?').run(hash, email);
  db.prepare('UPDATE password_resets SET used = 1 WHERE id = ?').run(row.id);
  res.json({ ok: true, message: 'Đặt lại mật khẩu thành công. Vui lòng đăng nhập với mật khẩu mới.' });
});

module.exports = router;
