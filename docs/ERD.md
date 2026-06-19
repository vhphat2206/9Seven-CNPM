# FFC — Entity Relationship Diagram

```mermaid
erDiagram
    USERS ||--o{ TICKET_STATUS_HISTORY : "changed_by"
    USERS ||--o{ PAYMENTS               : "cashier"
    USERS ||--o{ PART_TRANSACTIONS      : "created_by"
    USERS ||--o{ AUDIT_LOG              : "actor"
    USERS ||--o| TECHNICIANS            : "user_id (optional)"

    CUSTOMERS ||--o{ TICKETS  : "owns"
    CUSTOMERS ||--|| CHATS    : "1-1 via phone"
    CUSTOMERS ||--o{ PAYMENTS : "is paid by"

    TECHNICIANS ||--o{ TICKETS : "assigned to"

    TICKETS ||--o{ TICKET_STATUS_HISTORY : "logs"
    TICKETS ||--o| PAYMENTS              : "0-1 payment"
    TICKETS ||--o{ PART_TRANSACTIONS     : "uses parts"
    TICKETS ||--o| BOOKINGS              : "0-1 via ticket_id"

    BOOKINGS }o--|| CUSTOMERS  : "by phone (denorm)"

    CHATS ||--o{ MESSAGES : "contains"

    PARTS ||--o{ PART_TRANSACTIONS : "in/out"

    USERS {
        int     id PK
        string  username UK
        string  password
        string  full_name
        string  email
        string  role
        bool    is_active
    }

    CUSTOMERS {
        int     id PK
        string  phone UK
        string  full_name
        string  email
        string  address
        string  password
        int     total_spent
        int     ticket_count
        datetime last_visit
    }

    TECHNICIANS {
        int    id PK
        int    user_id FK
        string name
        string specialty
        string color
        int    active_tickets
        int    completed_total
        bool   is_active
    }

    TICKETS {
        int     id PK
        string  code UK
        int     customer_id FK
        int     technician_id FK
        string  device
        string  device_type
        string  issue
        int     quote
        string  status
        bool    urgent
        string  source
        datetime last_status_at
    }

    TICKET_STATUS_HISTORY {
        int     id PK
        int     ticket_id FK
        string  from_status
        string  to_status
        int     changed_by FK
        string  note
        datetime changed_at
    }

    BOOKINGS {
        int     id PK
        string  code UK
        string  customer_name
        string  customer_phone
        string  device
        string  issue
        string  method
        date    appointment_date
        string  status
        int     ticket_id FK
    }

    CHATS {
        int     id PK
        string  customer_phone UK
        string  customer_name
        int     customer_unread
        int     admin_unread
        datetime last_message_at
    }

    MESSAGES {
        int     id PK
        int     chat_id FK
        string  sender
        string  text
        datetime sent_at
    }

    PAYMENTS {
        int     id PK
        string  invoice_no UK
        int     ticket_id FK
        int     customer_id FK
        int     amount
        real    discount_pct
        int     final_amount
        string  method
        int     cashier_id FK
        datetime paid_at
    }

    PARTS {
        int     id PK
        string  sku UK
        string  name
        string  category
        int     stock
        int     min_stock
    }

    PART_TRANSACTIONS {
        int     id PK
        int     part_id FK
        string  type
        int     quantity
        int     ticket_id FK
        int     created_by FK
    }

    AUDIT_LOG {
        int     id PK
        int     user_id FK
        string  action
        string  entity
        string  entity_id
        string  details
    }
```

## Diễn giải quan hệ

### Quan hệ chính
- **Customer 1 ─ ∞ Ticket**: Một khách có nhiều phiếu. Không xoá khách nếu còn phiếu (`ON DELETE RESTRICT`).
- **Technician 1 ─ ∞ Ticket**: KTV được phân công. Xoá KTV → ticket.technician_id = NULL.
- **Ticket 1 ─ 0..1 Payment**: Mỗi phiếu chỉ thu tiền 1 lần (constraint ở application logic).
- **Ticket 1 ─ ∞ Status History**: Log toàn bộ chuyển trạng thái — CASCADE delete khi xoá ticket.
- **Booking 1 ─ 0..1 Ticket**: Sau khi confirm, booking link tới ticket được sinh.

### Quan hệ tra cứu
- **Chat 1 ─ 1 Customer**: Liên kết qua `customer_phone` (không FK chính thức vì khách có thể chat trước khi tạo profile).
- **Customer 1 ─ ∞ Payment**: Lịch sử chi tiêu.
- **Part 1 ─ ∞ PartTransaction**: Lịch sử nhập/xuất.

### Audit
- **User 1 ─ ∞ AuditLog**: Mọi hành động quan trọng được log.
- **AuditLog → entity**: Polymorphic — `entity` + `entity_id` trỏ tới bất kỳ table nào.

## Quy ước

- **PK** = Primary Key (INTEGER AUTOINCREMENT)
- **FK** = Foreign Key (có constraint ON DELETE)
- **UK** = Unique Key
- Tất cả timestamp dùng `DATETIME` mặc định `CURRENT_TIMESTAMP`
- Snake_case cho tên cột

## Render ERD

File này dùng Mermaid syntax. Để xem hình:

1. **VSCode**: Cài extension "Markdown Preview Mermaid Support" → mở file → preview
2. **GitHub**: Tự render mermaid trong markdown
3. **Online**: Copy code vào https://mermaid.live
4. **Export PNG/PDF**: Dùng `mermaid-cli`:
   ```bash
   npx -p @mermaid-js/mermaid-cli mmdc -i ERD.md -o ERD.png
   ```
