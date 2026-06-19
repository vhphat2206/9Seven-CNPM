/**
 * /api/pricing — bảng giá tham khảo cho khách tra cứu báo giá sơ bộ.
 *
 *   GET /devices               → distinct device_type list
 *   GET /models?device_type=…  → distinct device_model trong loại đó
 *   GET /issues?device_type=…&device_model=… → list lỗi + giá tham khảo
 *   GET /quote?device_type=…&device_model=…&issue_code=… → giá chi tiết 1 lỗi
 *   GET /                      → toàn bộ bảng giá (admin debug)
 *
 * Public endpoints — khách KHÔNG cần đăng nhập để xem giá.
 */
const express = require('express');
const db = require('../db');

const router = express.Router();

/* Seed dữ liệu mẫu lần đầu chạy. Giá tham khảo thị trường HCM 2026. */
(function seedPricingIfEmpty() {
  const cnt = db.prepare('SELECT COUNT(*) AS n FROM pricing').get().n;
  if (cnt > 0) return;
  const insert = db.prepare(`
    INSERT INTO pricing (device_type, device_model, issue_code, issue_label,
                         price_from, price_to, warranty_days, est_hours)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const data = [
    /* iPhone */
    ['iphone', 'iPhone 13',     'screen',        'Thay màn hình (zin)',         2200000, 2800000, 90, 2],
    ['iphone', 'iPhone 13',     'battery',       'Thay pin (zin)',               650000,  850000, 180, 1],
    ['iphone', 'iPhone 13',     'charging_port', 'Sửa cổng sạc',                 350000,  550000, 90, 2],
    ['iphone', 'iPhone 13',     'mainboard',     'Sửa main (phụ thuộc lỗi)',     800000, 3500000, 30, 24],
    ['iphone', 'iPhone 14',     'screen',        'Thay màn hình (zin)',         2800000, 3500000, 90, 2],
    ['iphone', 'iPhone 14',     'battery',       'Thay pin (zin)',               750000,  950000, 180, 1],
    ['iphone', 'iPhone 14',     'back_glass',    'Ép kính lưng',                 400000,  600000, 30, 3],
    ['iphone', 'iPhone 14',     'camera',        'Sửa/thay camera',              500000, 1500000, 90, 4],
    ['iphone', 'iPhone 15',     'screen',        'Thay màn hình (zin)',         3500000, 4500000, 90, 2],
    ['iphone', 'iPhone 15',     'battery',       'Thay pin (zin)',               900000, 1200000, 180, 1],
    ['iphone', 'iPhone 15 Pro', 'screen',        'Thay màn hình (zin)',         5500000, 7000000, 90, 2],
    ['iphone', 'iPhone 15 Pro', 'battery',       'Thay pin (zin)',              1100000, 1400000, 180, 1],

    /* Android */
    ['android', 'Galaxy S24',     'screen',  'Thay màn hình',  3200000, 4200000, 90, 3],
    ['android', 'Galaxy S24',     'battery', 'Thay pin',        650000,  850000, 180, 2],
    ['android', 'Galaxy S23',     'screen',  'Thay màn hình',  2800000, 3600000, 90, 3],
    ['android', 'Galaxy S23',     'battery', 'Thay pin',        550000,  750000, 180, 2],
    ['android', 'Xiaomi 14',      'screen',  'Thay màn hình',  1800000, 2400000, 90, 3],
    ['android', 'Xiaomi 14',      'battery', 'Thay pin',        450000,  650000, 180, 2],
    ['android', 'Oppo Reno 11',   'screen',  'Thay màn hình',  1500000, 2000000, 90, 3],

    /* MacBook */
    ['macbook', 'MacBook Air M2',  'battery',   'Thay pin',                   2200000, 2800000, 180, 4],
    ['macbook', 'MacBook Air M2',  'keyboard',  'Thay bàn phím',              1800000, 2400000, 90, 6],
    ['macbook', 'MacBook Air M2',  'screen',    'Thay màn hình',              7500000, 9500000, 90, 6],
    ['macbook', 'MacBook Pro 14',  'battery',   'Thay pin',                   2800000, 3500000, 180, 4],
    ['macbook', 'MacBook Pro 14',  'mainboard', 'Sửa main',                   3500000,15000000, 30, 48],
    ['macbook', 'MacBook Pro 14',  'liquid',    'Vệ sinh main do vào nước',   1500000, 4500000, 30, 24],

    /* Laptop PC */
    ['laptop', 'ASUS ROG Strix',   'screen',    'Thay màn hình',              2500000, 4000000, 90, 4],
    ['laptop', 'ASUS ROG Strix',   'keyboard',  'Thay bàn phím',               800000, 1500000, 90, 3],
    ['laptop', 'ASUS ROG Strix',   'fan',       'Vệ sinh + tra keo tản nhiệt', 250000,  450000, 30, 2],
    ['laptop', 'Dell XPS 13',      'battery',   'Thay pin',                    900000, 1500000, 180, 2],
    ['laptop', 'Dell XPS 13',      'mainboard', 'Sửa main',                   1500000, 6000000, 30, 24],
    ['laptop', 'HP Pavilion',      'screen',    'Thay màn hình',              1500000, 2500000, 90, 4],
    ['laptop', 'Lenovo ThinkPad',  'keyboard',  'Thay bàn phím',               650000, 1200000, 90, 3],

    /* PC */
    ['pc', 'PC Gaming',  'cleaning',  'Vệ sinh máy + tra keo CPU/GPU',  300000,  500000, 30, 2],
    ['pc', 'PC Gaming',  'psu',       'Thay nguồn (PSU)',               800000, 2500000, 365, 1],
    ['pc', 'PC Gaming',  'gpu',       'Sửa/vệ sinh VGA',                 500000, 1500000, 90, 4],
    ['pc', 'PC Văn phòng', 'cleaning', 'Vệ sinh tổng quát',              200000,  350000, 30, 1],
    ['pc', 'PC Văn phòng', 'ssd',     'Nâng cấp SSD 256GB',              700000, 1000000, 365, 1],
  ];

  const tx = db.transaction((rows) => rows.forEach(r => insert.run(...r)));
  tx(data);
  console.log(`[seed] pricing — inserted ${data.length} rows`);
})();

/* GET /devices → distinct device types */
router.get('/devices', (_req, res) => {
  const rows = db.prepare(`
    SELECT device_type, COUNT(*) AS n
    FROM pricing WHERE is_active = 1
    GROUP BY device_type ORDER BY device_type
  `).all();
  res.json({ data: rows });
});

/* GET /models?device_type=iphone */
router.get('/models', (req, res) => {
  const { device_type } = req.query;
  if (!device_type) return res.status(400).json({ error: 'Thiếu device_type' });
  const rows = db.prepare(`
    SELECT DISTINCT device_model FROM pricing
    WHERE device_type = ? AND is_active = 1
    ORDER BY device_model
  `).all(device_type);
  res.json({ data: rows.map(r => r.device_model) });
});

/* GET /issues?device_type=iphone&device_model=iPhone%2014 */
router.get('/issues', (req, res) => {
  const { device_type, device_model } = req.query;
  if (!device_type || !device_model) {
    return res.status(400).json({ error: 'Thiếu device_type hoặc device_model' });
  }
  const rows = db.prepare(`
    SELECT issue_code, issue_label, price_from, price_to, warranty_days, est_hours
    FROM pricing
    WHERE device_type = ? AND device_model = ? AND is_active = 1
    ORDER BY price_from
  `).all(device_type, device_model);
  res.json({ data: rows });
});

/* GET /quote — báo giá 1 lỗi cụ thể */
router.get('/quote', (req, res) => {
  const { device_type, device_model, issue_code } = req.query;
  if (!device_type || !device_model || !issue_code) {
    return res.status(400).json({ error: 'Thiếu tham số' });
  }
  const row = db.prepare(`
    SELECT * FROM pricing
    WHERE device_type = ? AND device_model = ? AND issue_code = ? AND is_active = 1
  `).get(device_type, device_model, issue_code);
  if (!row) return res.status(404).json({ error: 'Không có bảng giá cho lỗi này' });
  res.json({ quote: row });
});

/* GET / → toàn bộ */
router.get('/', (_req, res) => {
  res.json({ data: db.prepare('SELECT * FROM pricing WHERE is_active = 1 ORDER BY device_type, device_model, price_from').all() });
});

module.exports = router;
