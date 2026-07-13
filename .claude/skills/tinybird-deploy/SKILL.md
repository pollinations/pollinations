---
name: tinybird-deploy
description: "Deploy Tinybird pipes and datasources for enter.pollinations.ai observability with the Tinybird Forward CLI."
---

# Tinybird Deployment Skill

Deploy observability pipes and datasources to Tinybird Cloud.

## Requirements

- Use the **Tinybird Forward CLI** as `tb`. On this machine it should resolve to `~/.local/bin/tb` and support `tb --cloud deployment create --check`.
- Do **not** install or update this workflow with `pip install tinybird-cli`; that can put the Classic CLI first on PATH.
- If `tb --cloud` is missing, or Tinybird says this is a Forward workspace but the CLI is Classic, fix PATH so `~/.local/bin` wins. The Classic CLI is kept only as `tb-classic`.
- Run commands from `enter.pollinations.ai/observability`.
- Prefer explicit `TB_TOKEN` + `--host` on every deploy command. Do not rely on `.tinyb` or `tb workspace use` for workspace selection.

## Workspaces

Two workspaces, same region (`gcp-europe-west2`). Pipes and datasources must be kept in sync across both.

| Workspace | Receives traffic from | UI |
|-----------|-----------------------|----|
| `pollinations_enter` | production worker only | https://cloud.tinybird.co/gcp/europe-west2/pollinations_enter |
| `pollinations_enter_staging` | staging worker + dev worker + local `npm run dev` | https://cloud.tinybird.co/gcp/europe-west2/pollinations_enter_staging |

Workspace routing is token-scoped: same regional ingest URL, different Tinybird tokens per environment in `secrets/{prod,staging,dev}.vars.json`.

The local `.tinyb` is gitignored and must not be trusted for prod/staging selection. For staging, set `TB_TOKEN` from `secrets/staging.vars.json`. For prod, set `TB_TOKEN` from `secrets/prod.vars.json`. Keep tokens out of logs.

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

Set the region once per shell session:

```bash
TB_HOST="https://api.europe-west2.gcp.tinybird.co"
```

Load the staging sync token without printing it:

```bash
TB_TOKEN="$(SOPS_AGE_KEY=$(security find-generic-password -a "$USER" -s sops-age-key -w 2>/dev/null || true) \
  sops -d ../secrets/staging.vars.json | jq -r '.TINYBIRD_SYNC_TOKEN')"
export TB_TOKEN
```

## Step 1: Validate (Dry Run)

Always validate before deploying. This is safe to run against staging.

```bash
tb --cloud --host "$TB_HOST" deployment create --check --no-allow-destructive-operations
```

Example output:
```
| status   | name                  | type     | path                                 |
|----------|-----------------------|----------|--------------------------------------|
| modified | weekly_usage_stats    | endpoint | endpoints/weekly_usage_stats.pipe    |
```

## Step 2: Deploy

If validation passes, deploy to staging first. `deployment create --wait` creates a staging deployment and waits for it to be ready. It does not promote unless `--auto` is passed.

```bash
tb --cloud --host "$TB_HOST" deployment create --wait --no-allow-destructive-operations
```

Never pass `--auto` or run `deployment promote` unless the user explicitly asks for promotion.

Prod deploys use the same command shape with the prod token, but only after staging validation and verification. Deploying to both workspaces is still manual until #11127 is resolved.

## Step 3: Verify

Verify the staging deployment and test the deployed endpoints with the read token for the same workspace.

```bash
tb --staging --cloud --host "$TB_HOST" endpoint ls
tb --cloud --host "$TB_HOST" deployment ls

TINYBIRD_TOKEN="$(SOPS_AGE_KEY=$(security find-generic-password -a "$USER" -s sops-age-key -w 2>/dev/null || true) \
  sops -d ../secrets/staging.vars.json | jq -r '.TINYBIRD_READ_TOKEN')"
curl -s "https://api.europe-west2.gcp.tinybird.co/v0/pipes/weekly_usage_stats.json?weeks_back=12" \
  -H "Authorization: Bearer $TINYBIRD_TOKEN" | jq '.data | length'
```

For prod verification, swap `staging.vars.json` to `prod.vars.json` and do not use `--staging`.

---

# Safety Features

| Flag | Description |
|------|-------------|
| `--check` | Validates without making changes (dry run) |
| `--wait` | Waits for deployment to complete |
| `--no-allow-destructive-operations` | Prevents removing datasources (default) |
| `--allow-destructive-operations` | Required to delete datasources |
| `--auto` | Auto-promotes a ready deployment; do not use unless explicitly requested |

---

# Common Tasks

## Add a New Pipe

1. Create `.pipe` file in `endpoints/`
2. Validate against staging
3. Deploy to staging, verify, then prod only when requested

## Modify Existing Pipe

Same as above: edit, validate staging, deploy staging, verify, then prod only when requested.

## View Pipe in UI

- Prod: https://cloud.tinybird.co/gcp/europe-west2/pollinations_enter/pipes
- Staging: https://cloud.tinybird.co/gcp/europe-west2/pollinations_enter_staging/pipes

---

# Troubleshooting

## "tb: command not found"

Ensure `~/.local/bin` is on PATH, then open a new shell. Do not install the Classic CLI with `pip install tinybird-cli` for this workflow.

## "This is a Tinybird Forward workspace" / Classic CLI errors

```bash
which -a tb
tb --version
tb --help | rg "deployment"
```

`tb` should be the Forward CLI. If the first `tb` path is under `/Library/Frameworks/Python.framework/...`, PATH is wrong; use `~/.local/bin/tb` or fix PATH.

## Validation Reports Datasource or Pipe Deletion

Stop. Do not rerun with `--allow-destructive-operations`. Either restore the missing local definition from a staging pull in `temp/`, or ask the user before deleting anything.

## Pipe Timeout Issues

If a pipe times out with large `weeks_back`:
- Use `uniq()` instead of `uniqExact()` for user counts (~10x faster)
- Avoid CTE + JOIN patterns - use single-pass queries
- Consider materialized views for expensive aggregations

## Materialized View Validation Issues

- Forward materialized views cannot use `UNION`; split sources into separate materialized pipes that write to the same datasource.
- Validate with `deployment create --check`; older local checks are not enough.
- Query-time dedup can fail validation in some endpoint pipes. Prefer dedup in the materialization when possible.

---

# Important Notes

- **Always use `--cloud`**: Without it, CLI tries to use Tinybird Local.
- **Do NOT use `tb push`**: It is deprecated for this workflow.
- **Avoid `tb deploy`**: Use explicit `deployment create` commands so promotion is never accidental.
- **No destructive operations by default**: Never pass `--allow-destructive-operations` without explicit permission.
- **Run from observability directory**: Not from repo root.
