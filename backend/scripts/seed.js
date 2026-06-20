/**
 * Seed initial demo data into SQLite.
 *
 *   node scripts/seed.js                    # idempotent — safe to re-run
 *   node scripts/seed.js --reset            # wipe and re-seed
 *
 * Creates:
 *   - 4 users (admin, manager, reception, cashier)
 *   - 1 demo customer (khach/khach) + a few walk-ins
 *   - 5 technicians (Minh Triết, Trúc Ly, Tuấn Kiệt, Thanh Mai, Hoài Nam)
 *   - 12 sample tickets (mix of statuses)
 *   - 1 paid ticket → payment record
 *   - 1 pending online booking
 *   - 8 inventory parts
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('../db');

const args = process.argv.slice(2);
const RESET = args.includes('--reset');

if (RESET) {
  console.log('⚠️  Resetting all data...');
  ['part_transactions','parts','payments','messages','chats','ticket_status_history',
   'tickets','bookings','technicians','customers','users','audit_log'
  ].forEach(t => db.prepare(`DELETE FROM ${t}`).run());
  ['users','customers','technicians','tickets','bookings','chats','messages','payments','parts','part_transactions','ticket_status_history','audit_log']
    .forEach(t => db.prepare(`DELETE FROM sqlite_sequence WHERE name = ?`).run(t));
  console.log('  ✓ Tables wiped.');
}

const hash = (pw) => bcrypt.hashSync(pw, 10);

function seedUsers() {
  const existing = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  if (existing > 0) { console.log(`  • Users already seeded (${existing} rows) — skip`); return; }
  const insert = db.prepare(`
    INSERT INTO users (username, password, full_name, email, role)
    VALUES (?, ?, ?, ?, ?)
  `);
  insert.run('admin',     hash('admin'),     'Admin FFC',      'admin@ffcenter.vn',     'admin');
  insert.run('manager',   hash('manager'),   'Quản Lý FFC',    'manager@ffcenter.vn',   'manager');
  insert.run('reception', hash('reception'), 'Lễ Tân FFC',     'reception@ffcenter.vn', 'reception');
  insert.run('cashier',   hash('cashier'),   'Thu Ngân FFC',   'cashier@ffcenter.vn',   'cashier');
  console.log('  ✓ Users: 4 (admin/admin, manager/manager, reception/reception, cashier/cashier)');
}

function seedCustomers() {
  const existing = db.prepare('SELECT COUNT(*) AS c FROM customers').get().c;
  if (existing > 0) { console.log(`  • Customers already seeded (${existing} rows) — skip`); return; }
  const insert = db.prepare(`
    INSERT INTO customers (phone, full_name, email, address, password)
    VALUES (?, ?, ?, ?, ?)
  `);
  insert.run('0900000001', 'Nguyễn Văn Khách', 'khach@example.com', '123 Lê Lợi, Q.1, TP.HCM', hash('khach'));
  console.log('  ✓ Customers: 1 (khach/khach — demo login)');
}

function seedTechnicians() {
  const existing = db.prepare('SELECT COUNT(*) AS c FROM technicians').get().c;
  if (existing > 0) { console.log(`  • Technicians already seeded (${existing} rows) — skip`); return; }
  const insert = db.prepare(`
    INSERT INTO technicians (name, specialty, color, hire_date)
    VALUES (?, ?, ?, ?)
  `);
  insert.run('Minh Triết', 'iPhone',           '#2563eb', '2024-01-15');
  insert.run('Trúc Ly',    'Thay màn hình',    '#f59e0b', '2024-03-01');
  insert.run('Tuấn Kiệt',  'Main laptop',      '#7c3aed', '2023-08-22');
  insert.run('Thanh Mai',  'Vệ sinh',          '#10b981', '2024-06-10');
  insert.run('Hoài Nam',   'Phục hồi dữ liệu', '#dc2626', '2023-11-05');
  console.log('  ✓ Technicians: 5');
}

function seedTickets() {
  const existing = db.prepare('SELECT COUNT(*) AS c FROM tickets').get().c;
  if (existing > 0) { console.log(`  • Tickets already seeded (${existing} rows) — skip`); return; }

  const cust = (phone) => db.prepare('SELECT id FROM customers WHERE phone = ?').get(phone).id;
  const tech = (name)  => db.prepare('SELECT id FROM technicians WHERE name = ?').get(name).id;
  const insert = db.prepare(`
    INSERT INTO tickets (code, customer_id, technician_id, device, device_type, issue, quote, status, urgent, source, created_at, last_status_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const tickets = [
    ['FFC-0094', '0901234567', 'Trúc Ly',     'Samsung S24',     'phone',  'Vỡ màn',           2400000, 'waiting',     1, '2026-05-08 10:24'],
    ['FFC-0093', '0908111222', 'Tuấn Kiệt',   'MacBook Pro M2',  'mac',    'Chẩn đoán main',         0, 'in-progress', 0, '2026-05-08 09:18'],
    ['FFC-0092', '0937555888', 'Minh Triết',  'iPhone 14',       'phone',  'Pin chai',          850000, 'in-progress', 0, '2026-05-08 08:55'],
    ['FFC-0091', '0987666333', 'Trúc Ly',     'iPad Air 5',      'mac',    'Không lên màn',    1800000, 'testing',     0, '2026-05-08 08:30'],
    ['FFC-0090', '0945777999', 'Thanh Mai',   'Asus ROG G15',    'laptop', 'Vệ sinh + keo',     350000, 'in-progress', 0, '2026-05-08 08:12'],
    ['FFC-0089', '0902333444', 'Minh Triết',  'iPhone 13',       'phone',  'Thay pin',          720000, 'done',        0, '2026-05-07 17:22'],
    ['FFC-0088', '0976234567', 'Trúc Ly',     'Oppo Reno 8',     'phone',  'Loa rè',            480000, 'in-progress', 0, '2026-05-07 16:48'],
    ['FFC-0087', '0918555222', 'Hoài Nam',    'MacBook Air M1',  'mac',    'Phục hồi dữ liệu', 1200000, 'waiting',     1, '2026-05-07 14:15'],
    ['FFC-0086', '0901999888', 'Trúc Ly',     'Xiaomi 13T',      'phone',  'Vỡ kính sau',       580000, 'testing',     0, '2026-05-07 11:40'],
    ['FFC-0085', '0936124657', 'Tuấn Kiệt',   'Dell XPS 13',     'laptop', 'Nâng cấp SSD 1TB', 1250000, 'delivered',   0, '2026-05-07 10:22'],
    ['FFC-0084', '0918333111', 'Minh Triết',  'iPhone 12 Pro',   'phone',  'Không sạc được',    380000, 'in-progress', 0, '2026-05-07 09:55'],
    ['FFC-0083', '0902777666', 'Tuấn Kiệt',   'Lenovo ThinkPad', 'laptop', 'Bàn phím lỗi',           0, 'waiting',     1, '2026-05-07 08:30'],
  ];

  tickets.forEach(([code, phone, techName, device, type, issue, quote, status, urgent, createdAt]) => {
    insert.run(code, cust(phone), tech(techName), device, type, issue, quote, status, urgent, 'walkin', createdAt, createdAt);
    const t = db.prepare('SELECT id FROM tickets WHERE code = ?').get(code);
    db.prepare(`
      INSERT INTO ticket_status_history (ticket_id, from_status, to_status, changed_by, note)
      VALUES (?, NULL, 'waiting', 1, 'Tiếp nhận phiếu')
    `).run(t.id);
    if (status !== 'waiting') {
      const flow = ['waiting','in-progress','testing','done','delivered'];
      const target = flow.indexOf(status);
      for (let i = 1; i <= target; i++) {
        db.prepare(`
          INSERT INTO ticket_status_history (ticket_id, from_status, to_status, changed_by)
          VALUES (?, ?, ?, 1)
        `).run(t.id, flow[i-1], flow[i]);
      }
    }
  });

  /* Recompute KTV active_tickets counters */
  db.prepare(`
    UPDATE technicians SET active_tickets = (
      SELECT COUNT(*) FROM tickets
      WHERE technician_id = technicians.id AND status IN ('waiting','in-progress','testing')
    )
  `).run();

  console.log('  ✓ Tickets: 12 + status history');
}

