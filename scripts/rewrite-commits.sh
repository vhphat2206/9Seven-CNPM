#!/usr/bin/env bash
# Rewrite 20 commit messages on branch `dev` to include NICE-xxx Jira refs.
# Run from project root. Force-pushes to origin/dev when done.
set -e

cd "$(git rev-parse --show-toplevel)"

if [ "$(git rev-parse --abbrev-ref HEAD)" != "dev" ]; then
  echo "❌ Phải đứng trên branch dev. Hiện đang: $(git rev-parse --abbrev-ref HEAD)"
  exit 1
fi

echo "Backup branch hiện tại → dev-backup-pre-jira"
git branch -f dev-backup-pre-jira

echo "Rewriting commit messages..."
git filter-branch -f --msg-filter '
case "$GIT_COMMIT" in
  37d669a*) echo "feat(NICE-001): scaffold Node.js + Express + SQLite project" ;;
  972fa92*) echo "feat(NICE-001): add SQLite schema + DB init with auto-migrations" ;;
  478a64a*) echo "feat(NICE-001): add JWT auth middleware + email notify service" ;;
  bc886f6*) echo "feat(NICE-001): wire Express server + seed script for admin and demo data" ;;
  2704851*) echo "feat(NICE-002): implement auth, customers, technicians routes" ;;
  07b3556*) echo "feat(NICE-002): implement tickets, bookings, chats, payments routes" ;;
  fda431a*) echo "feat(NICE-002): implement parts inventory, reports, notifications routes" ;;
  83cd433*) echo "feat(NICE-002): add pricing lookup endpoint with cascading dropdowns + seed market data" ;;
  6b3537e*) echo "docs(NICE-002): update backend README with run guide + endpoint reference" ;;
  33944ac*) echo "feat(NICE-003): add API client wrapper + notifications module" ;;
  0681595*) echo "feat(NICE-003): build admin + KTV dashboard with role-based UI, KPI reports, parts management, settings" ;;
  e6e76d9*) echo "feat(NICE-003): add team photos + Gizmo chatbot avatar assets" ;;
  08257b2*) echo "feat(NICE-004): redesign homepage with quote lookup, service catalog, booking method filter" ;;
  0952167*) echo "feat(NICE-004): update customer chat UI with KTV thread support" ;;
  bf817ca*) echo "feat(NICE-005): add customer self-registration modal on login page" ;;
  2c130b7*) echo "feat(NICE-006): add Render.com blueprint + runtime FE config + deploy guide" ;;
  e6d04e0*) echo "fix(NICE-006): correct service URLs to nineseven-* (Render auto-renamed)" ;;
  eecd534*) echo "fix(NICE-006): pin Node to 22.x for better-sqlite3 prebuilt compatibility" ;;
  663fdee*) echo "docs(NICE-006): add ERD + data dictionary for database schema" ;;
  6fdefeb*) echo "chore(NICE-006): remove demo tickets/bookings/payments seed data" ;;
  *) cat ;;
esac
' d12fd04..HEAD

echo ""
echo "✓ Done. New commit log:"
git log --oneline | head -22
