#!/bin/bash
# Pulls the latest Modo from GitHub; if anything changed (or --force), rebuilds and restarts.
set -e
cd /opt/modo
OLD=$(git rev-parse HEAD)
git fetch -q origin main && git reset -q --hard origin/main
NEW=$(git rev-parse HEAD)
[ "$OLD" = "$NEW" ] && [ "$1" != "--force" ] && exit 0
echo "$(date) updating $OLD → $NEW"
set -a; . /opt/modo/.env; set +a
npm install --no-audit --no-fund
node scripts/migrate.js
npx prisma generate
node scripts/tenant-schema.js
NODE_OPTIONS=--max-old-space-size=1536 npx next build
sudo -n systemctl restart modo 2>/dev/null || pkill -f "next start" || true
echo "$(date) done"
