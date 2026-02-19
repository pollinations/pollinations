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

## Workspace Info

| Property | Value |
|----------|-------|
| Workspace | `pollinations_enter` |
| Region | `gcp-europe-west2` |
| UI | https://cloud.tinybird.co/gcp/europe-west2/pollinations_enter |

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

Always validate before deploying:

```bash
cd enter.pollinations.ai/observability
tb --cloud deploy --check --wait
```

This shows exactly what will change **without deploying**. Safe to run anytime.

Example output:
```
| status   | name                  | type     | path                                 |
|----------|-----------------------|----------|--------------------------------------|
| modified | weekly_usage_stats    | endpoint | endpoints/weekly_usage_stats.pipe    |
```

## Step 2: Deploy

If validation passes:

```bash
tb --cloud deploy --wait
```

## Step 3: Verify

Test the deployed pipe:

```bash
# Get Tinybird token from secrets
TINYBIRD_TOKEN=$(sops -d ../kpi/secrets/env.json | jq -r '.TINYBIRD_TOKEN')

# Test the pipe
curl -s "https://api.europe-west2.gcp.tinybird.co/v0/pipes/weekly_usage_stats.json?weeks_back=12" \
  -H "Authorization: Bearer $TINYBIRD_TOKEN" | jq '.data | length'
```

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
2. Validate: `tb --cloud deploy --check --wait`
3. Deploy: `tb --cloud deploy --wait`

## Modify Existing Pipe

1. Edit the `.pipe` file
2. Validate: `tb --cloud deploy --check --wait`
3. Deploy: `tb --cloud deploy --wait`

## View Pipe in UI

Open: https://cloud.tinybird.co/gcp/europe-west2/pollinations_enter/pipes

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
