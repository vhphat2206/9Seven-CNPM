# Deploy FFCenter lên Render.com — Hướng dẫn nhanh

## 1. Chuẩn bị

- Repo đã có file `render.yaml` ở root (đã tạo sẵn)
- Đã push code lên GitHub (branch `dev` hoặc `master`)
- Có tài khoản Render free: https://dashboard.render.com (đăng ký bằng GitHub)

## 2. Deploy qua Blueprint (1 click)

1. Vào https://dashboard.render.com
2. Click **New +** (góc trên phải) → **Blueprint**
3. Connect GitHub → chọn repo `takidang/9Seven-CNPM`
4. Branch: chọn **dev**
5. Render đọc `render.yaml`, hiện preview 2 service:
   - `nineseven-ffc-api` (Web Service Node)
   - `nineseven-ffc-web` (Static Site)
6. Click **Apply** → Render build + deploy tự động (~5-7 phút)

## 3. URL sau khi deploy

- **Frontend** (cho tụi nhóm xem): https://nineseven-ffc-web.onrender.com
- **Backend API**: https://nineseven-ffc-api.onrender.com/api/health
- **Trang đăng nhập admin**: https://nineseven-ffc-web.onrender.com/admin.html
- **Trang dashboard**: https://nineseven-ffc-web.onrender.com/dashboard.html

## 4. Tài khoản demo

Sau khi deploy, seed script tự tạo:

| Vai trò | Username | Password |
|---|---|---|
| Admin | `admin` | `admin123` |
| Manager | `manager` | `manager123` |
| Lễ tân | `reception` | `reception123` |
| Thu ngân | `cashier` | `cashier123` |
| KTV Minh Triết | `minhtriet` | `minhtriet` |
| KTV Trúc Ly | `trucly` | `trucly` |
| KTV Tuấn Kiệt | `tuankiet` | `tuankiet` |
| KTV Thanh Mai | `thanhmai` | `thanhmai` |
| KTV Hoài Nam | `hoainam` | `hoainam` |
| Khách demo | `khach` | `khach` |

## 5. Lưu ý quan trọng (free tier)

### ⏰ Cold start ~30 giây
Backend ngủ sau **15 phút không có request**. Lần truy cập sau đó phải đợi
khoảng 30 giây để Render thức dậy. Đây là giới hạn của plan **free**.

**Fix**: Đăng ký uptimerobot.com (free), tạo monitor ping
`https://nineseven-ffc-api.onrender.com/api/health` mỗi 5 phút → backend không
bao giờ ngủ.

### 🔄 Database reset mỗi deploy
File SQLite `ffc.db` nằm trên disk **ephemeral** — mỗi lần Render restart
container (push code mới, scale, hoặc sau ~24h) → file bị xoá. Khi container
khởi động lại, `node scripts/seed.js` tự chạy → DB có data mẫu trở lại.

→ **Data người dùng tạo trên web (tickets, customers thật) sẽ MẤT** sau
mỗi restart. Phù hợp cho demo CNPM, không phù hợp production thật.

Muốn persist data thật → upgrade sang Render Persistent Disk ($1/GB/tháng)
hoặc migrate sang Render Postgres / Turso.

## 6. Nếu tên service đã có người dùng

Render báo lỗi `Service name already taken`:

1. Mở `render.yaml`, đổi 2 chỗ `name:`:
   - `nineseven-ffc-api` → `<tên-mới-api>`
   - `nineseven-ffc-web` → `<tên-mới-web>`
2. Đổi 2 chỗ trong `render.yaml`:
   - `CORS_ORIGIN` → `https://<tên-mới-web>.onrender.com`
3. Đổi trong [frontend/assets/js/config.js](frontend/assets/js/config.js):
   - `PROD_API` → `https://<tên-mới-api>.onrender.com/api`
4. Commit + push lại → Render redeploy

## 7. Debug khi lỗi

- **Build fail**: Vào Render dashboard → service → tab **Logs** → đọc traceback
- **API 502 / không phản hồi**: backend còn đang cold-start, đợi 30s rồi refresh
- **CORS error trên browser**: check `CORS_ORIGIN` env có khớp URL FE không
- **FE gọi `localhost:3001`**: file `config.js` chưa load — F5 hard reload (Cmd+Shift+R)