function seedPayments() {
  const existing = db.prepare('SELECT COUNT(*) AS c FROM payments').get().c;
  if (existing > 0) { console.log(`  • Payments already seeded (${existing} rows) — skip`); return; }
  const t = db.prepare('SELECT * FROM tickets WHERE code = ?').get('FFC-0085');
  if (!t) return;
  const discount = 5;
  const discountAmt = Math.round(t.quote * discount / 100);
  const final = t.quote - discountAmt;
  db.prepare(`
    INSERT INTO payments (invoice_no, ticket_id, customer_id, amount, discount_pct, discount_amount, final_amount, method, cashier_id)
    VALUES ('INV-2026-0141', ?, ?, ?, ?, ?, ?, 'bank', 4)
  `).run(t.id, t.customer_id, t.quote, discount, discountAmt, final);
  db.prepare(`
    UPDATE customers SET total_spent = total_spent + ?, last_visit = CURRENT_TIMESTAMP WHERE id = ?
  `).run(final, t.customer_id);
  console.log('  ✓ Payment: INV-2026-0141 (FFC-0085)');
}

function seedBookings() {
  const existing = db.prepare('SELECT COUNT(*) AS c FROM bookings').get().c;
  if (existing > 0) { console.log(`  • Bookings already seeded (${existing} rows) — skip`); return; }
  db.prepare(`
    INSERT INTO bookings (code, customer_name, customer_phone, customer_email, service_type, device, issue, method, address, appointment_date, time_slot, status)
    VALUES ('FFC-ONL-001', 'Phạm Hoài An', '0989777111', 'an@example.com',
            'phone', 'iPhone 15 Pro Max', 'Pin chai nhanh, cần thay', 'store',
            null, '2026-05-22', '14-16', 'pending')
  `).run();
  console.log('  ✓ Booking: FFC-ONL-001 (pending)');
}

