#!/usr/bin/env bash
# Fresh Ubuntu 24.04 Vultr instance -> running LabelPay with HTTPS. Run as root:
#   bash vultr.sh <git-repo-url> [domain]
# With no domain, uses <public-ip>.sslip.io (free wildcard DNS) so Caddy can still issue a real cert.
set -euo pipefail
REPO="${1:?git repo url}"
DOMAIN="${2:-}"
if [ -z "$DOMAIN" ]; then
  IP=$(curl -4 -fsS https://api.ipify.org || curl -4 -fsS https://ifconfig.me)
  DOMAIN="${IP}.sslip.io"
  echo ">> No domain given, using $DOMAIN"
fi

apt-get update -y && apt-get install -y ca-certificates curl git ufw
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" > /etc/apt/sources.list.d/docker.list
apt-get update -y && apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
ufw allow 22/tcp && ufw allow 80/tcp && ufw allow 443/tcp && ufw --force enable

[ -d /opt/labelpay ] || git clone "$REPO" /opt/labelpay
cd /opt/labelpay && git pull --ff-only || true

if [ ! -f .env ]; then
  cp .env.example .env
  echo "DOMAIN=$DOMAIN" >> .env
  echo ">> Configure /opt/labelpay/.env (DATABASE_URL, GEMINI_API_KEY, TREASURY_SECRET_KEY, SESSION_SECRET), then re-run this script."
  exit 0
fi
grep -q '^DOMAIN=' .env || echo "DOMAIN=$DOMAIN" >> .env

docker compose up -d --build
docker compose exec -T app node node_modules/tsx/dist/cli.mjs scripts/migrate.ts
docker compose exec -T app node node_modules/tsx/dist/cli.mjs scripts/seed.ts
echo ">> Live at https://$DOMAIN"
