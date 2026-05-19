#!/usr/bin/env bash
# =============================================================================
# certbot-init.sh — Obtain Let's Encrypt SSL Certificate (run once on EC2)
#
# Prerequisites:
#   1. Your domain's DNS A record points to this EC2's public IP
#   2. Port 80 is open in EC2 Security Group
#   3. AtomQuest is running (docker compose up -d)
#
# Usage:
#   export DOMAIN=yourdomain.com
#   export EMAIL=you@example.com
#   chmod +x nginx/certbot-init.sh && ./nginx/certbot-init.sh
# =============================================================================
set -euo pipefail

DOMAIN="${DOMAIN:-}"
EMAIL="${EMAIL:-}"
APP_DIR="${APP_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"

if [ -z "$DOMAIN" ] || [ -z "$EMAIL" ]; then
  echo "ERROR: Set DOMAIN and EMAIL environment variables before running."
  echo "  export DOMAIN=yourdomain.com"
  echo "  export EMAIL=admin@yourdomain.com"
  exit 1
fi

echo ""
echo "→ Obtaining Let's Encrypt certificate for: $DOMAIN"
echo ""

# ── 1. Obtain certificate via webroot ─────────────────────────────────────────
docker run --rm \
  -v "atomquest_certbot_certs:/etc/letsencrypt" \
  -v "atomquest_certbot_www:/var/www/certbot" \
  certbot/certbot certonly \
    --webroot \
    --webroot-path=/var/www/certbot \
    --email "$EMAIL" \
    --agree-tos \
    --no-eff-email \
    -d "$DOMAIN"

echo ""
echo "✅ Certificate obtained!"
echo ""

# ── 2. Enable HTTPS in nginx.conf ─────────────────────────────────────────────
echo "→ Next steps to enable HTTPS:"
echo ""
echo "  1. Edit nginx/nginx.conf:"
echo "     - Replace 'your-domain.com' with: $DOMAIN"
echo "     - Comment out the HTTP proxy blocks"
echo "     - Uncomment the 'return 301 https://...' redirect"
echo "     - Uncomment the entire 'server { listen 443 ssl ...' block"
echo ""
echo "  2. Restart with SSL compose override:"
echo "     docker compose -f docker-compose.yml -f docker-compose.ssl.yml up -d"
echo ""
echo "  3. Update backend/.env.production:"
echo "     FRONTEND_URL=https://$DOMAIN"
echo ""
echo "  4. Update frontend/.env.production:"
echo "     VITE_API_BASE_URL=https://$DOMAIN/api"
echo ""
echo "  5. Rebuild and redeploy:"
echo "     ./scripts/ec2-deploy.sh"
