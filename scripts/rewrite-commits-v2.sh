#!/usr/bin/env bash
# Rewrite commit messages on `dev` to use REAL Jira IDs (NICE-13..19) from team board.
# Replaces previous placeholder mapping (NICE-001..006).
# Run from project root. Caller must force-push after.
set -e

cd "$(git rev-parse --show-toplevel)"

if [ "$(git rev-parse --abbrev-ref HEAD)" != "dev" ]; then
  echo "❌ Phải đứng trên branch dev."
  exit 1
fi

echo "Backup → dev-backup-pre-jira-v2"
git branch -f dev-backup-pre-jira-v2

echo "Rewriting commit messages với mã NICE-13..19 thật..."
git filter-branch -f --msg-filter '
case "$GIT_COMMIT" in
  44d1aa2*) echo "feat(NICE-18): scaffold Node.js + Express + SQLite project" ;;
  f5d5392*) echo "feat(NICE-13): add SQLite schema + DB init with auto-migrations" ;;
  d5e02a2*) echo "feat(NICE-18): add JWT auth middleware + email notify service" ;;
  9b58d32*) echo "feat(NICE-18): wire Express server + seed script for admin and demo data" ;;
  2ea6b4d*) echo "feat(NICE-18): implement auth, customers, technicians routes" ;;
  43d05a0*) echo "feat(NICE-16): implement tickets, bookings, chats, payments routes" ;;
  d3efa26*) echo "feat(NICE-15): implement parts inventory, reports, notifications routes" ;;
  2cfa32d*) echo "feat(NICE-19): add pricing lookup endpoint with cascading dropdowns + seed market data" ;;
  9de2da7*) echo "docs(NICE-17): update backend README with run guide + endpoint reference" ;;
  4883920*) echo "feat(NICE-13): add API client wrapper + notifications module" ;;
  21c968c*) echo "feat(NICE-14): build admin + KTV dashboard with role-based UI, KPI reports, parts management, settings" ;;
  d786867*) echo "feat(NICE-19): add team photos + Gizmo chatbot avatar assets" ;;
  2ec35e4*) echo "feat(NICE-19): redesign homepage with quote lookup, service catalog, booking method filter" ;;
  d1255b2*) echo "feat(NICE-14): update customer chat UI with KTV thread support" ;;
  cdc3f73*) echo "docs(NICE-17): add ERD + data dictionary for database schema" ;;
  538fb5c*) echo "feat(NICE-17): add Render.com blueprint + runtime FE config + deploy guide" ;;
  e90869a*) echo "fix(NICE-17): correct service URLs to nineseven-* (Render auto-renamed)" ;;
  6d86335*) echo "fix(NICE-17): pin Node to 22.x for better-sqlite3 prebuilt compatibility" ;;
  8f2f9dd*) echo "feat(NICE-18): add customer self-registration modal on login page" ;;
  726ab72*) echo "chore(NICE-19): remove demo tickets/bookings/payments seed data" ;;
  ba48a69*) echo "docs(NICE-17): add Jira task guide + commit rewrite script for Sprint 1 cleanup" ;;
  *) cat ;;
esac
' d12fd04..HEAD

echo ""
echo "✓ Done. New log:"
git log --oneline | head -22
