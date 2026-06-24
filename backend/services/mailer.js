/**
 * Mailer service — Gmail SMTP via nodemailer.
 *
 * Setup (1 lần):
 *   1. Vào https://myaccount.google.com/apppasswords (cần bật 2-step verification)
 *   2. Tạo App password mới → copy 16 ký tự (vd: "abcd efgh ijkl mnop")
 *   3. Set env trong file backend/.env hoặc Render dashboard:
 *        GMAIL_USER=your.email@gmail.com
 *        GMAIL_APP_PASSWORD=abcdefghijklmnop  (bỏ khoảng trắng)
 *
 * Khi 2 env này có → mailer gửi email thật.
 * Khi không có → log OTP ra console (dev mode) để dev tự nhìn console mà test.
 */

const nodemailer = require('nodemailer');

const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;
const REAL_EMAIL_ENABLED = !!(GMAIL_USER && GMAIL_APP_PASSWORD);

let transporter = null;
if (REAL_EMAIL_ENABLED) {
  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
  });
  console.log(`[mailer] ✓ Gmail SMTP enabled (sender: ${GMAIL_USER})`);
} else {
  console.log('[mailer] ⚠ GMAIL_USER/GMAIL_APP_PASSWORD chưa set — OTP sẽ log ra console');
}

async function sendOtpEmail({ to, otp, fullName }) {
  const subject = `Mã xác minh FFC: ${otp}`;
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1e293b;background:#fff;border-radius:12px;border:1px solid #e2e8f0">
      <div style="text-align:center;padding-bottom:18px;border-bottom:2px solid #f1f5f9;margin-bottom:18px">
        <h2 style="color:#2563eb;margin:0;font-size:22px;letter-spacing:1px">FFC — FIX FAST CENTER</h2>
        <div style="color:#64748b;font-size:12px;margin-top:4px">Sửa chữa thiết bị điện tử chuyên nghiệp</div>
      </div>
      <p style="margin:0 0 12px">Xin chào <b>${fullName || 'Quý khách'}</b>,</p>
      <p style="margin:0 0 6px">Mã OTP để đặt lại mật khẩu của anh/chị là:</p>
      <div style="font-size:36px;font-weight:800;letter-spacing:10px;color:#dc2626;background:#fef2f2;padding:18px;border-radius:10px;text-align:center;margin:14px 0;font-family:'Courier New',monospace">${otp}</div>
      <p style="color:#64748b;font-size:13px;margin:0 0 6px">⏱ Mã có hiệu lực trong <b>5 phút</b>.</p>
      <p style="color:#64748b;font-size:13px;margin:0">🔒 Không chia sẻ mã cho bất kỳ ai, kể cả nhân viên FFC.</p>
      <p style="color:#94a3b8;font-size:12px;margin-top:24px;padding-top:14px;border-top:1px solid #e2e8f0">
        Nếu anh/chị không yêu cầu đổi mật khẩu, vui lòng bỏ qua email này.<br>
        — FFC Support · <a href="mailto:sam@ffcenter.vn" style="color:#4f46e5;text-decoration:none">sam@ffcenter.vn</a> · 1900 0095
      </p>
    </div>
  `;

  if (REAL_EMAIL_ENABLED) {
    try {
      const info = await transporter.sendMail({
        from: `"FFC — Fix Fast Center" <${GMAIL_USER}>`,
        to, subject, html,
      });
      console.log(`[mailer] ✓ OTP sent to ${to} (messageId: ${info.messageId})`);
      return { sent: true, devOtp: null };
    } catch (err) {
      console.error(`[mailer] ✗ Lỗi gửi email tới ${to}:`, err.message);
      throw err;
    }
  } else {
    /* Dev mode: log ra console để dev tự nhìn */
    console.log('━'.repeat(60));
    console.log(`[mailer] 📧 DEV MODE — OTP for ${to}: ${otp}`);
    console.log(`[mailer]    (set GMAIL_USER + GMAIL_APP_PASSWORD để gửi thật)`);
    console.log('━'.repeat(60));
    /* Vẫn trả devOtp để chấp nhận lúc dev — nhưng frontend giờ không hiển thị nữa */
    return { sent: false, devOtp: otp };
  }
}

module.exports = { sendOtpEmail };
