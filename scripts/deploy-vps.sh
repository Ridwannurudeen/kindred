#!/usr/bin/env bash
# Kindred — VPS deploy script
#
# Builds the frontend, rsyncs to VPS, writes nginx vhost, requests TLS cert.
# Matches the pattern used for PolyScope, HERMES GENESIS, Nansen Divergence.
#
# Usage:
#   ./scripts/deploy-vps.sh                         (uses default VPS env vars)
#   VPS_HOST=user@1.2.3.4 ./scripts/deploy-vps.sh
#
# Prereqs (one-time on VPS):
#   - nginx installed
#   - certbot with /etc/letsencrypt/cli.ini set to webroot mode
#   - /var/www/letsencrypt/ webroot dir exists
#   - DNS A record for kindred.gudman.xyz → VPS IP
#
# IMPORTANT: never use `certbot --nginx` — it injects IP-specific listeners
# that hijack all 443 traffic and break SNI for other vhosts.

set -euo pipefail

VPS_HOST="${VPS_HOST:-root@gudman.xyz}"
DOMAIN="${DOMAIN:-kindred.gudman.xyz}"
REMOTE_DIR="${REMOTE_DIR:-/opt/kindred}"
WEBROOT="${WEBROOT:-/var/www/letsencrypt}"

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
APP_DIR="$ROOT_DIR/app"

echo "==> Building frontend"
cd "$APP_DIR"
npm install --silent
npm run build

DIST_DIR="$APP_DIR/dist"
test -d "$DIST_DIR" || { echo "FATAL: dist/ not produced"; exit 1; }

echo "==> Rsync $DIST_DIR → $VPS_HOST:$REMOTE_DIR"
ssh "$VPS_HOST" "mkdir -p $REMOTE_DIR"
rsync -avz --delete "$DIST_DIR/" "$VPS_HOST:$REMOTE_DIR/"

echo "==> Writing nginx vhost"
ssh "$VPS_HOST" "cat > /etc/nginx/sites-available/$DOMAIN" << NGINX
server {
    listen 80;
    server_name $DOMAIN;

    location /.well-known/acme-challenge/ {
        root $WEBROOT;
    }

    location / {
        return 301 https://\$host\$request_uri;
    }
}

server {
    listen 443 ssl http2;
    server_name $DOMAIN;

    ssl_certificate /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;

    root $REMOTE_DIR;
    index index.html;

    # SPA fallback (React Router client-side routing)
    location / {
        try_files \$uri \$uri/ /index.html;
    }

    # Cache static assets
    location ~* \.(js|css|woff2?|png|svg|jpg)\$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Don't cache index.html (so app-shell updates are visible immediately)
    location = /index.html {
        add_header Cache-Control "no-cache, no-store, must-revalidate";
    }
}
NGINX

ssh "$VPS_HOST" "ln -sfn /etc/nginx/sites-available/$DOMAIN /etc/nginx/sites-enabled/$DOMAIN"

echo "==> Issuing TLS cert (webroot — never --nginx)"
ssh "$VPS_HOST" "certbot certonly --webroot -w $WEBROOT -d $DOMAIN --non-interactive --agree-tos --email nraheemst@gmail.com" || {
    echo "WARN: certbot failed — likely cert already exists. Continuing."
}

echo "==> Reloading nginx"
ssh "$VPS_HOST" "nginx -t && systemctl reload nginx"

echo ""
echo "✓ Deployed: https://$DOMAIN"
