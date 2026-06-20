/**
 * FFC runtime config — phải nạp TRƯỚC api.js.
 * Tự nhận diện môi trường:
 *   - localhost          → gọi BE tại http://localhost:3001/api
 *   - *.onrender.com     → gọi BE deploy trên Render
 *   - Domain khác        → fallback localhost (anh có thể override window.FFC_API_BASE thủ công)
 */
(function () {
  const host = window.location.hostname;
  const PROD_API = 'https://9seven-ffc-api.onrender.com/api';
  if (host.endsWith('.onrender.com') || host.endsWith('.vercel.app') || host.endsWith('.netlify.app')) {
    window.FFC_API_BASE = PROD_API;
  }
  // else: api.js sẽ fallback về http://localhost:3001/api
})();
