---
name: enter-services
description: "Deploy and manage enter.pollinations.ai text/image services on EC2 and Cloudflare Workers. Requires: sops, wrangler."
---

# Requirements

Before using this skill, ensure you have:
- **sops**: `brew install sops` (for decrypting secrets)
- **Wrangler**: `npm install -g wrangler`
- **Node.js**: `brew install node`

Must run from the `pollinations` repo root.

---

# Architecture Overview

| Environment | Gateway (Cloudflare Worker) | Text/Image Services (EC2) |
|-------------|----------------------------|---------------------------|
| **Production** | `enter.pollinations.ai` | Via Cloudflare Tunnel (ports 16384/16385) |
| **Staging** | `staging.enter.pollinations.ai` | `44.222.254.250` (ports 16384/16385) |

## Cloudflare Tunnel (Recommended)

Services are accessed via Cloudflare Tunnel for security:
- `text-internal.pollinations.ai` → localhost:16385
- `image-internal.pollinations.ai` → localhost:16384
- `deploy.pollinations.ai` → localhost:8787 (deploy webhook)

**Benefits:**
- No public ports exposed
- HTTPS encryption for all traffic
- No SSH keys needed for deployment
- Cloudflare Access for authentication

---

# SSH Configuration

Add to `~/.ssh/config`:
```
# Production instance
Host enter-services
  HostName 3.80.56.235
  User ubuntu
  IdentityFile ~/.ssh/enter-services-shared-key

# Staging instance
Host enter-services-staging
  HostName 44.222.254.250
  User ubuntu
  IdentityFile ~/.ssh/enter-services-staging-key
```

---

# Quick Commands

## Production

```bash
# Service status
ssh enter-services "sudo systemctl status text-pollinations.service image-pollinations.service"

# View logs (real-time)
ssh enter-services "sudo journalctl -u text-pollinations.service -f"
ssh enter-services "sudo journalctl -u image-pollinations.service -f"

# Restart services
ssh enter-services "sudo systemctl restart text-pollinations.service image-pollinations.service"

# Recent errors
ssh enter-services "sudo journalctl -u text-pollinations.service -p err -n 20"
```

## Staging

```bash
# Service status
ssh enter-services-staging "sudo systemctl status text-pollinations.service image-pollinations.service"

# View logs
ssh enter-services-staging "sudo journalctl -u text-pollinations.service -f"

# Restart
ssh enter-services-staging "sudo systemctl restart text-pollinations.service image-pollinations.service"
```

---

# Deploy to Production

## Via Cloudflare Tunnel (Recommended)

Deployments are triggered via webhook - no SSH required:

```bash
# From GitHub Actions or locally
curl -X POST "https://deploy.pollinations.ai" \
  -H "CF-Access-Client-Id: $CF_ACCESS_CLIENT_ID" \
  -H "CF-Access-Client-Secret: $CF_ACCESS_CLIENT_SECRET"
```

The GitHub workflow handles production deployments automatically on push to `production` branch.

## Via SSH (Legacy)

```bash
ssh enter-services "cd /home/ubuntu/pollinations && git pull origin production && \
  cd text.pollinations.ai && pnpm install && \
  cd ../image.pollinations.ai && pnpm install && \
  sudo systemctl restart text-pollinations.service image-pollinations.service"
```

---

# Deploy to Staging

## Full Setup (New Instance)

```bash
# 1. SSH into the new instance
ssh enter-services-staging

# 2. Install build tools (if needed)
sudo apt-get update && sudo apt-get install -y build-essential

# 3. Clone repo
git clone https://github.com/pollinations/pollinations.git
cd pollinations

# 4. Run setup script
bash enter.pollinations.ai/scripts/setup-services.sh /home/ubuntu/pollinations

# 5. From your LOCAL machine - decrypt and copy env files
cd /path/to/pollinations
sops --output-type dotenv -d text.pollinations.ai/secrets/env.json > /tmp/text.env
sops --output-type dotenv -d image.pollinations.ai/secrets/env.json > /tmp/image.env
scp /tmp/text.env enter-services-staging:/home/ubuntu/pollinations/text.pollinations.ai/.env
scp /tmp/image.env enter-services-staging:/home/ubuntu/pollinations/image.pollinations.ai/.env
rm /tmp/text.env /tmp/image.env

# 6. Restart services
ssh enter-services-staging "sudo systemctl restart text-pollinations.service image-pollinations.service"
```

## Update Staging

```bash
ssh enter-services-staging "cd /home/ubuntu/pollinations && git pull && cd text.pollinations.ai && npm install && cd ../image.pollinations.ai && npm install && sudo systemctl restart text-pollinations.service image-pollinations.service"
```

---

# Deploy Cloudflare Worker (enter.pollinations.ai)

```bash
cd enter.pollinations.ai

# Production
npm run deploy:production

# Staging
npm run deploy:staging
```

---

# Service Locations (on EC2)

- **Service definitions**: `/etc/systemd/system/`
- **Text service**: `/home/ubuntu/pollinations/text.pollinations.ai/`
- **Image service**: `/home/ubuntu/pollinations/image.pollinations.ai/`

---

# Wrangler Configuration

The `wrangler.toml` contains environment configs:

| Environment | Route | Service URLs |
|-------------|-------|--------------|
| `production` | `enter.pollinations.ai` | Production EC2 |
| `staging` | `staging.enter.pollinations.ai` | Staging EC2 |
| `local` | `localhost:3000` | Local dev |

---

# Troubleshooting

## Services won't start

```bash
# Check logs
ssh enter-services-staging "sudo journalctl -u text-pollinations.service -n 50"

# Check if .env exists
ssh enter-services-staging "ls -la /home/ubuntu/pollinations/text.pollinations.ai/.env"

# Check node/npm
ssh enter-services-staging "node -v && npm -v"
```

## Missing dependencies

```bash
ssh enter-services-staging "cd /home/ubuntu/pollinations/text.pollinations.ai && npm install"
```

## Need build tools

```bash
ssh enter-services-staging "sudo apt-get install -y build-essential"
```

---

# Cloudflare Tunnel Setup (New Instance)

```bash
# Run setup with tunnel flag
bash enter.pollinations.ai/scripts/setup-services.sh /home/ubuntu/pollinations --with-tunnel
```

This installs cloudflared and creates the deploy-webhook service. Follow the printed manual steps to:
1. Login to Cloudflare and create tunnel
2. Configure tunnel ingress rules
3. Create deploy token
4. Setup Cloudflare Access application and service token

---

# Notes

- **Production** deploys on push to `production` branch via webhook
- **Staging** deploys on push to `staging` branch
- Always test on staging before merging to production
- The Cloudflare Worker (enter.pollinations.ai) routes to EC2 via tunnel
- Text service: port 16385, Image service: port 16384
- Deploy webhook: port 8787 (localhost only, via tunnel)
