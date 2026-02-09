# Economics Dashboard

Grafana OSS dashboard for Pollinations economic observability. Deployed at `economics.myceli.ai`.

## Architecture

```
Local:   Browser → localhost:3000 → Grafana → Tinybird/D1
Prod:    Browser → economics.myceli.ai → Cloudflare Tunnel → Grafana → Tinybird/D1
```

**Production server:** DigitalOcean Droplet `207.154.253.25`

The Grafana container mounts `provisioning/` directly from the git checkout at `/opt/pollinations/apps/operation/economics/`. No copy steps needed — `git pull` + `docker restart` is all it takes.

## Deploy to Production

**One-liner (copy-paste this):**

```bash
ssh root@207.154.253.25 "cd /opt/pollinations && git fetch origin && git reset --hard origin/main && docker restart economics-grafana"
```

That's it. The container volume-mounts the provisioning dir from the git repo, so pulling new code is enough.

**To deploy a branch instead of main:**

```bash
ssh root@207.154.253.25 "cd /opt/pollinations && git fetch origin && git checkout BRANCH_NAME && git reset --hard origin/BRANCH_NAME && docker restart economics-grafana"
```

**Verify it worked:**

```bash
ssh root@207.154.253.25 "docker logs economics-grafana --tail 5"
```

## Local Development

```bash
cd apps/operation/economics

# 1. Create .env with secrets (get from team)
cp /path/to/shared/.env .env

# 2. Start Grafana
docker compose up -d

# 3. Access at http://localhost:3000
```

### Editing Dashboards

1. Edit dashboard in Grafana UI at http://localhost:3000
2. Dashboard → Settings → JSON Model → Copy
3. Paste into the matching file in `provisioning/dashboards/`
4. Restart to verify: `docker compose restart grafana`

## Data Sources

| Source | Type | UID |
|--------|------|-----|
| Tinybird (ClickHouse) | `grafana-clickhouse-datasource` | `PAD1A0A25CD30D456` |
| Cloudflare D1 | Infinity plugin (REST) | `P33A123E5D474E8F3` |

## Secrets

Stored in `.env` (gitignored) — both locally and on the server at `/opt/pollinations/apps/operation/economics/.env`.

| Variable | Purpose |
|----------|---------|
| `GF_ADMIN_USER` | Grafana admin username |
| `GF_ADMIN_PASSWORD` | Grafana admin password |
| `CLOUDFLARE_TUNNEL_TOKEN` | Cloudflare Tunnel token (prod) |
| `CLOUDFLARE_API_TOKEN` | Cloudflare API token for D1 |
| `TINYBIRD_GENERATION_EVENT_READ` | Read token for generation_event |
| `DISCORD_WEBHOOK_URL` | Discord webhook for alerts |

## First Time Server Setup

Only needed if rebuilding the droplet from scratch.

```bash
ssh root@207.154.253.25

# Clone repo
cd /opt && git clone https://github.com/pollinations/pollinations.git

# Create .env with secrets
cd /opt/pollinations/apps/operation/economics
nano .env  # Add GF_ADMIN_PASSWORD, TINYBIRD_*, CLOUDFLARE_* tokens

# Start Grafana + Cloudflare Tunnel
docker compose -f docker-compose.prod.yml up -d
```

## Troubleshooting

```bash
# Check Grafana logs
ssh root@207.154.253.25 "docker logs economics-grafana --tail 20"

# Check tunnel
ssh root@207.154.253.25 "docker logs economics-tunnel --tail 20"

# Reset admin password
ssh root@207.154.253.25 "docker exec economics-grafana grafana-cli admin reset-admin-password NEW_PASSWORD"
```

## Resources

- **Dashboard:** https://economics.myceli.ai
- **Tinybird:** https://cloud.tinybird.co/gcp/europe-west2/pollinations_enter
