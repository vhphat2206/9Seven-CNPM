# FFC — Data Dictionary

Hệ thống quản lý cửa hàng sửa chữa FFC (Fix Fast Center). Schema SQLite, 12 bảng. Convention: snake_case, primary key `id` AUTOINCREMENT, timestamp dùng `DATETIME` mặc định `CURRENT_TIMESTAMP`.

---

## Tổng quan các bảng

| # | Table | Số cột | Mô tả |
|---|---|---|---|
| 1 | `users` | 9 | Tài khoản admin/staff (admin, manager, cashier, reception) |
| 2 | `customers` | 13 | Khách hàng — định danh bằng phone |
| 3 | `technicians` | 11 | Kỹ thuật viên + chuyên môn + counter workload |
| 4 | `tickets` | 19 | Phiếu sửa chữa (entity cốt lõi) |
| 5 | `ticket_status_history` | 7 | Log mỗi lần đổi trạng thái phiếu |
| 6 | `bookings` | 16 | Đặt lịch online (trước khi convert thành ticket) |
| 7 | `chats` | 6 | Thread chat hỗ trợ (1 thread / 1 SĐT khách) |
| 8 | `messages` | 5 | Tin nhắn trong thread (customer/admin/system) |
| 9 | `payments` | 14 | Giao dịch thanh toán + hoá đơn |
| 10 | `parts` | 10 | Linh kiện trong kho |
| 11 | `part_transactions` | 8 | Lịch sử nhập/xuất kho |
| 12 | `audit_log` | 8 | Log hành động kiểm toán |

---

## 1. `users` — Tài khoản nhân viên

| Column | Type | Constraints | Mô tả |
|---|---|---|---|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT | Khoá chính |
| username | TEXT | NOT NULL UNIQUE | Tên đăng nhập |
| password | TEXT | NOT NULL | Mật khẩu đã hash (bcrypt, cost=10) |
| full_name | TEXT | NOT NULL | Họ tên đầy đủ |
| email | TEXT | | Email liên hệ |
| role | TEXT | NOT NULL, CHECK IN (admin/manager/cashier/reception) | Vai trò + quyền |
| avatar_url | TEXT | | URL ảnh đại diện |
| is_active | INTEGER | NOT NULL DEFAULT 1 | 1=active, 0=khoá |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | Thời điểm tạo |
| updated_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | Sửa lần cuối |

**Indexes:** `username`, `role`

---

## 2. `customers` — Khách hàng

| Column | Type | Constraints | Mô tả |
|---|---|---|---|
| id | INTEGER | PK AUTOINC | |
| phone | TEXT | NOT NULL UNIQUE | **Định danh chính** |
| full_name | TEXT | NOT NULL | |
| email | TEXT | | |
| address | TEXT | | |
| password | TEXT | | bcrypt; NULL nếu khách walk-in chưa đăng ký |
| birthday | DATE | | |
| gender | TEXT | CHECK IN (male/female/other) | |
| avatar_url | TEXT | | |
| total_spent | INTEGER | NOT NULL DEFAULT 0 | Tổng chi (denormalized cache) |
| ticket_count | INTEGER | NOT NULL DEFAULT 0 | Số phiếu đã tạo |
| last_visit | DATETIME | | Lần ghé gần nhất |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | |
| updated_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | |

**Indexes:** `phone`, `full_name`

---

## 3. `technicians` — Kỹ thuật viên

| Column | Type | Constraints | Mô tả |
|---|---|---|---|
| id | INTEGER | PK AUTOINC | |
| user_id | INTEGER | UNIQUE, FK→users(id) ON DELETE SET NULL | Nếu KTV đồng thời là user |
| name | TEXT | NOT NULL | |
| specialty | TEXT | | VD "iPhone", "Mainboard laptop" |
| color | TEXT | NOT NULL DEFAULT '#2563eb' | Mã màu hiển thị |
| hire_date | DATE | | |
| active_tickets | INTEGER | NOT NULL DEFAULT 0 | Counter denormalized — số phiếu đang xử lý |
| completed_total | INTEGER | NOT NULL DEFAULT 0 | Tổng phiếu đã hoàn thành |
| is_active | INTEGER | NOT NULL DEFAULT 1 | |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | |

**Indexes:** `is_active`

---

## 4. `tickets` — Phiếu sửa chữa (entity cốt lõi)

