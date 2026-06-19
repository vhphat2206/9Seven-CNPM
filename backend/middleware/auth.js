/**
 * JWT authentication + role-based access middleware.
 *
 * Token payload schema:
 *   { sub: <id>, role: 'admin'|'customer', name: <string>, ... }
 *
 * Usage:
 *   router.get('/', auth(), handler)              // any logged-in user
 *   router.post('/', auth(['admin']), handler)    // admins only
 */
const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET || 'ffc-dev-secret';
const EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

function signToken(payload) {
  return jwt.sign(payload, SECRET, { expiresIn: EXPIRES_IN });
}

function auth(allowedRoles = null) {
  return (req, res, next) => {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Thiếu access token' });

    try {
      const payload = jwt.verify(token, SECRET);
      req.user = payload;
    } catch (err) {
      return res.status(401).json({ error: 'Token không hợp lệ hoặc đã hết hạn' });
    }

    if (allowedRoles && !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Không đủ quyền truy cập' });
    }
    next();
  };
}

module.exports = { auth, signToken };
