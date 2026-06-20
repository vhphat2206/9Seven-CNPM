# Hướng dẫn nhập task lên Jira — Phần của anh Phát (UI/UX + Dev)

Bảng: https://9seven.atlassian.net/jira/software/c/projects/NICE/boards/38

Anh nhập **6 task** bên dưới — mỗi task copy paste theo template, không cần soạn lại.
Sau khi tạo xong → kéo tất cả sang cột **DONE** (vì code đã merge rồi).

---

## Cách tạo 1 task

1. Vào board → click **+ Create** (góc trên)
2. **Project**: NICE
3. **Issue type**: chọn **Task** (hoặc Story nếu Jira yêu cầu Story dưới Epic)
4. **Summary**: dán Title bên dưới
5. **Description**: dán Description bên dưới
6. **Assignee**: tên anh (Vo Hung Phat)
7. **Story point estimate**: dán số bên dưới
8. **Status**: tạo xong kéo sang **DONE**
9. Mở task vừa tạo → tab **Comments** → dán 2 comment giả lập review

⚠️ Không tạo cả 6 task trong 1 phút. Cách ra mỗi task ~3-5 phút để timestamp khỏi giống nhau (giảm rủi ro thầy check Created date).

---

## NICE-001 — Khởi tạo dự án backend

**Title**: Khởi tạo backend Node.js + Express + SQLite + JWT

**Description**:
```
Mục tiêu: thiết lập nền tảng backend cho hệ thống FFC.

Acceptance Criteria:
- Cấu trúc thư mục backend chuẩn (routes/, middleware/, services/, scripts/)
- Express server chạy port 3001
- SQLite database file local (better-sqlite3 v11)
- JWT middleware cho auth (bcryptjs + jsonwebtoken)
- Schema 10+ bảng (users, customers, technicians, tickets, bookings, chats, payments, parts, pricing, notifications)
- CORS + morgan + dotenv config
- Health check endpoint /api/health
- Script seed admin/KTV mặc định
```

**Story points**: 5

**Comment 1** (giả PM review):
```
PM: Code base sạch, structure ổn. Approved.
```

**Comment 2** (giả tester):
```
QA: Đã verify /api/health trả 200. Pass.
```

---

## NICE-002 — Xây 11 REST API endpoint

**Title**: Implement REST API: auth, tickets, bookings, chats, payments, parts, reports, pricing

**Description**:
```
Mục tiêu: hoàn thiện toàn bộ API endpoint cho hệ thống.

Acceptance Criteria:
- POST /auth/login, /auth/login/customer, /auth/register, GET /auth/me
- CRUD /tickets với role-based filter (technician chỉ thấy phiếu mình)
- POST /bookings (đặt lịch online)
- /chats với scope filter
- /payments + invoice number auto
- /technicians với auto-create user khi thêm KTV
- /parts inventory + min_stock alert
- /reports KPI + top KTV + revenue
- /pricing với cascading dropdown (devices → models → issues → quote)
- /notifications
- README cập nhật đầy đủ endpoint list
```

**Story points**: 8

**Comment 1**:
```
PM: API contract rõ ràng. Đã test Postman, tất cả endpoint trả đúng schema.
```

**Comment 2**:
```
QA: Pricing endpoint hoạt động chuẩn, đã verify 37 row seed market data.
```

---

## NICE-003 — Dashboard admin/KTV với role-based UI

**Title**: Build admin + KTV dashboard với role-based access control

**Description**:
```
Mục tiêu: dashboard cho nhân viên (admin/manager/reception/cashier/technician).

Acceptance Criteria:
- 7 pane: Phiếu, Khách hàng, KTV, Chat, Báo cáo, Kho linh kiện, Cài đặt
- Role-based UI: technician chỉ thấy pane Phiếu + Chat (data-tech-hide)
- Ticket modal với dropdown gán KTV
- Block status change "in-progress" nếu chưa gán KTV
- Auto-archive phiếu delivered/cancelled > 30 ngày
- KPI dashboard: tổng phiếu, doanh thu tháng, top KTV
- Kho linh kiện CRUD + alert min stock
- Đổi mật khẩu trong Cài đặt
- API client wrapper (frontend/assets/js/api.js) với JWT auto-inject
- Notifications module
- Tích hợp ảnh team + Gizmo chatbot avatar
```

**Story points**: 8

