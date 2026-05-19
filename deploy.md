# AWS EC2 Deployment Guide — AtomQuest

## Architecture

```
Internet (port 80/443)
        │
        ▼
  [EC2 Security Group]
        │
        ▼
  [Nginx Container]  ←─── reverse proxy + rate limiting
     ├── /api/*  ──────►  [Backend Container :3000]
     │                         │
     │                    [Prisma ORM]
     │                         │
     │                    [PostgreSQL :5432] (internal only)
     │                    [Redis :6379]      (internal only)
     │
     └── /*  ────────►  [Frontend Container :80]  (React SPA)
```

> **Note**: PostgreSQL and Redis ports are **not** exposed to the host — they are only reachable inside the Docker network. Only ports 80 and 443 are public.

---

## Prerequisites

| Requirement | Details |
|---|---|
| EC2 Instance | Ubuntu 22.04 LTS, **t3.small** or larger recommended |
| Security Group | Inbound: 22 (SSH), 80 (HTTP), 443 (HTTPS) |
| Key Pair | Your `.pem` key (stored **outside** this repo) |
| GitHub | Repo must be accessible from EC2 |

---

## Part 1: First-Time EC2 Setup

### Step 1 — SSH into EC2

```bash
chmod 400 atomquest.pem
ssh -i atomquest.pem ubuntu@<EC2_PUBLIC_IP>
```

### Step 2 — Run the Bootstrap Script

```bash
# Clone the repo first (replace with your actual GitHub URL)
git clone https://github.com/YOUR_ORG/AtomQuest.git /opt/atomquest
cd /opt/atomquest

# Run the one-time setup (installs Docker, configures firewall)
chmod +x scripts/ec2-setup.sh
./scripts/ec2-setup.sh
```

> After the script runs, **log out and log back in** so Docker group permissions take effect:
> ```bash
> exit
> ssh -i atomquest.pem ubuntu@<EC2_PUBLIC_IP>
> ```

### Step 3 — Configure Environment Variables

```bash
cd /opt/atomquest

# Copy the EC2 example env file
cp backend/.env.ec2.example backend/.env.production

# Edit it and fill in all <...> placeholders
nano backend/.env.production
```

**Required values to fill in:**

```env
POSTGRES_PASSWORD=<strong-password>          # e.g., openssl rand -base64 24
REDIS_PASSWORD=<strong-password>
JWT_SECRET=<48-char-random>                  # openssl rand -base64 48
JWT_REFRESH_SECRET=<48-char-random>          # openssl rand -base64 48
FRONTEND_URL=http://<EC2_PUBLIC_IP>
```

Generate secrets:
```bash
openssl rand -base64 48   # run twice for JWT_SECRET and JWT_REFRESH_SECRET
```

### Step 4 — Update Frontend API URL

Edit `frontend/.env.production` and replace the placeholder:
```env
VITE_API_BASE_URL=http://<EC2_PUBLIC_IP>/api
```

---

## Part 2: Deploy

```bash
cd /opt/atomquest
chmod +x scripts/ec2-deploy.sh
./scripts/ec2-deploy.sh
```

The script will:
1. ✅ Validate your `.env.production` file
2. ✅ Pull latest code
3. ✅ Build all Docker images
4. ✅ Start all services
5. ✅ Wait for backend to become healthy
6. ✅ Run database migrations automatically
7. ✅ Print service status and health check

### Verify Deployment

```bash
# Check all containers are running
docker compose ps

# View logs
docker compose logs -f backend
docker compose logs -f nginx

# Test health endpoint
curl http://<EC2_PUBLIC_IP>/api/health
```

Expected response:
```json
{"status":"ok","timestamp":"...","uptime":42}
```

### Seed the Database (first deploy only)

```bash
docker compose exec backend npx prisma db seed
```

---

## Part 3: Enable HTTPS / SSL (Recommended)

### Prerequisites
- You must have a **domain name** with an A record pointing to your EC2 public IP
- Port 80 must be open (used for ACME challenge)

### Step 1 — Obtain Certificate

