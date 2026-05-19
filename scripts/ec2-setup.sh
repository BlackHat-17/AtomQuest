#!/usr/bin/env bash
# =============================================================================
# ec2-setup.sh — One-time EC2 Instance Bootstrap
# Run once on a fresh Ubuntu 22.04 EC2 instance as ubuntu user:
#   chmod +x ec2-setup.sh && ./ec2-setup.sh
# =============================================================================
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/YOUR_ORG/AtomQuest.git}"
APP_DIR="${APP_DIR:-/opt/atomquest}"
COMPOSE_VERSION="v2.29.2"

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║        AtomQuest — EC2 Bootstrap Setup           ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""

# ── 1. System packages ────────────────────────────────────────────────────────
echo "→ Updating system packages..."
sudo apt-get update -qq
sudo apt-get upgrade -y -qq
sudo apt-get install -y -qq \
  git curl wget unzip gnupg ca-certificates \
  lsb-release apt-transport-https

# ── 2. Docker ─────────────────────────────────────────────────────────────────
if ! command -v docker &>/dev/null; then
  echo "→ Installing Docker..."
  curl -fsSL https://get.docker.com | sudo bash
  sudo usermod -aG docker "$USER"
  echo "  ✓ Docker installed. NOTE: Log out and back in for group change to take effect."
else
  echo "  ✓ Docker already installed: $(docker --version)"
fi

# ── 3. Docker Compose plugin ──────────────────────────────────────────────────
if ! docker compose version &>/dev/null; then
  echo "→ Installing Docker Compose plugin..."
  sudo mkdir -p /usr/local/lib/docker/cli-plugins
  sudo curl -SL "https://github.com/docker/compose/releases/download/${COMPOSE_VERSION}/docker-compose-linux-x86_64" \
    -o /usr/local/lib/docker/cli-plugins/docker-compose
  sudo chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
  echo "  ✓ Docker Compose installed: $(docker compose version)"
else
  echo "  ✓ Docker Compose already installed: $(docker compose version)"
fi

# ── 4. UFW Firewall ───────────────────────────────────────────────────────────
echo "→ Configuring UFW firewall..."
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable
echo "  ✓ Firewall configured (22, 80, 443 open)"

# ── 5. Clone repository ───────────────────────────────────────────────────────
if [ ! -d "$APP_DIR" ]; then
  echo "→ Cloning repository to $APP_DIR..."
  sudo git clone "$REPO_URL" "$APP_DIR"
  sudo chown -R "$USER":"$USER" "$APP_DIR"
  echo "  ✓ Repository cloned"
else
  echo "  ✓ Repository already exists at $APP_DIR"
fi

# ── 6. Create .env.production from example ────────────────────────────────────
ENV_FILE="$APP_DIR/backend/.env.production"
EXAMPLE_FILE="$APP_DIR/backend/.env.ec2.example"

if [ ! -f "$ENV_FILE" ]; then
  echo "→ Creating $ENV_FILE from example..."
  cp "$EXAMPLE_FILE" "$ENV_FILE"
  echo ""
  echo "  ⚠️  ACTION REQUIRED: Edit $ENV_FILE and fill in all <...> placeholders:"
  echo "       - POSTGRES_PASSWORD"
  echo "       - REDIS_PASSWORD"
  echo "       - JWT_SECRET (run: openssl rand -base64 48)"
  echo "       - JWT_REFRESH_SECRET (run: openssl rand -base64 48)"
  echo "       - FRONTEND_URL (your EC2 public IP or domain)"
  echo ""
else
  echo "  ✓ $ENV_FILE already exists"
fi

# ── 7. Done ───────────────────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║           Bootstrap Complete!                    ║"
echo "╠══════════════════════════════════════════════════╣"
echo "║ Next steps:                                      ║"
echo "║   1. Edit backend/.env.production with secrets   ║"
echo "║   2. Run: ./scripts/ec2-deploy.sh                ║"
echo "║   3. (Optional) Run: ./nginx/certbot-init.sh     ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""
