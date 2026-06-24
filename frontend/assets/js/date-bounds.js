/* ============================================================
   Centralized date input bounds enforcer.
   Usage: add data-date-bound="past|future|past-strict|future-10y"
          to <input type="date"> elements.
   Auto-runs on DOMContentLoaded. Re-call window.applyDateBounds()
   after dynamically adding inputs to the DOM.
   ============================================================ */
(function () {
  const today = () => new Date().toISOString().split('T')[0];
  const shift = (years) => {
    const d = new Date();
    d.setFullYear(d.getFullYear() + years);
    return d.toISOString().split('T')[0];
  };

  function apply() {
    const t = today();
    document.querySelectorAll('input[type="date"][data-date-bound]').forEach((el) => {
      const kind = el.dataset.dateBound;
      switch (kind) {
        case 'past':           /* Ngày sinh, ngày vào làm: chỉ quá khứ */
          el.max = t;
          if (!el.min) el.min = '1900-01-01';
          break;
        case 'future':         /* Ngày hẹn / due / thi: chỉ tương lai */
          el.min = t;
          el.max = shift(1);   /* mặc định trong 1 năm */
          break;
        case 'future-10y':     /* Hết hạn thẻ SV / ra trường: tới +10 năm */
          el.min = t;
          el.max = shift(10);
          break;
        case 'future-3mo':     /* Đặt lịch: 3 tháng tới */
          el.min = t;
          const d = new Date(); d.setMonth(d.getMonth() + 3);
          el.max = d.toISOString().split('T')[0];
          break;
      }
    });
  }

  window.applyDateBounds = apply;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', apply);
  } else {
    apply();
  }
})();
