#!/bin/bash
# Chạy cả Backend (port 3001) + Frontend (port 5500) trong 1 lệnh
# Sử dụng: ./dev.sh
# Dừng:   Ctrl+C (tắt cả 2)

set -e

# Kill process cũ nếu đang chiếm port
lsof -ti :3001 | xargs kill -9 2>/dev/null || true
lsof -ti :5500 | xargs kill -9 2>/dev/null || true

cd "$(dirname "$0")"

echo "🟡 Starting Backend on http://localhost:3001 ..."
(cd backend && npm start) &
BE_PID=$!

echo "🟡 Starting Frontend on http://localhost:5500 ..."
(cd frontend && npx --yes http-server -p 5500 -c-1 -s) &
FE_PID=$!

# Khi nhấn Ctrl+C → tắt cả 2 process
trap "echo ''; echo '🛑 Stopping...'; kill $BE_PID $FE_PID 2>/dev/null; exit 0" INT TERM

sleep 3
echo ""
echo "✅ Sẵn sàng. Mở browser:"
echo "   👉 http://localhost:5500/admin.html  (đăng nhập)"
echo "   👉 http://localhost:5500/index.html  (trang khách)"
echo ""
echo "Bấm Ctrl+C để dừng cả 2."

wait