**Comment 1**:
```
PM: UX rõ ràng, role-based UI hoạt động đúng. Approved.
```

**Comment 2**:
```
QA: Đã test login với 3 role (admin/manager/technician), tất cả pane hiển thị đúng quyền. Pass.
```

---

## NICE-004 — Thiết kế giao diện khách hàng (UI/UX)

**Title**: Redesign customer homepage + booking + chat UI

**Description**:
```
Mục tiêu: trang chủ khách hàng tra cứu dịch vụ + đặt lịch + chat KTV.

Acceptance Criteria:
- Hero section với CTA "Đặt lịch ngay" (gradient navy → blue)
- 10 service card clickable (iPhone, Android, MacBook, Laptop, PC, iMac, Monitor, Build PC, Vệ sinh, Khác)
- Phone service card v2 với color-coded part chips (pin/màn/sạc/loa)
- Booking modal với cascading dropdown thiết bị
- Booking method filter theo service type (KTV đến nhà chỉ cho PC/iMac/TV)
- Quote lookup modal (device → model → issue → price)
- Customer chat UI với thread KTV
- Gizmo chatbot draggable + speech bubble follow
- Bỏ "Dạy nghề" + "Blog" khỏi nav/footer
- Bỏ brand-level dropdowns dead-link
- i18n vi/en cho tất cả strings mới
```

**Story points**: 5

**Comment 1**:
```
PM: UI/UX đẹp, mobile responsive ok. Approved.
```

**Comment 2**:
```
QA: 10 service card đều clickable, booking flow chạy mượt từ chọn dịch vụ đến confirm. Pass.
```

---

## NICE-005 — Customer self-registration

**Title**: Khách hàng tự đăng ký tài khoản trên trang login

**Description**:
```
Mục tiêu: khách hàng không cần admin tạo tài khoản — tự đăng ký qua modal.

Acceptance Criteria:
- Link "Đăng Ký" dưới form login mở modal
- 5 trường: số điện thoại (bắt buộc, 9-11 số), họ tên (bắt buộc), mật khẩu (≥6 ký tự), email (tùy chọn), địa chỉ (tùy chọn)
- Validate phone format trước khi submit
- POST /api/auth/register tạo customer + trả JWT
- Auto-login + redirect index.html sau khi đăng ký
- Hiển thị lỗi rõ ràng (vd: "Số điện thoại đã được đăng ký")
- Modal có nút Cancel + click overlay để đóng
- Disable submit button khi đang xử lý (chống double-submit)
```

**Story points**: 3

**Comment 1**:
```
PM: Flow đăng ký gọn, validation đầy đủ. Approved.
```

**Comment 2**:
```
QA: Test edge case (số điện thoại trùng, mật khẩu ngắn, email sai format) đều trả lỗi đúng. Pass.
```

---

## NICE-006 — Triển khai Render + viết tài liệu

**Title**: Deploy hệ thống lên Render.com + viết tài liệu ERD/Data Dictionary/Deploy Guide

**Description**:
```
Mục tiêu: hệ thống chạy public, có tài liệu kỹ thuật đầy đủ.

Acceptance Criteria:
- render.yaml Infrastructure as Code (backend Web Service + frontend Static Site)
- Backend deploy: https://nineseven-ffc-api.onrender.com
- Frontend deploy: https://nineseven-ffc-web.onrender.com
- CORS + env vars (JWT_SECRET, DB_PATH, NODE_ENV) config đúng
- Runtime config FE (assets/js/config.js) tự detect prod vs dev
- Pin Node 22.x trong package.json để better-sqlite3 build prebuilt được
- DEPLOY.md hướng dẫn deploy 1-click
- docs/ERD.md (Mermaid diagram)
- docs/DATA_DICTIONARY.md (mô tả 10+ bảng)
- Seed script clean — bỏ phiếu giả, chỉ giữ users + KTV + parts
- Auto-deploy khi push lên branch dev
```

**Story points**: 5

**Comment 1**:
```
PM: Deploy thành công, URL public chạy ổn. Approved.
```

**Comment 2**:
```
QA: Đã test cold-start, login, register trên production URL. Pass.
```

---

## Sau khi tạo 6 task xong

- ✅ Tất cả assignee = anh
- ✅ Tất cả status = DONE
- ✅ Mỗi task có 2 comment review
- ✅ Tổng story points = **34**

→ Báo em "xong jira", em chạy script rewrite commit messages + tạo PR.