| Column | Type | Constraints | Mô tả |
|---|---|---|---|
| id | INTEGER | PK AUTOINC | |
| code | TEXT | NOT NULL UNIQUE | VD "FFC-0094", "FFC-ONL-001" |
| customer_id | INTEGER | NOT NULL, FK→customers(id) ON DELETE RESTRICT | |
| technician_id | INTEGER | FK→technicians(id) ON DELETE SET NULL | NULL = chưa phân |
| device | TEXT | NOT NULL | VD "iPhone 13 Pro 128GB" |
| device_type | TEXT | | phone / laptop / mac / other |
| imei | TEXT | | |
| color | TEXT | | Đặc điểm nhận dạng |
| issue | TEXT | NOT NULL | Mô tả lỗi |
| accessories | TEXT | | JSON array — sạc/cáp/ốp/khay SIM... |
| quote | INTEGER | NOT NULL DEFAULT 0 | Báo giá (VND) |
| status | TEXT | NOT NULL DEFAULT 'waiting', CHECK IN (waiting/in-progress/testing/done/delivered/cancelled) | |
| urgent | INTEGER | NOT NULL DEFAULT 0 | 1=Gấp |
| priority | TEXT | DEFAULT 'normal', CHECK IN (normal/urgent/vip) | |
| source | TEXT | NOT NULL DEFAULT 'walkin', CHECK IN (walkin/online/phone) | |
| internal_note | TEXT | | Ghi chú nội bộ |
| due_date | DATE | | Ngày dự kiến trả |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | |
| updated_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | |
| last_status_at | DATETIME | | Thời điểm đổi status gần nhất |

**Indexes:** `code`, `customer_id`, `technician_id`, `status`, `created_at DESC`

**Status flow:**
```
waiting → in-progress → testing → done → delivered
                                      └→ cancelled (bất cứ lúc nào)
```

---

## 5. `ticket_status_history` — Log timeline

| Column | Type | Constraints | Mô tả |
|---|---|---|---|
| id | INTEGER | PK AUTOINC | |
| ticket_id | INTEGER | NOT NULL, FK→tickets(id) ON DELETE CASCADE | |
| from_status | TEXT | | NULL nếu là entry đầu |
| to_status | TEXT | NOT NULL | |
| changed_by | INTEGER | FK→users(id) ON DELETE SET NULL | |
| note | TEXT | | |
| changed_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | |

**Indexes:** `(ticket_id, changed_at DESC)`

---

## 6. `bookings` — Đặt lịch online

| Column | Type | Constraints | Mô tả |
|---|---|---|---|
| id | INTEGER | PK AUTOINC | |
| code | TEXT | NOT NULL UNIQUE | VD "FFC-ONL-001" |
| customer_name | TEXT | NOT NULL | |
| customer_phone | TEXT | NOT NULL | |
| customer_email | TEXT | | |
| service_type | TEXT | | phone/laptop/mac/clean/data/... |
| device | TEXT | NOT NULL | |
| issue | TEXT | NOT NULL | |
| method | TEXT | NOT NULL, CHECK IN (store/ship/onsite) | Hình thức tiếp nhận |
| address | TEXT | | Bắt buộc nếu method = ship/onsite |
| appointment_date | DATE | | |
| time_slot | TEXT | | "9-11" / "14-16" / "16-18" / "anytime" |
| note | TEXT | | |
| status | TEXT | NOT NULL DEFAULT 'pending', CHECK IN (pending/confirmed/rejected/converted) | |
| ticket_id | INTEGER | FK→tickets(id) ON DELETE SET NULL | Liên kết nếu đã convert |
| rejected_reason | TEXT | | |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | |

**Indexes:** `status`, `customer_phone`

---

## 7. `chats` — Thread hỗ trợ

| Column | Type | Constraints | Mô tả |
|---|---|---|---|
| id | INTEGER | PK AUTOINC | |
| customer_phone | TEXT | NOT NULL UNIQUE | 1 thread / 1 SĐT |
| customer_name | TEXT | NOT NULL | |
| customer_unread | INTEGER | NOT NULL DEFAULT 0 | Số tin chưa đọc cho khách |
| admin_unread | INTEGER | NOT NULL DEFAULT 0 | Số tin chưa đọc cho admin |
| last_message_at | DATETIME | | |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | |

**Indexes:** `customer_phone`, `last_message_at DESC`

---

## 8. `messages` — Tin nhắn

| Column | Type | Constraints | Mô tả |
|---|---|---|---|
| id | INTEGER | PK AUTOINC | |
| chat_id | INTEGER | NOT NULL, FK→chats(id) ON DELETE CASCADE | |
| sender | TEXT | NOT NULL, CHECK IN (customer/admin/system) | |
| text | TEXT | NOT NULL | |
| sent_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | |

**Indexes:** `(chat_id, sent_at)`

`sender = 'system'` được sinh tự động khi:
- Ticket đổi trạng thái → "Phiếu FFC-XXXX đã chuyển sang [Đang sửa]"
- Booking online tạo → "Khách XYZ đã đặt lịch online..."
- Thanh toán xong → "Phiếu FFC-XXXX đã thanh toán xong (...). Mã HĐ..."

---

## 9. `payments` — Thanh toán & Hoá đơn

