---
name: tinybird-deploy
description: "Deploy Tinybird pipes and datasources for enter.pollinations.ai observability. Validates and pushes changes to Tinybird Cloud."
---

# Tinybird Deployment Skill

Deploy observability pipes and datasources to Tinybird Cloud.

## Requirements

- **tb CLI**: Install with `curl -sSL https://tinybird.co | bash` or `pip install tinybird-cli`
- Use `npm run tinybird:* --workspace pollinations-enter` from the repo root, or run `enter.pollinations.ai/scripts/tinybird-deploy.sh` directly
- Gitignored Tinybird CLI config files exist for both workspaces: `enter.pollinations.ai/observability/.tinyb.staging` for staging and `enter.pollinations.ai/observability/.tinyb` for production

## Workspaces

Two workspaces, same region (`gcp-europe-west2`). Pipes and datasources must be kept in sync across both.

| Workspace | Receives traffic from | UI |
|-----------|-----------------------|----|
| `pollinations_enter` | production worker only | https://cloud.tinybird.co/gcp/europe-west2/pollinations_enter |
| `pollinations_enter_staging` | staging worker + dev worker + local `npm run dev` | https://cloud.tinybird.co/gcp/europe-west2/pollinations_enter_staging |

Worker ingest routing is purely **token-scoped** — same regional ingest URL, different `TINYBIRD_INGEST_TOKEN` per environment (set in `secrets/{prod,staging,dev}.vars.json`).

Deploy routing is also explicit and token-scoped. Use the same helper for both workspaces; it reads the matching gitignored Tinybird CLI config file, validates the workspace name, sets `TB_TOKEN`, and runs `tb --cloud deploy`. Do not run raw `tb --cloud deploy` from a local `.tinyb` whose workspace has not been checked.

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
# Against staging workspace
npm run tinybird:check:staging --workspace pollinations-enter

# Against production workspace
npm run tinybird:check:production --workspace pollinations-enter
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
npm run tinybird:deploy:staging --workspace pollinations-enter

# 2. Verify behavior on staging (e.g. curl a pipe via staging read token)

# 3. Deploy to prod
npm run tinybird:deploy:production --workspace pollinations-enter
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

## "Missing Tinybird config file"

```bash
# Create the matching ignored config from the team-managed deploy credential.
enter.pollinations.ai/observability/.tinyb.staging
enter.pollinations.ai/observability/.tinyb
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
- **Use the helper**: It runs from the observability directory internally and keeps staging/production token handling identical
