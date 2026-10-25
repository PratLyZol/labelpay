#!/usr/bin/env bash
# Runs ON the server after the checkout is updated: rebuild, migrate, verify Gemini, route, prune.
set -euo pipefail
cd /opt/labelpay
docker compose up -d --build app
# </dev/null so docker exec never consumes the caller's stdin
docker compose exec -T app node node_modules/tsx/dist/cli.mjs scripts/migrate.ts </dev/null | tail -1
docker compose exec -T app node node_modules/tsx/dist/cli.mjs scripts/gemini-smoke.ts </dev/null | tail -1
# Routing every task can take longer than a deploy. Keep it running inside the app container.
docker compose exec -d app sh -c 'rm -f /tmp/labelpay-route.exit; node node_modules/tsx/dist/cli.mjs scripts/route.ts >/tmp/labelpay-route.log 2>&1; echo $? >/tmp/labelpay-route.exit'
docker image prune -f >/dev/null
echo "deployed $(git rev-parse --short HEAD)"
