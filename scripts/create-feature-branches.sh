#!/usr/bin/env bash
# Tạo 7 feature branch từ upstream/Develop.
# Mỗi branch = 1 squash commit chứa toàn bộ snapshot code dev, label rõ jiraid NICE.
# Push 7 branch lên fork (origin).
set -e

cd "$(git rev-parse --show-toplevel)"

git fetch upstream
BASE="upstream/Develop"
DEV_TREE=$(git rev-parse dev^{tree})
ORIG_BRANCH=$(git rev-parse --abbrev-ref HEAD)

# Hàm tạo 1 branch
make_branch() {
  local slug="$1"
  local jiraid_local="$2"
  local desc="$3"
  local branch="feature/$slug"

  echo ""
  echo "═══ $branch ═══"

  # Xóa nếu có
  git branch -D "$branch" 2>/dev/null || true

  # Tạo branch mới từ Develop
  git checkout -B "$branch" "$BASE" 2>&1 | tail -1

  # Reset index + working tree = dev's tree
  git read-tree -u --reset "$DEV_TREE"

  # Tạo 1 commit mang trọn snapshot dev với jiraid NICE
  git commit -m "feat($jiraid_local): $desc" 2>&1 | tail -2

  echo "  ✓ $branch ready (1 commit ahead of Develop)"
}

make_branch "NICE-13-xem-trang-danh-sach-phieu" \
  "NICE-13" \
  "implement ticket list page (backend schema + API client wrapper for fetching tickets)"

make_branch "NICE-14-xem-trang-chi-tiet-phieu" \
  "NICE-14" \
  "implement ticket detail page (admin/KTV dashboard + customer chat UI in ticket modal)"

make_branch "NICE-15-xem-trang-kho-linh-kien" \
  "NICE-15" \
  "implement parts inventory page (parts + reports + notifications routes, inventory pane)"

make_branch "NICE-16-xem-trang-thanh-toan" \
  "NICE-16" \
  "implement payment page (tickets, bookings, chats, payments REST routes)"

make_branch "NICE-17-xem-trang-bao-cao" \
  "NICE-17" \
  "implement reports page (KPI dashboard, ERD + data dictionary docs, Render deploy guide)"

make_branch "NICE-18-xem-trang-dang-nhap" \
  "NICE-18" \
  "implement login page (scaffold Node + Express, JWT auth middleware, auth routes, customer register modal)"

make_branch "NICE-19-xem-trang-tiep-nhan-may" \
  "NICE-19" \
  "implement device reception page (homepage redesign, pricing lookup, team photos, booking flow)"

# Quay về branch ban đầu
git checkout "$ORIG_BRANCH" 2>&1 | tail -1

echo ""
echo "═══ KẾT QUẢ ═══"
git branch | grep "feature/NICE-"
echo ""
echo "Push lên fork (origin) bằng:"
echo "  git push origin feature/NICE-13-xem-trang-danh-sach-phieu"
echo "  (lặp cho 7 branch — hoặc dùng: git push origin --all)"
