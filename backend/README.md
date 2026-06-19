# FFC Backend — REST API

Backend cho hệ thống quản lý cửa hàng sửa chữa **FFC (Fix Fast Center)**.

**Tech stack:** Node.js (≥18) · Express 4 · SQLite (better-sqlite3) · JWT · bcryptjs

---

## 🚀 Khởi động nhanh

```bash
cd backend
npm install                  # cài dependencies
cp .env.example .env         # (optional) chỉnh PORT/JWT_SECRET
npm run seed                 # khởi tạo DB + demo data
npm start                    # chạy server ở http://localhost:3001
```

Verify:
```bash
curl http://localhost:3001/api/health
```

---

## 📋 Tài khoản demo

| Role | Username | Password |
|---|---|---|
| Admin    | `admin`     | `admin`     |
| Manager  | `manager`   | `manager`   |
| Lễ tân   | `reception` | `reception` |
| Thu ngân | `cashier`   | `cashier`   |
| Khách    | `0900000001` (phone) | `khach` |

---

## 📚 Cấu trúc thư mục

```
backend/
├── server.js              # Express entry point
├── db.js                  # SQLite connection + auto-init schema
├── schema.sql             # 12 table definitions (DDL)
├── package.json
├── .env.example
├── middleware/
│   └── auth.js            # JWT verify + role guard
├── routes/
│   ├── auth.js            # /api/auth
│   ├── tickets.js         # /api/tickets
│   ├── bookings.js        # /api/bookings
│   ├── customers.js       # /api/customers
│   ├── chats.js           # /api/chats
│   ├── payments.js        # /api/payments
│   ├── technicians.js     # /api/technicians
│   ├── parts.js           # /api/parts
│   └── reports.js         # /api/reports
├── scripts/
│   └── seed.js            # demo data seeder
└── data/
    └── ffc.db             # SQLite database file (auto-generated)
```

---

## 🔌 API Endpoints

### Auth
| Method | Endpoint | Auth | Mô tả |
|---|---|---|---|
| POST | `/api/auth/login` | — | Login admin/staff bằng username + password |
| POST | `/api/auth/login/customer` | — | Login khách bằng SĐT + password |
| POST | `/api/auth/register` | — | Khách tự đăng ký |
| GET  | `/api/auth/me` | ✓ | Thông tin tài khoản hiện tại |
| PUT  | `/api/auth/me` | ✓ | Cập nhật profile + đổi mật khẩu |

### Tickets (Phiếu sửa)
| Method | Endpoint | Auth | Mô tả |
|---|---|---|---|
| GET    | `/api/tickets?status=&technician_id=&search=&page=&limit=` | ✓ | List phiếu (admin xem all, customer chỉ phiếu mình) |
| GET    | `/api/tickets/me` | customer | Phiếu của khách đang login |
| GET    | `/api/tickets/:code` | ✓ | Chi tiết phiếu + lịch sử trạng thái |
| POST   | `/api/tickets` | staff | Tạo phiếu mới |
| PATCH  | `/api/tickets/:code` | staff | Sửa info, phân công KTV, đổi báo giá |
| PATCH  | `/api/tickets/:code/status` | staff | Chuyển trạng thái + push system msg chat |
| DELETE | `/api/tickets/:code` | admin | Huỷ phiếu |

### Bookings (Đặt lịch online)
| Method | Endpoint | Auth | Mô tả |
|---|---|---|---|
| POST | `/api/bookings` | — | Khách gửi yêu cầu đặt lịch (public) |
| GET  | `/api/bookings?status=&phone=` | staff | List bookings |
| GET  | `/api/bookings/:id` | staff | Chi tiết |
| POST | `/api/bookings/:id/confirm` | staff | Xác nhận → tạo ticket |
| POST | `/api/bookings/:id/reject` | staff | Từ chối + lý do |

