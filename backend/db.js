/**
 * SQLite connection — single shared instance.
 * Schema runs on first import if DB file is missing.
 */
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'ffc.db');
const DATA_DIR = path.dirname(DB_PATH);
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

/* Initialize schema on first run */
const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);

/* ─── Migrations cho DB cũ ─────────────────────────────────
   CREATE TABLE IF NOT EXISTS không cập nhật CHECK constraint
   nếu bảng đã tồn tại. Ta phải migrate tay cho các DB cũ. */
(function migrateCustomersUsername() {
  const cols = db.prepare("PRAGMA table_info(customers)").all();
  const hasUsername = cols.find(c => c.name === 'username');
  if (!hasUsername) {
    console.log('[migration] customers.username column thiếu — đang thêm...');
    db.exec('ALTER TABLE customers ADD COLUMN username TEXT');
    console.log('[migration] customers.username added OK');
  }
  /* Index idempotent — chạy mỗi lần startup */
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_username ON customers(username)');
})();

(function migrateUsersRoleCheck() {
  const row = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'").get();
  if (!row || row.sql.includes("'technician'")) return;
  console.log('[migration] users.role CHECK thiếu technician — đang migrate...');
  db.exec(`
    PRAGMA foreign_keys = OFF;
    BEGIN;
    CREATE TABLE users_new (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      username     TEXT NOT NULL UNIQUE,
      password     TEXT NOT NULL,
      full_name    TEXT NOT NULL,
      email        TEXT,
      role         TEXT NOT NULL CHECK(role IN ('admin','manager','cashier','reception','technician')),
      avatar_url   TEXT,
      is_active    INTEGER NOT NULL DEFAULT 1,
      created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    INSERT INTO users_new SELECT * FROM users;
    DROP TABLE users;
    ALTER TABLE users_new RENAME TO users;
    CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
    CREATE INDEX IF NOT EXISTS idx_users_role     ON users(role);
    COMMIT;
    PRAGMA foreign_keys = ON;
  `);
  console.log('[migration] users.role CHECK migrated OK');
})();

/* Migration: account_type cho customers (individual/student/business) */
(function migrateAccountType() {
  const cols = db.prepare("PRAGMA table_info(customers)").all();
  if (!cols.find(c => c.name === 'account_type')) {
    console.log('[migration] customers.account_type thiếu — đang thêm...');
    db.exec("ALTER TABLE customers ADD COLUMN account_type TEXT NOT NULL DEFAULT 'individual'");
    console.log('[migration] customers.account_type added OK');
  }
})();

module.exports = db;
