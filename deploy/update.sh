#!/usr/bin/env bash
# Runs ON the server after the checkout is updated: rebuild, migrate, route, prune.
set -euo pipefail
cd /opt/labelpay
docker compose up -d --build app
# </dev/null so docker exec never consumes the caller's stdin
docker compose exec -T app node node_modules/tsx/dist/cli.mjs scripts/migrate.ts </dev/null | tail -1
docker compose exec -T app node node_modules/tsx/dist/cli.mjs scripts/route.ts </dev/null | tail -1
docker image prune -f >/dev/null
echo "deployed $(git rev-parse --short HEAD)"
