# Observability Dashboard

Local Grafana OSS setup with Tinybird (ClickHouse) and Cloudflare D1 data sources, plus MCP server for AI tool integration.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Docker Compose                            │
│  ┌─────────────────────┐    ┌─────────────────────────────┐ │
│  │   grafana:3000      │    │      mcp-grafana            │ │
│  │   (Grafana OSS)     │◄───│   (MCP Server - stdio)      │ │
│  └─────────┬───────────┘    └─────────────────────────────┘ │
│            │                                                 │
└────────────┼─────────────────────────────────────────────────┘
             │
             ▼
    ┌────────────────┐          ┌────────────────┐
    │    Tinybird    │          │  Cloudflare D1 │
    │  (ClickHouse)  │          │  (Infinity)    │
    │  generation_   │          │                │
    │  event table   │          │                │
    └────────────────┘          └────────────────┘
```

## Quick Start

```bash
cd apps/observability-dashboard

# 1. Decrypt secrets and generate .env
sops -d secrets/secrets.vars.json | jq -r 'to_entries | .[] | select(.key != "sops") | "\(.key)=\(.value)"' > .env

# 2. Start Grafana
docker compose up -d

# 3. Access Grafana
open http://localhost:3000
# Login: see secrets/secrets.vars.json (decrypt with sops)
```

## Directory Structure

```
observability-dashboard/
├── docker-compose.yml          # Grafana + MCP server containers
├── .env                        # Generated from secrets (gitignored)
├── .gitignore
├── mcp-config.json             # MCP config template for IDE
├── secrets/
│   └── secrets.vars.json       # SOPS-encrypted credentials
└── provisioning/
    ├── datasources/
    │   └── datasources.yaml    # Auto-configured data sources
    └── dashboards/
        ├── dashboards.yaml     # Dashboard provisioning config
        └── overview.json       # Imported dashboard from Grafana Cloud
```

## Data Sources

### Tinybird (Default)

- **Type:** ClickHouse plugin (HTTP protocol)
- **Host:** `clickhouse.europe-west2.gcp.tinybird.co`
- **Database:** `default`
- **Username:** `pollinations_enter`
- **Token:** `TINYBIRD_GENERATION_EVENT_READ` (read-only token for generation_event)
- **UID:** `PAD1A0A25CD30D456`

**Querying Tinybird:**
```sql
SELECT * FROM generation_event LIMIT 10
```

### Cloudflare D1

- **Type:** Infinity plugin (REST API)
- **Auth:** Bearer token via `CLOUDFLARE_API_TOKEN`
- **UID:** `P33A123E5D474E8F3`

## Secrets Management

All secrets are SOPS-encrypted with age. The secrets file contains:

| Variable | Purpose |
|----------|---------|
| `GF_ADMIN_USER` | Grafana admin username |
| `GF_ADMIN_PASSWORD` | Grafana admin password |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account ID |
| `CLOUDFLARE_API_TOKEN` | Cloudflare API token for D1 |
| `CLOUDFLARE_D1_DATABASE_ID` | D1 database ID |
| `TINYBIRD_ACCESS_TOKEN` | General Tinybird token |
| `TINYBIRD_GENERATION_EVENT_READ` | Read token for generation_event |
| `GRAFANA_SERVICE_ACCOUNT_TOKEN` | For MCP server auth |

**Edit secrets:**
```bash
sops secrets/secrets.vars.json
```

**Regenerate .env after editing:**
```bash
sops -d secrets/secrets.vars.json | jq -r 'to_entries | .[] | select(.key != "sops") | "\(.key)=\(.value)"' > .env
docker compose restart
```

## Creating New Panels

### Option 1: Grafana UI (Recommended)

1. Open http://localhost:3000
2. Go to Dashboards → Overview (or create new)
3. Click "Add" → "Visualization"
4. Select data source: **Tinybird** or **D1**
5. Write your query and configure the panel
6. Save dashboard

### Option 2: Export and Commit

After creating panels in UI:
1. Dashboard → Settings → JSON Model → Copy
2. Replace `provisioning/dashboards/overview.json`
3. Restart to verify: `docker compose restart grafana`

### Tinybird Query Examples

**Events per hour:**
```sql
SELECT 
  toStartOfHour(timestamp) as hour,
  count() as events
FROM generation_event
WHERE timestamp > now() - INTERVAL 24 HOUR
GROUP BY hour
ORDER BY hour
```

**Events by model:**
```sql
SELECT 
  model,
  count() as count
FROM generation_event
WHERE timestamp > now() - INTERVAL 7 DAY
GROUP BY model
ORDER BY count DESC
```

## MCP Server Integration

The MCP server allows AI tools (Cursor, Windsurf, Claude) to interact with Grafana.

### Setup for Windsurf

Add to `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "grafana": {
      "command": "docker",
      "args": [
        "run", "--rm", "-i", "--network=host",
        "-e", "GRAFANA_URL=http://localhost:3000",
        "-e", "GRAFANA_SERVICE_ACCOUNT_TOKEN=<token-from-.env>",
        "grafana/mcp-grafana",
        "-t", "stdio"
      ]
    }
  }
}
```

### Available MCP Tools

| Tool | Description |
|------|-------------|
| `search_dashboards` | Search dashboards by name |
| `get_dashboard_by_uid` | Get full dashboard JSON |
| `list_datasources` | List all data sources |
| `query_prometheus` | Query Prometheus metrics |
| `query_loki_logs` | Query Loki logs |

## Common Commands

```bash
# Start everything
docker compose up -d

# View logs
docker logs grafana -f
docker logs mcp-grafana -f

# Restart after config changes
docker compose restart

# Stop everything
docker compose down

# Reset (delete all data)
docker compose down -v

# Test Tinybird connection
curl -s -u admin:$GF_ADMIN_PASSWORD 'http://localhost:3000/api/datasources/uid/PAD1A0A25CD30D456/health'

# Test D1 connection
curl -s -u admin:$GF_ADMIN_PASSWORD 'http://localhost:3000/api/datasources/uid/P33A123E5D474E8F3/health'
```

## Troubleshooting

### "Plugin health check failed"
- Check if Docker container can reach external hosts
- Verify tokens in `.env` are correct
- For Tinybird: ensure using HTTP protocol, not native

### "Invalid authentication token"
- Regenerate `.env` from secrets
- Restart containers: `docker compose restart`

### Dashboard not loading
- Check datasource UIDs match between dashboard JSON and provisioning
- Verify datasource health with curl commands above

### MCP server not connecting
- Ensure Grafana is running first
- Check `GRAFANA_SERVICE_ACCOUNT_TOKEN` is set
- Try: `docker logs mcp-grafana`

## Related Resources

- **Tinybird Workspace:** https://cloud.tinybird.co/gcp/europe-west2/pollinations_enter
- **Grafana Cloud (original):** Your Grafana Cloud instance
- **Tinybird Docs:** https://www.tinybird.co/docs/forward/work-with-data/publish-data/guides/connect-grafana
