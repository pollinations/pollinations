## Public Stats

Anonymous, read-only usage statistics served directly from Tinybird. No
account or API key required — pass the shared public read token as a query
parameter.

Base URL: https://api.europe-west2.gcp.tinybird.co

Public read token (safe to embed in client-side code):

```
p.eyJ1IjogImFjYTYzZjc5LThjNTYtNDhlNC05NWJjLWEyYmFjMTY0NmJkMyIsICJpZCI6ICI5ZWZmMGM3Ni1kOTZkLTQwYjgtYWQwOC1mNDFlMmRiYjBmYTIiLCAiaG9zdCI6ICJnY3AtZXVyb3BlLXdlc3QyIn0.6VnVkAQ5h_fkcDZVDUoU38dzTxaw0xo3DnmKkhECbA8
```

| Endpoint | Description |
|----------|-------------|
| `GET /v0/pipes/public_model_stats.json` | Per-model usage stats for the last 7 days |
| `GET /v0/pipes/model_health.json` | Per-model health (errors, latency) for a recent time window |

Every response is JSON with a `data` array of rows, a `meta` array describing
each column's name and type, and a `statistics` block. Append
`&token=<public-read-token>` to authenticate.

### Model usage stats

`GET /v0/pipes/public_model_stats.json`

Aggregated usage per model over the last 7 days (including today), excluding
cache hits. Only models with at least 3 successfully priced requests are
returned, so averages stay reliable.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `limit` | integer | 50 | Maximum number of models to return, ordered by request count |

| Column | Type | Description |
|--------|------|-------------|
| `model` | string | Requested model name |
| `request_count` | integer | Total requests (all statuses) |
| `avg_cost_usd` | number | Average USD cost of a successful priced request |
| `avg_response_ms` | number | Average response time of successful requests, in ms |
| `success_count` | integer | Requests with a 2xx status |
| `priced_success_count` | integer | Successful requests that were billed |
| `error_count` | integer | Requests with a 4xx or 5xx status |

```bash
curl "https://api.europe-west2.gcp.tinybird.co/v0/pipes/public_model_stats.json?limit=5&token=PUBLIC_READ_TOKEN"
```

```json
{
  "data": [
    {
      "model": "flux",
      "request_count": 2038796,
      "avg_cost_usd": 0.00175,
      "avg_response_ms": 2153,
      "success_count": 393196,
      "priced_success_count": 393188,
      "error_count": 1645600
    }
  ],
  "rows": 1
}
```

### Model health

`GET /v0/pipes/model_health.json`

Per-model request counts, error breakdowns, and latency percentiles over a
recent window — the data behind the model monitoring dashboards. Rows are
grouped by model and event type (e.g. `generate.text`, `generate.image`).

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `minutes` | integer | 60 | Size of the time window ending now, in minutes |

| Column | Type | Description |
|--------|------|-------------|
| `model` | string | Requested model name |
| `event_type` | string | Generation event type (`generate.text`, `generate.image`, …) |
| `provider` | string | Most common upstream provider used |
| `model_used` | string | Most common resolved upstream model |
| `total_requests` | integer | Total requests in the window |
| `status_2xx` | integer | Successful requests |
| `errors_4xx` | integer | Client errors |
| `errors_5xx` | integer | Server errors |
| `last_error_at` | datetime | Timestamp of the most recent 5xx (epoch zero if none) |
| `latency_p50_ms` | number | Median latency of successful requests, in ms |
| `latency_p95_ms` | number | 95th-percentile latency of successful requests, in ms |
| `avg_latency_ms` | number | Average latency of successful requests, in ms |
| `last_request_at` | datetime | Timestamp of the most recent request |

```bash
curl "https://api.europe-west2.gcp.tinybird.co/v0/pipes/model_health.json?minutes=60&token=PUBLIC_READ_TOKEN"
```

```json
{
  "data": [
    {
      "model": "gemini-fast",
      "event_type": "generate.text",
      "provider": "google",
      "model_used": "gemini-2.5-flash-lite",
      "total_requests": 5306,
      "status_2xx": 4179,
      "errors_4xx": 1127,
      "errors_5xx": 0,
      "latency_p50_ms": 1177,
      "latency_p95_ms": 2341,
      "avg_latency_ms": 1480,
      "last_request_at": "2026-06-18 01:28:59"
    }
  ],
  "rows": 1
}
```
