# Economics Dashboard

Grafana OSS dashboard for Pollinations economic observability. Deployed at `economics.myceli.ai`.

## Architecture

```
Local:   Browser → localhost:3000 → Grafana → Tinybird/D1
Prod:    Browser → economics.myceli.ai → Cloudflare Tunnel → Grafana → Tinybird/D1
```

## Quick Start (Local)

```bash
cd apps/operation/economics

# 1. Create .env with secrets (get from team)
cp /path/to/shared/.env .env

# 2. Start Grafana
docker compose up -d

# 3. Access Grafana
open http://localhost:3000
```

## Data Sources

### Tinybird (ClickHouse)
- **Host:** `clickhouse.europe-west2.gcp.tinybird.co`
- **Database:** `default`
- **Token:** `TINYBIRD_GENERATION_EVENT_READ`
- **UID:** `PAD1A0A25CD30D456`

### Tinybird Legacy (ClickHouse)
- **Host:** `clickhouse.europe-west2.gcp.tinybird.co`
- **Database:** `default` (workspace: `pollinations_ai`)
- **Token:** `TINYBIRD_TEXT_EVENT_READ`
- **UID:** `PAD1A0A25CD30D458`
- **Table:** `text_events` — legacy API (Flux Z image, gpt-oss text)

### Cloudflare D1
- **Type:** Infinity plugin (REST API)
- **Auth:** Bearer token via `CLOUDFLARE_API_TOKEN`
- **UID:** `P33A123E5D474E8F3`

## Secrets Management

Secrets are stored in `.env` (gitignored) locally and on the production server.

| Variable | Purpose |
|----------|--------|
| `GF_ADMIN_USER` | Grafana admin username |
| `GF_ADMIN_PASSWORD` | Grafana admin password |
| `CLOUDFLARE_TUNNEL_TOKEN` | Cloudflare Tunnel token (prod) |
| `CLOUDFLARE_API_TOKEN` | Cloudflare API token for D1 |
| `TINYBIRD_GENERATION_EVENT_READ` | Read token for generation_event |
| `DISCORD_WEBHOOK_URL` | Discord webhook for alerts |

**Security:** `.env` is gitignored. Share secrets securely via 1Password or similar.

## Creating/Editing Panels

1. Open http://localhost:3000
2. Edit dashboard in UI
3. Dashboard → Settings → JSON Model → Copy
4. Replace `provisioning/dashboards/economics.json`
5. Restart to verify: `docker compose restart grafana`

## Production Deployment

### Prerequisites
- DigitalOcean Droplet (Ubuntu 24.04, $6/mo)
- Cloudflare Tunnel configured for `economics.myceli.ai`
- Droplet IP: `207.154.253.25`

### Architecture on Production

The Grafana container bind-mounts provisioning directly from the git repo:
- **Mount:** `/opt/pollinations/apps/operation/economics/provisioning` → `/etc/grafana/provisioning` (read-only)
- **Data volume:** `economics_grafana-data` → `/var/lib/grafana`

No intermediate copy step needed — just pull and restart.

### First Time Setup

```bash
ssh root@207.154.253.25

cd /opt
git clone https://github.com/pollinations/pollinations.git

# Create .env with secrets
cd /opt/pollinations/apps/operation/economics
nano .env  # Add GF_ADMIN_PASSWORD, TINYBIRD_*, CLOUDFLARE_* tokens

# Start
docker compose -f docker-compose.prod.yml up -d
```

### Update Dashboards (Most Common)

```bash
ssh root@207.154.253.25

# Pull latest code and restart
cd /opt/pollinations && git fetch origin && git reset --hard origin/main
docker restart economics-grafana
```

### One-Liner Deploy

```bash
ssh root@207.154.253.25 "cd /opt/pollinations && git fetch origin && git reset --hard origin/main && docker restart economics-grafana"
```

## Common Commands

```bash
# Local
docker compose up -d
docker compose logs -f grafana
docker compose down

# Production
docker compose -f docker-compose.prod.yml up -d
docker compose -f docker-compose.prod.yml logs -f
docker compose -f docker-compose.prod.yml restart grafana

# Reset admin password
docker compose exec grafana grafana-cli admin reset-admin-password NEW_PASSWORD

# Test datasource health
curl -s -u admin:$GF_ADMIN_PASSWORD 'http://localhost:3000/api/datasources/uid/PAD1A0A25CD30D456/health'
```

## Troubleshooting

### Plugin health check failed
- Verify tokens in `.env` are correct
- Check Docker container can reach external hosts

### Tunnel not connecting (prod)
```bash
docker compose -f docker-compose.prod.yml logs cloudflared
```

### Dashboard not loading
- Check datasource UIDs match between dashboard JSON and provisioning

## Resources

- **Dashboard:** https://economics.myceli.ai
- **Tinybird:** https://cloud.tinybird.co/gcp/europe-west2/pollinations_enter