### Customers
| Method | Endpoint | Auth | Mô tả |
|---|---|---|---|
| GET | `/api/customers?search=` | staff | List khách hàng |
| GET | `/api/customers/:phone` | staff | Chi tiết + lịch sử phiếu + tổng chi |
| POST | `/api/customers` | staff | Tạo mới |
| PUT | `/api/customers/:phone` | staff | Cập nhật |

### Chats
| Method | Endpoint | Auth | Mô tả |
|---|---|---|---|
| GET   | `/api/chats?filter=unread` | staff | List threads |
| GET   | `/api/chats/:phone` | ✓ | Tin nhắn của 1 thread |
| POST  | `/api/chats/:phone/messages` | ✓ | Gửi tin (customer hoặc admin) |
| PATCH | `/api/chats/:phone/read` | ✓ | Mark đã đọc |

### Payments
| Method | Endpoint | Auth | Mô tả |
|---|---|---|---|
| POST | `/api/payments` | cashier | Thu tiền + auto chuyển ticket sang "delivered" |
| GET  | `/api/payments?from=&to=&method=` | cashier | List giao dịch |
| GET  | `/api/payments/:invoice_no` | cashier | Chi tiết hoá đơn |
| GET  | `/api/payments/stats/today` | cashier | Stats hôm nay (pending vs collected) |

### Technicians
| Method | Endpoint | Auth | Mô tả |
|---|---|---|---|
| GET | `/api/technicians` | ✓ | List KTV + current workload |
| GET | `/api/technicians/:id` | admin | Chi tiết + 20 phiếu gần nhất + doanh thu tháng |
| POST | `/api/technicians` | admin | Thêm KTV |
| PUT | `/api/technicians/:id` | admin | Cập nhật |
| GET | `/api/technicians/:id/workload` | admin | Breakdown active tickets theo status |

### Parts (Kho linh kiện)
| Method | Endpoint | Auth | Mô tả |
|---|---|---|---|
| GET | `/api/parts?category=&low_stock=1&search=` | staff | List |
| POST | `/api/parts` | admin | Thêm mới |
| PUT | `/api/parts/:id` | admin | Cập nhật info |
| POST | `/api/parts/:id/in` | staff | Nhập kho |
| POST | `/api/parts/:id/out` | staff | Xuất kho (gắn ticket) |
| GET | `/api/parts/:id/history` | admin | Lịch sử nhập/xuất |

### Reports
| Method | Endpoint | Auth | Mô tả |
|---|---|---|---|
| GET | `/api/reports/overview` | admin | KPIs hôm nay (tickets, revenue, completed, pending payments) |
| GET | `/api/reports/revenue?from=&to=` | admin | Doanh thu theo ngày |
| GET | `/api/reports/tickets-by-status` | admin | Đếm phiếu theo status |
| GET | `/api/reports/top-technicians?limit=10` | admin | Ranking KTV (doanh thu + số phiếu) |
| GET | `/api/reports/top-devices?limit=10` | admin | Top loại thiết bị sửa nhiều |

### Misc
| Method | Endpoint | Mô tả |
|---|---|---|
| GET | `/api/health` | Liveness probe |
| GET | `/` | API info + endpoint list |

---

## 🔐 Authentication

Mọi endpoint cần auth (đánh ✓) yêu cầu header:
```
Authorization: Bearer <token>
```

Token JWT lấy từ `/api/auth/login` hoặc `/api/auth/login/customer`. Token mặc định hết hạn sau **7 ngày** (chỉnh ở `.env` qua `JWT_EXPIRES_IN`).

**Roles:** `admin`, `manager`, `cashier`, `reception`, `customer`. Mỗi endpoint chỉ định role cụ thể được phép gọi.

---

## 🧪 Test API nhanh (curl)