```bash
cd /opt/atomquest
export DOMAIN=yourdomain.com
export EMAIL=admin@yourdomain.com
chmod +x nginx/certbot-init.sh
./nginx/certbot-init.sh
```

### Step 2 — Enable HTTPS in Nginx Config

Edit `nginx/nginx.conf`:
1. Replace `your-domain.com` with your actual domain
2. Uncomment the `return 301 https://...` redirect in the HTTP block
3. Comment out the HTTP-only proxy blocks
4. Uncomment the entire `server { listen 443 ssl ...` block

### Step 3 — Update Environment Variables

```bash
# backend/.env.production
FRONTEND_URL=https://yourdomain.com

# frontend/.env.production
VITE_API_BASE_URL=https://yourdomain.com/api
```

### Step 4 — Redeploy with SSL Compose Override

```bash
docker compose -f docker-compose.yml -f docker-compose.ssl.yml up -d --build
```

Certbot will automatically renew the certificate every 12 hours.

---

## Part 4: Subsequent Deploys

After the first setup, deploying updates is just:

```bash
# Run from your local machine:
ssh -i atomquest.pem ubuntu@<EC2_PUBLIC_IP> "cd /opt/atomquest && ./scripts/ec2-deploy.sh"
```

Or SSH in and run manually:
```bash
cd /opt/atomquest
./scripts/ec2-deploy.sh
```

---

## Environment Variables Reference

### Backend (`backend/.env.production`)

| Variable | Required | Description |
|---|---|---|
| `NODE_ENV` | Yes | `production` |
| `PORT` | Yes | `3000` (internal port) |
| `POSTGRES_USER` | Yes | DB username (default: `goalportal`) |
| `POSTGRES_PASSWORD` | Yes | DB password — use a strong random value |
| `POSTGRES_DB` | Yes | DB name (default: `goalportal`) |
| `REDIS_PASSWORD` | Recommended | Redis password |
| `JWT_SECRET` | Yes | 48+ char random string |
| `JWT_REFRESH_SECRET` | Yes | 48+ char random string |
| `FRONTEND_URL` | Yes | Your EC2 IP or domain with protocol |
| `AAD_TENANT_ID` | No | Azure AD SSO |
| `AAD_CLIENT_ID` | No | Azure AD SSO |
| `AAD_CLIENT_SECRET` | No | Azure AD SSO |
| `SMTP_HOST` | No | Email notifications |
| `GEMINI_API_KEY` | No | AI features |

### Frontend (`frontend/.env.production`)

| Variable | Required | Description |
|---|---|---|
| `VITE_API_BASE_URL` | Yes | `http://<EC2_IP>/api` or `https://<DOMAIN>/api` |
| `VITE_AAD_CLIENT_ID` | No | Azure AD SSO |
| `VITE_AAD_TENANT_ID` | No | Azure AD SSO |
| `VITE_GEMINI_API_KEY` | No | AI features |

---

## Monitoring & Maintenance

### View Logs
```bash
# All services
docker compose logs -f

# Specific service
docker compose logs -f backend
docker compose logs -f nginx
docker compose logs -f postgres
```

### Restart a Service
```bash
docker compose restart backend
```

### Database Access
```bash
# Open Prisma Studio (requires port forwarding)
docker compose exec backend npx prisma studio

# Connect to PostgreSQL directly
docker compose exec postgres psql -U goalportal -d goalportal
```

### Disk Space
```bash
# Check Docker disk usage
docker system df

# Clean up dangling images
docker image prune -f
```

---

## Troubleshooting

| Issue | Solution |
|---|---|
| 502 Bad Gateway | Backend container not healthy — `docker compose logs backend` |
| 404 on React route refresh | Nginx SPA config applied — should be fixed automatically |
| DB connection refused | Wait for postgres healthcheck — `docker compose ps` |
| CORS errors | Verify `FRONTEND_URL` in `.env.production` matches exact origin |
| Rate limit errors (429) | Expected if testing rapidly — `NODE_ENV` must be `production` for limits to apply |
| Container won't start | Check `docker compose logs <service>` for startup errors |