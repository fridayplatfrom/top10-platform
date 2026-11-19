# Top 10 Platform — Production Launch & Deployment Manual

This guide covers everything needed to take the **Top 10 Directory & Monetization Platform** live on the web, connect live PayPal payments, submit to search engines, and kickstart founder bidding.

---

## 1. Quickstart Options

### Option A: Docker Compose (Recommended for Full Stack)
The repository includes a ready-to-use Docker Compose configuration running one Node.js 22 Alpine process with a persistent JSON volume. Optional external MariaDB settings are supported; MongoDB is not used.

```bash
# 1. Clone repository to your server
git clone <repo-url> top10
cd top10/top10-platform

# 2. Configure environment variables
cp .env.example .env
nano .env # Set ADMIN_PASSWORD, BASE_URL and any required service credentials

# 3. Launch stack
docker compose up -d

# 4. Check status & logs
docker compose ps
docker compose logs -f web
```

The application is now live at `http://localhost:3456` with automatic container healthchecks.

---

### Option B: Bare-Metal VPS with PM2 (Ubuntu / Debian)
For hosting on DigitalOcean, Hetzner, Linode, or AWS EC2:

```bash
# 1. Install Node.js 22 LTS
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs nginx certbot python3-certbot-nginx

# 2. Install PM2 process manager
sudo npm install -g pm2

# 3. Clone and install dependencies
cd /var/www/top10/top10-platform
npm ci --omit=dev

# 4. Inject environment values through your process manager, then start one worker
pm2 start ecosystem.config.js --env production
pm2 save
pm2 startup
```

---

### Option C: Cloud PaaS (Railway / Render / Fly.io)
- **Railway**: 
  1. Click **New Project** -> **Deploy from GitHub repo**.
  2. Provision persistent writable storage for `DB_PATH` outside the deployment checkout.
  3. Inject `ADMIN_PASSWORD`, `BASE_URL`, and optionally `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`.
  4. Railway automatically detects `npm start` and deploys.

- **Render**:
  1. Create **Web Service** pointing to repository.
  2. Build Command: `npm ci --omit=dev`.
  3. Start Command: `npm start`.
  4. Add Environment Variables from `.env.example`.

---

## 2. Nginx Reverse Proxy with HTTPS (SSL)

Create `/etc/nginx/sites-available/top10`:

```nginx
server {
    server_name top10.yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:3456;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Enable site and acquire free SSL certificate:

```bash
sudo ln -s /etc/nginx/sites-available/top10 /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
sudo certbot --nginx -d top10.yourdomain.com
```

---

## 3. Connecting Live PayPal Payments

1. Log in to [PayPal Developer Dashboard](https://developer.paypal.com/dashboard/).
2. Switch to **Live** mode.
3. Create an **App** (e.g. `Top 10 Directory Revenue`).
4. Copy the **Client ID** and **Secret Key**.
5. In your production `.env`:
   ```bash
   PAYPAL_MODE=live
   PAYPAL_CLIENT_ID=AXxxxxxxxxxxxxxxxxxxxxxxxxxxx
   PAYPAL_CLIENT_SECRET=EYyyyyyyyyyyyyyyyyyyyyyyyyyy
   ```
6. Restart the server: `pm2 reload top10-platform`.

Now every:
- **$99 New Category Launch Fee**
- **Programmatic Placement Bid ($49–$5,000+)**
- **Monthly Sponsorship Retainer ($299/mo Lock #1, $149/mo Guaranteed Top 3)**
- **$49 Verified Buyer RFP Lead Unlock**
will process directly into your live PayPal Business account.

---

## 4. Google & Bing Search Console Submission

Once your domain is live:
1. Open [Google Search Console](https://search.google.com/search-console).
2. Add Property -> `https://top10.yourdomain.com`.
3. Submit Sitemap URL: `https://top10.yourdomain.com/sitemap.xml`.
4. Check [Bing Webmaster Tools](https://www.bing.com/webmasters) and import from Google Search Console.
5. Verify `/robots.txt` and `/llms.txt` are reachable by AI crawlers (Perplexity, ChatGPT, Claude).

---

## 5. Founder "Claim Listing" Cold Outreach Script

Send this short, high-converting email to listed founders (addresses can be found via LinkedIn, Twitter, or Hunter.io):

> **Subject:** Your platform is ranked #3 on Top 10
> 
> Hi [Founder Name],
> 
> Quick heads up — [Platform Name] was just featured in our **Top 10 [Category Name] of 2026** buying guide:
> 
> 👉 https://top10.yourdomain.com/list/[category-slug]
> 
> You're currently ranked **#3** with 14,000+ monthly buyer views in this directory. 
> 
> You can claim your official verified badge (free), update your feature matrix, or lock the #1 sponsored spot here:
> 👉 https://top10.yourdomain.com/list/[category-slug]?claim=[product-id]
> 
> Best,  
> The Top 10 Editorial Team


## Runtime durability and safe deployment checks

- Hostinger's actual Git auto-deploy branch is an account setting, not established by this repository. Verify it before pushing; a push can be a production deployment.
- Run one worker/replica. File-backed read-modify-write and in-memory sessions are not cluster-safe. Restarting clears sessions; each process runs its own scheduler.
- `.env` is an example, not automatically loaded by `node server.js` or PM2. Inject environment values explicitly through the hosting service or process manager. Compose uses its `.env` substitution. `ADMIN_SECRET_KEY` does not configure authentication; use `ADMIN_PASSWORD` before initial account creation. Changing it later does not rotate stored passwords.
- The runtime reads/writes `DB_PATH` (default `data/db.json`). That default file is tracked seed data, not a safe production backup. Use persistent storage and a verified backup before upgrades. When using a new empty path without MariaDB, explicitly provision the intended seed snapshot before launch.
- MariaDB is optional: missing credentials or failed initialization falls back to local JSON. A successful HTTP liveness check does not prove SQL readiness. Check authenticated `/api/admin/db-status` and logs separately. Docker's unauthenticated healthcheck only tests HTTP liveness.
- SQL mirrors snapshots asynchronously. API success confirms local saving, not completion of remote persistence. SQL sync errors only log; concurrent snapshots are not serialized. There is no shutdown drain or transactional multi-process protection. Do not rely on MariaDB alone to guarantee every acknowledged edit survives abrupt termination/redeployment.
- Initialization currently opens the listener before MariaDB hydration completes. Keep deployment traffic quiescent until hydration and readiness have been verified; startup hydration may overwrite early local edits.
- Local corruption and write failures now raise errors rather than silently returning an empty state or successful save. Invalid remote snapshots are rejected without replacement; diagnose the startup error and restore a verified snapshot rather than overwriting recovery data.
- In Docker, `127.0.0.1` means the app container, not the host. Set `DB_HOST` to an accessible database service when enabling MariaDB. The Compose stack no longer starts the unused MongoDB service. Existing MongoDB volumes are not migrated or deleted: retain them for recovery and never use `docker compose down -v` as an upgrade step.
- Docker build/config changes require local validation before deployment. Do not publish an untested image. The legacy `render.yaml` build command does not install dependencies; follow the explicit `npm ci --omit=dev` build setting above instead.