```bash
# 1. Login admin → lấy token
TOKEN=$(curl -s -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin"}' | jq -r .token)

# 2. List tickets
curl http://localhost:3001/api/tickets -H "Authorization: Bearer $TOKEN"

# 3. Tạo booking online (không cần auth)
curl -X POST http://localhost:3001/api/bookings \
  -H "Content-Type: application/json" \
  -d '{
    "customer_name":"Nguyễn Văn Test",
    "customer_phone":"0901111111",
    "device":"iPhone 14",
    "issue":"Vỡ màn",
    "method":"store",
    "appointment_date":"2026-05-25",
    "time_slot":"14-16"
  }'

# 4. Login khách bằng SĐT
curl -X POST http://localhost:3001/api/auth/login/customer \
  -H "Content-Type: application/json" \
  -d '{"phone":"0900000001","password":"khach"}'
```

---

## 📊 Database Schema

12 tables — xem chi tiết `schema.sql`:

| Table | Mô tả |
|---|---|
| `users` | Admin/manager/cashier/reception |
| `customers` | Khách hàng (định danh = `phone`) |
| `technicians` | KTV + chuyên môn + workload counter |
| `tickets` | Phiếu sửa chữa |
| `ticket_status_history` | Log timeline mỗi lần đổi status |
| `bookings` | Đặt lịch online (chưa xác nhận → ticket) |
| `chats` | Thread hỗ trợ |
| `messages` | Tin nhắn (customer / admin / system) |
| `payments` | Thanh toán + hoá đơn |
| `parts` | Linh kiện trong kho |
| `part_transactions` | Lịch sử nhập / xuất kho |
| `audit_log` | Audit hành động (cho security) |

ERD chi tiết: xem `../docs/ERD.md` (sẽ build sau).

---

## 🛠️ Development

```bash
npm run dev      # auto-reload khi sửa file (Node --watch)
npm run seed -- --reset   # wipe DB + re-seed
```

Reset database:
```bash
rm -rf data/
npm run seed
```

---

## 🚢 Deployment

### Railway / Render (free tier)
1. Push code lên GitHub
2. Railway → New Project → Deploy from GitHub → chọn repo
3. Root directory: `backend`
4. Build: `npm install`
5. Start: `npm start && npm run seed`
6. Env vars: `JWT_SECRET`, `CORS_ORIGIN=https://your-frontend.com`

### VPS (Ubuntu)
```bash
# Install Node 18+
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Clone + setup
git clone <repo>
cd ffc/backend && npm install && npm run seed

# PM2 process manager
sudo npm install -g pm2
pm2 start server.js --name ffc-backend
pm2 startup && pm2 save
```

Nginx reverse proxy:
```nginx
location /api/ {
  proxy_pass http://localhost:3001;
  proxy_set_header Host $host;
}
```

---

## 📝 Tích hợp với frontend

Frontend (`../frontend/`) hiện đang dùng **localStorage**. Để chuyển sang gọi API:

1. Tạo file `frontend/assets/js/api.js`:
   ```js
   const API_BASE = 'http://localhost:3001/api';
   const token = () => sessionStorage.getItem('ffc_token');
   async function api(path, opts = {}) {
     const res = await fetch(API_BASE + path, {
       ...opts,
       headers: {
         'Content-Type': 'application/json',
         ...(token() && { Authorization: `Bearer ${token()}` }),
         ...opts.headers,
       },
       body: opts.body ? JSON.stringify(opts.body) : undefined,
     });
     if (!res.ok) throw new Error((await res.json()).error || res.statusText);
     return res.json();
   }
   ```

2. Refactor login (`admin.html`):
   ```js
   const { token, user } = await api('/auth/login', {
     method: 'POST', body: { username, password }
   });
   sessionStorage.setItem('ffc_token', token);
   ```

3. Refactor TICKETS / chats / payments — thay `localStorage.getItem(...)` → `await api('/tickets')`.

---

## 🐛 Troubleshooting

**Port 3001 đã dùng?** → đổi `PORT` trong `.env`.

**CORS error?** → frontend không cùng origin. Set `CORS_ORIGIN=http://localhost:8000` trong `.env`.

**better-sqlite3 build fail (M1/M2 Mac)?** → cài Xcode CLT: `xcode-select --install`.

**Quên password admin?** → `rm -rf data/ && npm run seed`.
