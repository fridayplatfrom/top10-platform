# Top 10 Platform — Production Launch & Deployment Manual

This guide covers everything needed to take the **Top 10 Directory & Monetization Platform** live on the web, connect live PayPal payments, submit to search engines, and kickstart founder bidding.

---

## 1. Quickstart Options

### Option A: Docker Compose (Recommended for Full Stack)
The repository includes a ready-to-use Docker Compose configuration running Node.js 22 Alpine and MongoDB 7.0 with persistent volumes.

```bash
# 1. Clone repository to your server
git clone <repo-url> top10
cd top10/top10-platform

# 2. Configure environment variables
cp .env.example .env
nano .env # Set BASE_URL and PayPal credentials

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

# 4. Start with PM2 cluster mode
pm2 start ecosystem.config.js --env production
pm2 save
pm2 startup
```

---

### Option C: Cloud PaaS (Railway / Render / Fly.io)
- **Railway**: 
  1. Click **New Project** -> **Deploy from GitHub repo**.
  2. Add **MongoDB** plugin from Railway marketplace.
  3. Add environment variables: `MONGODB_URI=${{MongoDB.MONGO_URL}}`, `BASE_URL=https://${{RAILWAY_STATIC_URL}}`.
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