function seedParts() {
  const existing = db.prepare('SELECT COUNT(*) AS c FROM parts').get().c;
  if (existing > 0) { console.log(`  • Parts already seeded (${existing} rows) — skip`); return; }
  const insert = db.prepare(`
    INSERT INTO parts (sku, name, category, unit_cost, unit_price, stock, min_stock)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  insert.run('BAT-IP14',  'Pin iPhone 14 Pisen',          'Pin',     350000,  580000, 20, 5);
  insert.run('BAT-IP15',  'Pin iPhone 15 Original',       'Pin',     900000, 1500000,  8, 3);
  insert.run('SCR-IP13',  'Màn iPhone 13 Hard OLED',      'Màn hình',1500000,2800000, 12, 3);
  insert.run('SCR-S24U',  'Màn Samsung S24 Ultra zin',    'Màn hình',4800000,6800000,  3, 2);
  insert.run('SSD-1TB-N', 'SSD Samsung 980 1TB NVMe',     'Storage',1200000, 1890000, 15, 5);
  insert.run('RAM-16-DD', 'RAM Crucial 16GB DDR4 3200',   'RAM',     500000,  980000, 18, 5);
  insert.run('CHG-30W',   'Sạc nhanh 30W USB-C',          'Sạc',     150000,  320000, 30,10);
  insert.run('CBL-USBC',  'Cáp USB-C to Lightning 1m',    'Cáp',      80000,  180000, 45,15);
  console.log('  ✓ Parts: 8 SKUs');
}

console.log('🌱 Seeding FFC database...\n');
seedUsers();
seedCustomers();
seedTechnicians();
/* Bỏ phiếu mẫu (tickets/bookings/payments) — chỉ giữ users/KTV/parts.
   Anh demo data thật trên web, tránh trông "ảo".
   Nếu cần phiếu mẫu trở lại: bỏ comment 3 dòng dưới. */
// seedTickets();
// seedPayments();
// seedBookings();
seedParts();
console.log('\n✓ Done. Database ready at', process.env.DB_PATH || './data/ffc.db');
console.log('\n📋 Demo credentials:');
console.log('  Admin:    admin     / admin');
console.log('  Manager:  manager   / manager');
console.log('  Lễ tân:   reception / reception');
console.log('  Thu ngân: cashier   / cashier');
console.log('  Khách:    0900000001 / khach (login by phone)');
