## Public Stats

Anonymous, read-only platform statistics served directly from Tinybird. No
account or API key needed — pass the shared public read token as a query param.

Base URL: `https://api.europe-west2.gcp.tinybird.co`

Public read token (safe to embed client-side):

```
p.eyJ1IjogImFjYTYzZjc5LThjNTYtNDhlNC05NWJjLWEyYmFjMTY0NmJkMyIsICJpZCI6ICI5ZWZmMGM3Ni1kOTZkLTQwYjgtYWQwOC1mNDFlMmRiYjBmYTIiLCAiaG9zdCI6ICJnY3AtZXVyb3BlLXdlc3QyIn0.6VnVkAQ5h_fkcDZVDUoU38dzTxaw0xo3DnmKkhECbA8
```

| Endpoint | Params | Returns |
|----------|--------|---------|
| `GET /v0/pipes/public_model_stats.json` | `limit` (50) | Per-model usage over the last 7 days: request count, avg cost, avg response time |
| `GET /v0/pipes/model_health.json` | `minutes` (60) | Per-model health in a recent window: 2xx/4xx/5xx counts, latency p50/p95 |
| `GET /v0/pipes/weekly_health_stats.json` | `weeks_back` (12) | Weekly service availability (`2xx / (2xx + 5xx)`, cache excluded) and latency |
| `GET /v0/pipes/app_top_weekly.json` | — | Top 10 registered apps owned by showcase contributors, by request count over the last 7 days. The owner is listed in the directory; the returned app may be any of their registered apps |
| `GET /v0/pipes/app_directory_public.json` | `category`, `platform`, `limit` (1000) | The community app directory ([apps/APPS.md](https://github.com/pollinations/pollinations/blob/main/apps/APPS.md)) |

Each response is JSON: a `data` array of rows plus a `meta` array typing each
column. Append `&token=<public-read-token>` to authenticate.

```bash
curl "https://api.europe-west2.gcp.tinybird.co/v0/pipes/public_model_stats.json?limit=5&token=PUBLIC_READ_TOKEN"
```
