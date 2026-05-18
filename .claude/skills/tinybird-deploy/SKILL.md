---
name: tinybird-deploy
description: "Deploy Tinybird pipes and datasources for enter.pollinations.ai observability. Validates and pushes changes to Tinybird Cloud."
---

# Tinybird Deployment Skill

Deploy observability pipes and datasources to Tinybird Cloud.

## Requirements

- **tb CLI**: Install with `curl -sSL https://tinybird.co | bash` or `pip install tinybird-cli`
- Must run from `enter.pollinations.ai/observability` directory
- Authenticated to Tinybird (run `tb login` if needed)

## Workspaces

Two workspaces, same region (`gcp-europe-west2`). Pipes and datasources must be kept in sync across both.

| Workspace | Receives traffic from | UI |
|-----------|-----------------------|----|
| `pollinations_enter` | production worker only | https://cloud.tinybird.co/gcp/europe-west2/pollinations_enter |
| `pollinations_enter_staging` | staging worker + dev worker + local `npm run dev` | https://cloud.tinybird.co/gcp/europe-west2/pollinations_enter_staging |

Workspace routing is purely **token-scoped** — same regional ingest URL, different `TINYBIRD_INGEST_TOKEN` per environment (set in `secrets/{prod,staging,dev}.vars.json`).

The local `.tinyb` is gitignored and points to the prod workspace by default. To target the staging workspace, set `TB_TOKEN` to a staging admin token for any single command (don't run `tb workspace use` — it tends to fail; the env var is the reliable override).

## Directory Structure

```
enter.pollinations.ai/observability/
├── datasources/       # Data source definitions (.datasource)
│   ├── generation_event.datasource
│   ├── polar_event.datasource
│   ├── stripe_event.datasource
│   └── ...
└── endpoints/         # Pipe definitions (.pipe)
    ├── weekly_usage_stats.pipe
    ├── weekly_active_users.pipe
    ├── daily_stripe_revenue.pipe
    └── ...
```

---

# Commands

## Step 1: Validate (Dry Run)

Always validate before deploying. Dry-run is safe to run anytime against either workspace.

```bash
cd enter.pollinations.ai/observability

# Against prod workspace (default — uses local .tinyb token)
tb --cloud deploy --check --wait

# Against staging workspace
TB_TOKEN=<staging_admin_token> tb --cloud deploy --check --wait
```

Example output:
```
| status   | name                  | type     | path                                 |
|----------|-----------------------|----------|--------------------------------------|
| modified | weekly_usage_stats    | endpoint | endpoints/weekly_usage_stats.pipe    |
```

## Step 2: Deploy

If validation passes, deploy to **both** workspaces. Recommended order: staging first, then prod — if staging breaks you catch it before touching prod.

```bash
# 1. Deploy to staging first
TB_TOKEN=<staging_admin_token> tb --cloud deploy --wait

# 2. Verify behavior on staging (e.g. curl a pipe via staging read token)

# 3. Deploy to prod
tb --cloud deploy --wait
```

> Skipping the staging step is a known drift vector — see issue #11127 for the planned CI auto-deploy that will enforce this.

## Step 3: Verify

Test the deployed pipe. Use the read token for whichever workspace you deployed to.

```bash
# Prod read token (decrypted from sops-encrypted prod secrets)
TINYBIRD_TOKEN=$(SOPS_AGE_KEY=$(security find-generic-password -a "$USER" -s sops-age-key -w) \
  sops -d ../secrets/prod.vars.json | jq -r '.TINYBIRD_READ_TOKEN')

# Test the pipe
curl -s "https://api.europe-west2.gcp.tinybird.co/v0/pipes/weekly_usage_stats.json?weeks_back=12" \
  -H "Authorization: Bearer $TINYBIRD_TOKEN" | jq '.data | length'
```

For staging, swap `prod.vars.json` → `staging.vars.json`.

---

# Safety Features

| Flag | Description |
|------|-------------|
| `--check` | Validates without making changes (dry run) |
| `--wait` | Waits for deployment to complete |
| `--no-allow-destructive-operations` | Prevents removing datasources (default) |
| `--allow-destructive-operations` | Required to delete datasources |

---

# Common Tasks

## Add a New Pipe

1. Create `.pipe` file in `endpoints/`
2. Validate against both workspaces (or at least staging)
3. Deploy to staging, verify, then prod (see Step 2 above)

## Modify Existing Pipe

Same as above — edit, validate against both, deploy staging then prod.

## View Pipe in UI

- Prod: https://cloud.tinybird.co/gcp/europe-west2/pollinations_enter/pipes
- Staging: https://cloud.tinybird.co/gcp/europe-west2/pollinations_enter_staging/pipes

---

# Troubleshooting

## "tb: command not found"

```bash
curl -sSL https://tinybird.co | bash
# Or
pip install tinybird-cli
```

## "Not authenticated"

```bash
tb login
# Follow prompts to authenticate
```

## Pipe Timeout Issues

If a pipe times out with large `weeks_back`:
- Use `uniq()` instead of `uniqExact()` for user counts (~10x faster)
- Avoid CTE + JOIN patterns - use single-pass queries
- Consider materialized views for expensive aggregations

---

# Important Notes

- **Always use `--cloud`**: Without it, CLI tries to use Tinybird Local (Docker)
- **Do NOT use `tb push`**: It's deprecated, use `tb --cloud deploy`
- **Run from observability directory**: Not from repo root
