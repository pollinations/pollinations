# Observability Dashboard

Grafana OSS dashboard for Pollinations platform observability.

- **Public URL:** https://observability.pollinations.ai
- **Myceli origin:** https://observability.myceli.ai
- **Worker:** `myceli-observability-grafana`

## Architecture

```
Local:   Browser -> localhost:4000 -> Pollinations session gateway
         -> private Grafana at 127.0.0.1:4001
Prod:    Browser -> observability.pollinations.ai -> Cloudflare Worker
         -> private Grafana container (Auth Proxy) -> Tinybird
```

The Cloudflare Worker attaches both hostnames directly in the Myceli Cloudflare
account and routes them to one named Grafana container. A 5-minute cron keeps
the container awake so Grafana alert evaluation can run. Container disk is
ephemeral, so dashboards and alerting must stay provisioned from git.

## Quick Start

```bash
cd operations/observability

# 1. Install and build the shared UI
npm install
npm run build --prefix ../../packages/ui

# 2. Configure private Grafana and the approved app session secret
#    as described in the local-preview instructions below.

# 3. Start the shared login and Observability app
npm run dev
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

The local app signing secret is stored in ignored `.dev.vars`;
production uses Worker secrets. Legacy Docker Compose reads `.env`.
The public OAuth client ID is configured in `wrangler.toml`.

| Variable | Purpose |
| --- | --- |
| `POLLINATIONS_AUTH_SESSION_SECRET` | Signs the independent app session |
| `GF_ADMIN_PASSWORD` | Grafana bootstrap admin password (interactive login disabled) |
| `TINYBIRD_READ_TOKEN` | Read token for the `pollinations_enter` Tinybird workspace |
| `TINYBIRD_LEGACY_READ_TOKEN` | Read token for the legacy `pollinations_ai` workspace |
| `DISCORD_WEBHOOK_URL` | Discord webhook for alerts |

Observability uses the same Pollinations OAuth client/session implementation and
shared sign-in page as KPI and Economics. Its callback is
`https://observability.pollinations.ai/auth/callback`. The trusted internal
client requests `openid profile email`, uses PKCE and skips consent. Only
Pollinations admins receive an app session, valid for 12 hours. Admin status
is rechecked with Enter once per 60-second signed-cookie window, so demotion,
bans and token revocation deny access at the next check. Concurrent stale-cookie
checks are coalesced within each Worker. Enter outages return 503 without
clearing the app session; checks retry when connectivity returns. The identity token is encrypted inside the HttpOnly cookie.

The Worker checks the app session on every `/grafana/*` request, including
WebSocket handshakes. It removes incoming identity headers, authorization and
cookies, then sets the verified user ID and fixed Grafana `Editor` role.
Grafana is a private container behind this Worker, with Auth Proxy enabled and
`enable_login_token=false`. Basic, anonymous and Generic OAuth login are disabled.
Grafana stores user preferences, but issues no separate login cookie. The shared
Pollinations account menu owns sign-out; other apps and Enter stay signed in.
The dashboard is embedded same-origin under `/grafana/`, with external framing
blocked. Do not expose the container's port directly to the internet.

The Worker also requires its own `POLLINATIONS_AUTH_SESSION_SECRET`. Provisioning
it requires separate approval. Deploy Enter's updated callback registration first,
then the app through GitHub Actions. Verify admin/non-admin access, forged-header
rejection, iframe/WebSocket loading and independent logout before production.

For the local preview, run Grafana on `127.0.0.1:4001` with
`root_url=http://localhost:4000/grafana/` and `serve_from_sub_path=true`, using the
same Auth Proxy settings above. `npm run dev` serves the app at localhost:4000
using `wrangler.local.jsonc`; the proxy uses the same authentication handler as
production. Configure the approved signing secret in `.dev.vars` and
register `http://localhost:4000/auth/callback` in the local Enter database.
Never enable production data sources or alerts just to test local login.

`CLOUDFLARE_TUNNEL_TOKEN` is only used by the legacy DigitalOcean deployment.

## Creating Panels

1. Open http://localhost:3000
2. Edit dashboard in the UI
3. Dashboard -> Settings -> JSON Model -> Copy
4. Replace the matching JSON in `provisioning/dashboards/` (current) or `provisioning/dashboards/legacy/`
5. Restart to verify: `docker compose restart grafana`

## Cloudflare Deployment

```bash
cd operations/observability
npm install

# Validate Worker config and container image (requires Docker)
npm run check
```

Deploy production only through `.github/workflows/deploy-applications.yml`
from the `production` branch. Its secret synchronization requires separate,
scoped approval. The workflow checks the Pollinations `/api/health` endpoint.

## DigitalOcean Deployment (Legacy)

The previous deployment ran Grafana on the `207.154.253.25` DigitalOcean droplet
behind Cloudflare Tunnel. Keep these commands only for rollback while the
Cloudflare container migration is being verified.

```bash
ssh root@207.154.253.25
cd /opt/pollinations/operations/observability
docker compose -f docker-compose.prod.yml up -d
```

The legacy container bind-mounts:

- `/opt/pollinations/operations/observability/provisioning` -> `/etc/grafana/provisioning`
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
