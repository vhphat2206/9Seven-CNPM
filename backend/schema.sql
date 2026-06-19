-- ============================================================
-- FFC (Fix Fast Center) — Database Schema
-- DB: SQLite 3
-- ============================================================
-- Tables: users, customers, technicians, tickets,
--         ticket_status_history, bookings, chats, messages,
--         payments, parts, part_transactions, audit_log
-- ============================================================

PRAGMA foreign_keys = ON;

-- ============================================================
-- 1. USERS (admin / staff)
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  username     TEXT NOT NULL UNIQUE,
  password     TEXT NOT NULL,                  -- bcrypt hash
  full_name    TEXT NOT NULL,
  email        TEXT,
  role         TEXT NOT NULL CHECK(role IN ('admin','manager','cashier','reception','technician')),
  avatar_url   TEXT,
  is_active    INTEGER NOT NULL DEFAULT 1,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_role     ON users(role);

-- ============================================================
-- 2. CUSTOMERS (khách hàng)
-- ============================================================
CREATE TABLE IF NOT EXISTS customers (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  phone        TEXT NOT NULL UNIQUE,           -- định danh chính
  full_name    TEXT NOT NULL,
  email        TEXT,
  address      TEXT,
  password     TEXT,                            -- bcrypt; NULL nếu khách walk-in
  birthday     DATE,
  gender       TEXT CHECK(gender IN ('male','female','other')),
  avatar_url   TEXT,
  total_spent  INTEGER NOT NULL DEFAULT 0,     -- denormalized cache
  ticket_count INTEGER NOT NULL DEFAULT 0,
  last_visit   DATETIME,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
CREATE INDEX IF NOT EXISTS idx_customers_name  ON customers(full_name);

-- ============================================================
-- 3. TECHNICIANS (kỹ thuật viên)
-- ============================================================
CREATE TABLE IF NOT EXISTS technicians (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id        INTEGER UNIQUE,                -- liên kết users (nếu KTV cũng login)
  name           TEXT NOT NULL,
  specialty      TEXT,                          -- "iPhone", "Mainboard laptop", ...
  color          TEXT NOT NULL DEFAULT '#2563eb',
  hire_date      DATE,
  active_tickets INTEGER NOT NULL DEFAULT 0,    -- denormalized counter
  completed_total INTEGER NOT NULL DEFAULT 0,
  is_active      INTEGER NOT NULL DEFAULT 1,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_technicians_active ON technicians(is_active);

-- ============================================================
-- 4. TICKETS (phiếu sửa chữa)
-- ============================================================
CREATE TABLE IF NOT EXISTS tickets (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  code            TEXT NOT NULL UNIQUE,         -- "FFC-0094"
  customer_id     INTEGER NOT NULL,
  technician_id   INTEGER,
  device          TEXT NOT NULL,                -- "iPhone 13 Pro 128GB"
  device_type     TEXT,                          -- phone/laptop/mac/other
  imei            TEXT,
  color           TEXT,
  issue           TEXT NOT NULL,
  accessories     TEXT,                          -- JSON array
  quote           INTEGER NOT NULL DEFAULT 0,   -- giá báo (VND)
  status          TEXT NOT NULL DEFAULT 'waiting'
                   CHECK(status IN ('waiting','in-progress','testing','done','delivered','cancelled')),
  urgent          INTEGER NOT NULL DEFAULT 0,
  priority        TEXT DEFAULT 'normal' CHECK(priority IN ('normal','urgent','vip')),
  source          TEXT NOT NULL DEFAULT 'walkin' CHECK(source IN ('walkin','online','phone')),
  internal_note   TEXT,
  due_date        DATE,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_status_at  DATETIME,
  FOREIGN KEY (customer_id)  REFERENCES customers(id)   ON DELETE RESTRICT,
  FOREIGN KEY (technician_id) REFERENCES technicians(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_tickets_code         ON tickets(code);
CREATE INDEX IF NOT EXISTS idx_tickets_customer     ON tickets(customer_id);
CREATE INDEX IF NOT EXISTS idx_tickets_technician   ON tickets(technician_id);
CREATE INDEX IF NOT EXISTS idx_tickets_status       ON tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_created      ON tickets(created_at DESC);

-- ============================================================
-- 5. TICKET_STATUS_HISTORY (log timeline)
-- ============================================================
CREATE TABLE IF NOT EXISTS ticket_status_history (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id    INTEGER NOT NULL,
  from_status  TEXT,
  to_status    TEXT NOT NULL,
  changed_by   INTEGER,                          -- user_id
  note         TEXT,
  changed_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (ticket_id)  REFERENCES tickets(id) ON DELETE CASCADE,
  FOREIGN KEY (changed_by) REFERENCES users(id)   ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_tsh_ticket ON ticket_status_history(ticket_id, changed_at DESC);

-- ============================================================
-- 6. BOOKINGS (khách đặt lịch online — chưa xác nhận thành ticket)
-- ============================================================
CREATE TABLE IF NOT EXISTS bookings (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  code            TEXT NOT NULL UNIQUE,         -- "FFC-ONL-001"
  customer_name   TEXT NOT NULL,
  customer_phone  TEXT NOT NULL,
  customer_email  TEXT,
  service_type    TEXT,                          -- phone/laptop/mac/clean/data/...
  device          TEXT NOT NULL,
  issue           TEXT NOT NULL,
  method          TEXT NOT NULL CHECK(method IN ('store','ship','onsite')),
  address         TEXT,
  appointment_date DATE,
  time_slot       TEXT,                          -- "9-11" / "14-16" / "16-18" / "anytime"
  note            TEXT,
  status          TEXT NOT NULL DEFAULT 'pending'
                   CHECK(status IN ('pending','confirmed','rejected','converted')),
  ticket_id       INTEGER,                       -- nếu đã convert → ticket
  rejected_reason TEXT,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);
CREATE INDEX IF NOT EXISTS idx_bookings_phone  ON bookings(customer_phone);

-- ============================================================
-- 7. CHATS (cuộc trò chuyện khách ↔ admin)
-- ============================================================
CREATE TABLE IF NOT EXISTS chats (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_phone  TEXT NOT NULL UNIQUE,
  customer_name   TEXT NOT NULL,
  customer_unread INTEGER NOT NULL DEFAULT 0,
  admin_unread    INTEGER NOT NULL DEFAULT 0,
  last_message_at DATETIME,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_chats_phone ON chats(customer_phone);
CREATE INDEX IF NOT EXISTS idx_chats_last  ON chats(last_message_at DESC);

-- ============================================================
-- 8. MESSAGES (tin nhắn trong từng chat)
-- ============================================================
CREATE TABLE IF NOT EXISTS messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id    INTEGER NOT NULL,
  sender     TEXT NOT NULL CHECK(sender IN ('customer','admin','system')),
  text       TEXT NOT NULL,
  sent_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_messages_chat ON messages(chat_id, sent_at);

-- ============================================================
-- 9. PAYMENTS (thanh toán)
-- ============================================================
CREATE TABLE IF NOT EXISTS payments (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_no     TEXT NOT NULL UNIQUE,           -- "INV-2026-0142"
  ticket_id      INTEGER NOT NULL,
  customer_id    INTEGER NOT NULL,
  amount         INTEGER NOT NULL,                -- subtotal
  discount_pct   REAL NOT NULL DEFAULT 0,
  discount_amount INTEGER NOT NULL DEFAULT 0,
  final_amount   INTEGER NOT NULL,                -- amount - discount
  method         TEXT NOT NULL CHECK(method IN ('cash','bank','card','pickup')),
  received       INTEGER,                          -- khách đưa
  change_back    INTEGER,                          -- tiền thối
  note           TEXT,
  cashier_id     INTEGER,
  paid_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (ticket_id)   REFERENCES tickets(id)   ON DELETE RESTRICT,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT,
  FOREIGN KEY (cashier_id)  REFERENCES users(id)     ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_payments_ticket  ON payments(ticket_id);
CREATE INDEX IF NOT EXISTS idx_payments_paid_at ON payments(paid_at DESC);

-- ============================================================
-- 10. PARTS (kho linh kiện) — placeholder cho pane "Kho linh kiện"
-- ============================================================
CREATE TABLE IF NOT EXISTS parts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  sku         TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  category    TEXT NOT NULL,
  unit_cost   INTEGER NOT NULL DEFAULT 0,
  unit_price  INTEGER NOT NULL DEFAULT 0,
  stock       INTEGER NOT NULL DEFAULT 0,
  min_stock   INTEGER NOT NULL DEFAULT 5,
  unit        TEXT NOT NULL DEFAULT 'cái',
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_parts_sku       ON parts(sku);
CREATE INDEX IF NOT EXISTS idx_parts_category  ON parts(category);

-- ============================================================
-- 11. PART_TRANSACTIONS (nhập/xuất kho)
-- ============================================================
CREATE TABLE IF NOT EXISTS part_transactions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  part_id    INTEGER NOT NULL,
  type       TEXT NOT NULL CHECK(type IN ('in','out','adjust')),
  quantity   INTEGER NOT NULL,
  ticket_id  INTEGER,                            -- nếu xuất gắn vào phiếu
  note       TEXT,
  created_by INTEGER,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (part_id)    REFERENCES parts(id)    ON DELETE RESTRICT,
  FOREIGN KEY (ticket_id)  REFERENCES tickets(id)  ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users(id)    ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_pt_part ON part_transactions(part_id, created_at DESC);

-- ============================================================
-- 12.5 NOTIFICATIONS (in-app bell)
-- ============================================================
CREATE TABLE IF NOT EXISTS notifications (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER,                      -- staff user (NULL if customer)
  customer_id   INTEGER,                       -- customer (NULL if staff)
  type          TEXT NOT NULL,                 -- ticket_status / payment / booking_new / ktv_assigned / ...
  title         TEXT NOT NULL,
  message       TEXT NOT NULL,
  entity_type   TEXT,                          -- ticket / booking / payment
  entity_code   TEXT,                          -- FFC-0001 / INV-2026-0142 / ...
  is_read       INTEGER NOT NULL DEFAULT 0,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id)     REFERENCES users(id)     ON DELETE CASCADE,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_notif_user     ON notifications(user_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notif_customer ON notifications(customer_id, is_read, created_at DESC);

-- ============================================================
-- 13. AUDIT_LOG (kiểm toán hành động)
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER,
  action     TEXT NOT NULL,
  entity     TEXT NOT NULL,
  entity_id  TEXT,
  details    TEXT,
  ip         TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_user   ON audit_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity, entity_id);

-- ============================================================
-- 14. PRICING (bảng giá tham khảo cho khách tra cứu)
-- Khách chọn: device_type → device_model → issue_type → ra giá
-- ============================================================
CREATE TABLE IF NOT EXISTS pricing (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  device_type     TEXT NOT NULL,                 -- 'iphone' / 'android' / 'macbook' / 'laptop' / 'pc'
  device_model    TEXT NOT NULL,                 -- 'iPhone 14' / 'Galaxy S24' / ...
  issue_code      TEXT NOT NULL,                 -- 'screen' / 'battery' / 'mainboard' / 'charging_port' / ...
  issue_label     TEXT NOT NULL,                 -- 'Bể màn hình'
  price_from      INTEGER NOT NULL,              -- VND
  price_to        INTEGER NOT NULL,
  warranty_days   INTEGER NOT NULL DEFAULT 90,
  est_hours       INTEGER NOT NULL DEFAULT 2,    -- thời gian xử lý ước tính (giờ)
  is_active       INTEGER NOT NULL DEFAULT 1,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_pricing_lookup ON pricing(device_type, device_model, issue_code);
