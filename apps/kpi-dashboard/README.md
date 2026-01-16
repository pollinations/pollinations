# pollinations.ai KPI Dashboard

Weekly KPI dashboard for pollinations.ai — the AI platform by Myceli.AI.

## KPIs Tracked

### 1. Acquisition

- New customer registrations
- Activated customers (D7)
- GitHub stars

### 2. Activation & Usage

- Weekly Active Users (WAU)
- Token usage
- Usage per active customer

### 3. Revenue

- Pack purchases
- Gross revenue (USD)
- ARPA (weekly)

### 4. Retention

- D7 retention
- W4 retention (cohort-based)

### 5. North Star

- **Weekly Active Paying Customers (WAPC)**

## Data Sources

| Source          | Data                            |
| --------------- | ------------------------------- |
| Tinybird        | Usage events, tokens, WAU       |
| D1 (Cloudflare) | User registrations, activations |
| Polar           | Revenue, pack purchases         |
| GitHub API      | Stars, forks                    |

## Setup

```bash
cd apps/kpi-dashboard
npm install

# Load secrets (requires SOPS + age key)
./scripts/load-secrets.sh

# Run locally
npm run dev
```

## Deployment

```bash
npm run deploy  # Deploys to kpi.myceli.ai
```

## Secrets Management

Secrets are SOPS-encrypted in `secrets/env.json`. To update:

```bash
sops secrets/env.json  # Edit encrypted file
./scripts/load-secrets.sh  # Decrypt to .dev.vars for local dev
```

## TODO

- [x] Create Tinybird pipes for weekly aggregations
- [x] Add D1 API endpoints for registration/activation metrics
- [x] Integrate Polar API for real revenue data
- [ ] Track GitHub star history over time
- [ ] Real activation tracking (D1 + Tinybird cross-reference)
