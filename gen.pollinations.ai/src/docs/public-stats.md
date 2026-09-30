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
| `GET /v0/pipes/public_model_stats.json` | `limit` (50) | Per-model usage over the last 7 days: request count, typical (median) cost, avg response time |
| `GET https://gen.pollinations.ai/models/status` | `minutes` (60, max 10080) | Per-model and per-route health in a recent window: 2xx/4xx/5xx counts, fallback rescues, latency p50/p95. A 60-second edge cache in front of the `model_route_health` pipe; prefer it over calling Tinybird directly. |
| `GET /v0/pipes/weekly_health_stats.json` | `weeks_back` (12) | Weekly service availability (`2xx / (2xx + 5xx)`, cache excluded) and latency |
| `GET /v0/pipes/app_top_weekly.json` | `limit` (10) | Listed apps ranked by successful, billable BYOP requests over the rolling last 7 days. Matches registered App Keys to an unambiguous catalog URL under the same owner; excludes failed/unbilled requests and banned users. Returns catalog `app_url`, `app_name`, `owner`, `request_count`, and `last_seen` |
| `GET /v0/pipes/app_directory_public.json` | `category`, `platform`, `limit` (1000) | The community app directory ([app.json](https://github.com/pollinations/pollinations/blob/main/operations/app-management/app.json)) |

Tinybird responses are JSON: a `data` array of rows plus a `meta` array typing
each column. Append `&token=<public-read-token>` to authenticate them. The
model status gateway has the same response shape and does not require the
Tinybird token.

```bash
curl "https://api.europe-west2.gcp.tinybird.co/v0/pipes/public_model_stats.json?limit=5&token=PUBLIC_READ_TOKEN"
```