| Column | Type | Constraints | Mô tả |
|---|---|---|---|
| id | INTEGER | PK AUTOINC | |
| invoice_no | TEXT | NOT NULL UNIQUE | VD "INV-2026-0142" |
| ticket_id | INTEGER | NOT NULL, FK→tickets(id) ON DELETE RESTRICT | |
| customer_id | INTEGER | NOT NULL, FK→customers(id) ON DELETE RESTRICT | |
| amount | INTEGER | NOT NULL | Tạm tính (= ticket.quote) |
| discount_pct | REAL | NOT NULL DEFAULT 0 | 0-100 |
| discount_amount | INTEGER | NOT NULL DEFAULT 0 | amount × pct |
| final_amount | INTEGER | NOT NULL | amount - discount_amount |
| method | TEXT | NOT NULL, CHECK IN (cash/bank/card/pickup) | |
| received | INTEGER | | Khách đưa (chỉ method=cash) |
| change_back | INTEGER | | Tiền thối |
| note | TEXT | | |
| cashier_id | INTEGER | FK→users(id) ON DELETE SET NULL | |
| paid_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | |

**Indexes:** `ticket_id`, `paid_at DESC`

---

## 10. `parts` — Linh kiện kho

| Column | Type | Constraints | Mô tả |
|---|---|---|---|
| id | INTEGER | PK AUTOINC | |
| sku | TEXT | NOT NULL UNIQUE | Mã linh kiện VD "BAT-IP14" |
| name | TEXT | NOT NULL | |
| category | TEXT | NOT NULL | Pin / Màn hình / Storage / RAM / Sạc... |
| unit_cost | INTEGER | NOT NULL DEFAULT 0 | Giá nhập |
| unit_price | INTEGER | NOT NULL DEFAULT 0 | Giá bán |
| stock | INTEGER | NOT NULL DEFAULT 0 | Tồn hiện tại |
| min_stock | INTEGER | NOT NULL DEFAULT 5 | Ngưỡng cảnh báo |
| unit | TEXT | NOT NULL DEFAULT 'cái' | |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | |

**Indexes:** `sku`, `category`

---

## 11. `part_transactions` — Nhập/xuất kho

| Column | Type | Constraints | Mô tả |
|---|---|---|---|
| id | INTEGER | PK AUTOINC | |
| part_id | INTEGER | NOT NULL, FK→parts(id) ON DELETE RESTRICT | |
| type | TEXT | NOT NULL, CHECK IN (in/out/adjust) | |
| quantity | INTEGER | NOT NULL | Số lượng (luôn dương) |
| ticket_id | INTEGER | FK→tickets(id) ON DELETE SET NULL | Nếu xuất gắn vào phiếu |
| note | TEXT | | |
| created_by | INTEGER | FK→users(id) ON DELETE SET NULL | |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | |

**Indexes:** `(part_id, created_at DESC)`

---

## 12. `audit_log` — Kiểm toán

| Column | Type | Constraints | Mô tả |
|---|---|---|---|
| id | INTEGER | PK AUTOINC | |
| user_id | INTEGER | FK→users(id) ON DELETE SET NULL | |
| action | TEXT | NOT NULL | VD "ticket.status_change", "user.login" |
| entity | TEXT | NOT NULL | VD "ticket", "payment", "customer" |
| entity_id | TEXT | | ID/code của entity |
| details | TEXT | | JSON metadata |
| ip | TEXT | | IP request |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | |

**Indexes:** `(user_id, created_at DESC)`, `(entity, entity_id)`

---

## Quan hệ chính (ERD summary)

```
customers (1) ─────< (∞) tickets >───── (∞) technicians
                          │
                          ├──< (∞) ticket_status_history
                          │
                          └──< (1) payments
                                       │
                                       └─── cashier (users)

customers (1) ─────< (1) chats >───── (∞) messages

bookings (∞) ─────> (1) tickets [via ticket_id, after confirm]

parts (1) ─────< (∞) part_transactions
                         │
                         └─── ticket_id (if outbound to ticket)

users (1) ─────< (∞) audit_log
```

---

## Quy ước counter denormalized

Để tránh aggregate query mỗi lần render dashboard, các counter sau được cập nhật trong route logic:

| Table.Column | Trigger update |
|---|---|
| `customers.total_spent` | Khi thanh toán xong (`POST /api/payments`) |
| `customers.last_visit` | Khi thanh toán xong |
| `technicians.active_tickets` | Khi tạo/đổi status/đổi KTV (in/out trong active states) |
| `technicians.completed_total` | Khi status chuyển sang `delivered` |

Có thể chạy job định kỳ (cron) recompute để đảm bảo consistency:
```sql
UPDATE technicians SET active_tickets = (
  SELECT COUNT(*) FROM tickets
  WHERE technician_id = technicians.id AND status IN ('waiting','in-progress','testing')
);
```
