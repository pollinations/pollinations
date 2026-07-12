# Observability Dashboard

Grafana OSS dashboard for Pollinations platform observability.

- **Public URL:** https://observability.pollinations.ai
- **Myceli origin:** https://observability.myceli.ai
- **Worker:** `myceli-observability-grafana`

## Architecture

```
Local:   Browser -> localhost:3000 -> Grafana -> Tinybird
Prod:    Browser -> observability.pollinations.ai -> Cloudflare Worker
         -> Grafana container -> Tinybird
Origin:  Browser -> observability.myceli.ai -> Cloudflare Worker
         -> Grafana container -> Tinybird
```

The Cloudflare Worker attaches both hostnames directly in the Myceli Cloudflare
account and routes them to one named Grafana container. A 5-minute cron keeps
the container awake so Grafana alert evaluation can run. Container disk is
ephemeral, so dashboards and alerting must stay provisioned from git.

## Quick Start

```bash
cd apps/operation/observability

# 1. Create .env with local secrets
cp /path/to/shared/.env .env

# 2. Start Grafana locally
docker compose up -d

# 3. Access Grafana
open http://localhost:3000
```

## Data Sources

### Tinybird (ClickHouse)
- **Host:** `clickhouse.europe-west2.gcp.tinybird.co`
- **Database:** `default` (workspace: `pollinations_enter`, production only)
- **Token:** `TINYBIRD_READ_TOKEN`
- **UID:** `PAD1A0A25CD30D456`

Staging traffic lives in a separate `pollinations_enter_staging` workspace. This
dashboard intentionally reads only production. For staging analytics, use a
staging read token against the staging workspace.

### Tinybird Stripe (ClickHouse)
- **Host:** `clickhouse.europe-west2.gcp.tinybird.co`
- **Database:** `default` (workspace: `pollinations_enter`, production only)
- **Token:** `TINYBIRD_READ_TOKEN`
- **UID:** `PAD1A0A25CD30D457`
- **Table:** `stripe_event`

### Tinybird Legacy (ClickHouse)
- **Host:** `clickhouse.europe-west2.gcp.tinybird.co`
- **Database:** `default` (workspace: `pollinations_ai`)
- **Token:** `TINYBIRD_LEGACY_READ_TOKEN`
- **UID:** `PAD1A0A25CD30D458`
- **Table:** `text_events`

## Secrets

Secrets are stored in `.env` locally and as Worker secrets in production.

| Variable | Purpose |
| --- | --- |
| `GF_ADMIN_PASSWORD` | Grafana admin password |
| `TINYBIRD_READ_TOKEN` | Read token for the `pollinations_enter` Tinybird workspace |
| `TINYBIRD_LEGACY_READ_TOKEN` | Read token for the legacy `pollinations_ai` workspace |
| `DISCORD_WEBHOOK_URL` | Discord webhook for alerts |

`CLOUDFLARE_TUNNEL_TOKEN` is only used by the legacy DigitalOcean deployment.

## Creating Panels

1. Open http://localhost:3000
2. Edit dashboard in the UI
3. Dashboard -> Settings -> JSON Model -> Copy
4. Replace `provisioning/dashboards/observability.json`
5. Restart to verify: `docker compose restart grafana`

## Cloudflare Deployment

```bash
cd apps/operation/observability
npm install

# Validate Worker config without building the image
npm run check

# Requires Docker locally so Wrangler can build and push the Grafana image.
# Secrets are pushed from secrets/secrets.vars.json via SOPS.
npm run deploy:production
```

Production deploys are wired through
`.github/workflows/deploy-operation-cloudflare.yml` on the `production` branch.
The workflow deploys the container Worker, pushes filtered Grafana secrets, and
checks both `/api/health` endpoints.

## DigitalOcean Deployment (Legacy)

The previous deployment ran Grafana on the `207.154.253.25` DigitalOcean droplet
behind Cloudflare Tunnel. Keep these commands only for rollback while the
Cloudflare container migration is being verified.

```bash
ssh root@207.154.253.25
cd /opt/pollinations/apps/operation/observability
docker compose -f docker-compose.prod.yml up -d
```

The legacy container bind-mounts:

- `/opt/pollinations/apps/operation/observability/provisioning` -> `/etc/grafana/provisioning`
- `grafana-data` -> `/var/lib/grafana`

## Common Commands

```bash
# Local
docker compose up -d
docker compose logs -f grafana
docker compose down

# Legacy DigitalOcean
docker compose -f docker-compose.prod.yml logs -f
docker compose -f docker-compose.prod.yml restart grafana

# Reset admin password
docker compose exec grafana grafana-cli admin reset-admin-password NEW_PASSWORD

# Test datasource health
curl -s -u admin:$GF_ADMIN_PASSWORD 'http://localhost:3000/api/datasources/uid/PAD1A0A25CD30D456/health'
```

## Troubleshooting

### Public URL redirects to the Myceli origin

Grafana should be configured with
`GF_SERVER_ROOT_URL=https://observability.pollinations.ai`. If redirects point at
`observability.myceli.ai`, update the Worker var or legacy `docker-compose.prod.yml`.

### Plugin health check failed
- Verify tokens are correct
- Check the container can reach Tinybird and Cloudflare APIs

### Dashboard not loading
- Check datasource UIDs match between dashboard JSON and provisioning
