# Production Deployment Checklist — AWS EC2

## Pre-Deployment (Local)

### Code Preparation
- [ ] All features tested locally (`npm run dev` in backend + frontend)
- [ ] TypeScript compiles without errors (`npm run type-check` in backend)
- [ ] Backend builds successfully (`npm run build` in backend)
- [ ] Frontend builds successfully (`npm run build` in frontend)
- [ ] Git repository up to date (`git push`)
- [ ] No `.env` files committed (verify with `git status`)
- [ ] No `.pem` files committed (verify with `git status`)

### Security
- [ ] Strong JWT secret generated (48+ characters): `openssl rand -base64 48`
- [ ] Strong JWT refresh secret generated (48+ characters)
- [ ] Strong PostgreSQL password set
- [ ] Strong Redis password set
- [ ] `FRONTEND_URL` in `.env.production` matches exact EC2 IP/domain
- [ ] Rate limiting is active (`NODE_ENV=production` in env file)

---

## EC2 Instance Setup

### AWS Console
- [ ] EC2 instance launched (Ubuntu 22.04 LTS, t3.small or larger)
- [ ] Security Group configured:
  - [ ] Port 22 (SSH) open to your IP
  - [ ] Port 80 (HTTP) open to 0.0.0.0/0
  - [ ] Port 443 (HTTPS) open to 0.0.0.0/0 (if using SSL)
- [ ] Elastic IP associated (optional but recommended — prevents IP changes on restart)

### First-Time Bootstrap
- [ ] SSH into EC2 successfully
- [ ] `scripts/ec2-setup.sh` executed
- [ ] Logged out and back in (Docker group permissions)
- [ ] `backend/.env.production` filled in (no `<...>` placeholders remain)
- [ ] `frontend/.env.production` `VITE_API_BASE_URL` updated with EC2 IP/domain

---

## Deployment

### Docker Services
- [ ] `./scripts/ec2-deploy.sh` runs without errors
- [ ] All containers show as healthy: `docker compose ps`
  - [ ] `atomquest_postgres` — healthy
  - [ ] `atomquest_redis` — healthy
  - [ ] `atomquest_backend` — healthy
  - [ ] `atomquest_frontend` — running
  - [ ] `atomquest_nginx` — running

### Database
- [ ] Migrations applied (`prisma migrate deploy` in deploy script output)
- [ ] Database seeded (`docker compose exec backend npx prisma db seed`) — first deploy only

### Verification
- [ ] Health check: `curl http://<EC2_IP>/api/health` returns `{"status":"ok",...}`
- [ ] Frontend loads in browser: `http://<EC2_IP>`
- [ ] Login works
- [ ] Goal creation works
- [ ] Manager approval flow works
- [ ] Admin panel accessible

---

## SSL/HTTPS Setup (if using a domain)

- [ ] Domain A record pointing to EC2 Elastic IP
- [ ] DNS propagated (check with `nslookup yourdomain.com`)
- [ ] `nginx/certbot-init.sh` executed successfully
- [ ] `nginx/nginx.conf` updated:
  - [ ] HTTP block redirects to HTTPS
  - [ ] HTTPS server block uncommented
  - [ ] Domain name replaced (both blocks)
- [ ] `FRONTEND_URL` updated to `https://yourdomain.com`
- [ ] `VITE_API_BASE_URL` updated to `https://yourdomain.com/api`
- [ ] Redeployed: `docker compose -f docker-compose.yml -f docker-compose.ssl.yml up -d --build`
- [ ] `https://yourdomain.com` loads with valid SSL certificate
- [ ] HTTP redirects to HTTPS

---

## Post-Launch Monitoring

- [ ] `docker compose logs -f` shows no errors after 5 minutes of use
- [ ] Response times acceptable (check browser Network tab)
- [ ] No 502/500 errors in nginx logs
- [ ] Disk space acceptable: `df -h` and `docker system df`

### Recommended Monitoring Tools (future)
- [ ] AWS CloudWatch for EC2 metrics (CPU, memory, disk)
- [ ] Uptime monitoring (UptimeRobot, Better Uptime — free tier available)
- [ ] Log aggregation (optional: Datadog, Logtail)

---

## Rollback Plan

If deployment fails:
```bash
# Roll back to previous git commit
git log --oneline -5
git checkout <previous-commit-hash>
./scripts/ec2-deploy.sh
```

Or restore from the last working Docker image:
```bash
docker compose down
docker compose up -d   # uses last built images if no --build flag
```

---

**Keep this checklist updated as the application evolves.**