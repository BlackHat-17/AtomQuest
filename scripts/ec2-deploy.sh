#!/usr/bin/env bash
# =============================================================================
# ec2-deploy.sh — Repeatable Deploy Script (run on EC2)
# Usage:
#   cd /opt/atomquest && ./scripts/ec2-deploy.sh
#
# Or run remotely from your local machine:
#   ssh -i atomquest.pem ubuntu@<EC2_IP> "cd /opt/atomquest && ./scripts/ec2-deploy.sh"
# =============================================================================
set -euo pipefail

APP_DIR="${APP_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
COMPOSE_FILE="$APP_DIR/docker-compose.yml"
LOG_FILE="/var/log/atomquest-deploy.log"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE" 2>/dev/null || echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"
}

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║        AtomQuest — EC2 Deploy                    ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""

cd "$APP_DIR"

# ── 1. Verify env file exists ─────────────────────────────────────────────────
if [ ! -f "backend/.env.production" ]; then
  echo "ERROR: backend/.env.production not found."
  echo "       Copy backend/.env.ec2.example to backend/.env.production and fill in values."
  exit 1
fi

# Check for unfilled placeholders
if grep -q '<' "backend/.env.production"; then
  echo "ERROR: backend/.env.production still has unfilled placeholders (<...>)."
  echo "       Edit the file and replace all <...> values."
  exit 1
fi

# ── 2. Pull latest code ───────────────────────────────────────────────────────
log "→ Pulling latest code from git..."
git pull --ff-only
log "  ✓ Code updated"

# ── 3. Build images ───────────────────────────────────────────────────────────
log "→ Building Docker images..."
docker compose -f "$COMPOSE_FILE" build --no-cache
log "  ✓ Images built"

# ── 4. Start / update services ────────────────────────────────────────────────
log "→ Starting services..."
docker compose -f "$COMPOSE_FILE" up -d --remove-orphans
log "  ✓ Services started"

# ── 5. Wait for backend health ────────────────────────────────────────────────
log "→ Waiting for backend to become healthy..."
MAX_WAIT=120
ELAPSED=0
until docker compose -f "$COMPOSE_FILE" exec -T backend wget -qO- http://localhost:3000/api/health &>/dev/null; do
  if [ $ELAPSED -ge $MAX_WAIT ]; then
    log "ERROR: Backend did not become healthy within ${MAX_WAIT}s."
    docker compose -f "$COMPOSE_FILE" logs --tail=50 backend
    exit 1
  fi
  sleep 5
  ELAPSED=$((ELAPSED + 5))
  log "  ... waiting (${ELAPSED}s)"
done
log "  ✓ Backend is healthy"

# ── 6. Run DB migrations ──────────────────────────────────────────────────────
log "→ Running database migrations..."
docker compose -f "$COMPOSE_FILE" exec -T backend npx prisma migrate deploy
log "  ✓ Migrations applied"

# ── 7. Cleanup old images ─────────────────────────────────────────────────────
log "→ Cleaning up dangling images..."
docker image prune -f &>/dev/null || true

# ── 8. Show service status ────────────────────────────────────────────────────
echo ""
log "📊 Service Status:"
docker compose -f "$COMPOSE_FILE" ps
echo ""

# ── 9. Health check ───────────────────────────────────────────────────────────
HEALTH_RESPONSE=$(curl -sf http://localhost/api/health 2>/dev/null || echo "FAILED")
if echo "$HEALTH_RESPONSE" | grep -q '"status":"ok"'; then
  log "✅ Health check passed — app is live at http://$(curl -sf http://169.254.169.254/latest/meta-data/public-ipv4 2>/dev/null || echo '<EC2_PUBLIC_IP>')"
else
  log "⚠️  Health check via Nginx returned unexpected response: $HEALTH_RESPONSE"
  log "   Check 'docker compose logs nginx' for details"
fi

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║           Deploy Complete!                       ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""
