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
cp .env.example .env
# Edit .env with your API tokens
npm run dev
```

## Environment Variables

```
VITE_TINYBIRD_API=https://api.tinybird.co
VITE_TINYBIRD_TOKEN=your_tinybird_token
VITE_ENTER_API=https://enter.pollinations.ai
VITE_POLAR_API=https://api.polar.sh
VITE_POLAR_TOKEN=your_polar_token
```

## TODO

- [ ] Create Tinybird pipes for weekly aggregations
- [ ] Add D1 API endpoints for registration/activation metrics
- [ ] Integrate Polar API for real revenue data
- [ ] Add auth protection (admin-only)
- [ ] Track GitHub star history over time
