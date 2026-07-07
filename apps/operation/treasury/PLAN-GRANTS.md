# PLAN — `grants` datasource + pipe

Credit start points per vendor, as raw facts. No `left`, no derived numbers —
the table records what was granted, when, in what currency. Burn and remaining
stay where they already live (provider_monthly + future insight lens, out of
scope here).

## 1. Datasource — `grants.datasource`

One row per grant (a vendor can hold several: fireworks has one per account,
azure one per lot). Append-only; corrections append a newer row for the same
grant, readers take the latest.

```
TOKEN "treasury_ingest" APPEND
TOKEN "treasury_ingest" READ

SCHEMA >
    `vendor` String            `json:$.vendor`,
    `label` String             `json:$.label`,        -- distinguishes multiple grants per vendor ("pollinations acct", "lot 2"); "" if single
    `granted` Float64          `json:$.granted`,
    `currency` String          `json:$.currency`,
    `start_date` Date          `json:$.start_date`,
    `expires` Date             `json:$.expires`,      -- 1970-01-01 = no expiry
    `recorded_at` DateTime     `json:$.recorded_at`   -- append timestamp; latest wins per (vendor, label)

ENGINE "MergeTree"
ENGINE_SORTING_KEY "vendor, label, recorded_at"
```

## 2. Pipe — `grants_api.pipe`

Mirror of the raw columns, latest row per (vendor, label):

```
TOKEN "treasury_web" READ

NODE endpoint
SQL >
    SELECT
        vendor, label, granted, currency,
        formatDateTime(start_date, '%F') AS start_date,
        formatDateTime(expires, '%F') AS expires
    FROM grants
    QUALIFY row_number() OVER (PARTITION BY vendor, label ORDER BY recorded_at DESC) = 1
    ORDER BY vendor, start_date
```

(If QUALIFY is unavailable on our plan, same result via argMax grouping.)

## 3. CLI — `ingest.record grant`

```
python3 -m ingest.record grant lambda --granted 7500 --currency USD \
    --start 2026-03-30 [--label ""] [--expires YYYY-MM-DD]
```

Validation: vendor ∈ registry.CANONICAL, granted > 0, dates ISO. Appends one
row with recorded_at = now. Same Events API path as `record provider`.

## 4. Deploy

From `apps/operation/forager/tinybird`, operations workspace (same as
deploys #34/#40): `tb --cloud deploy --check --wait` then
`tb --cloud deploy --wait`. Purely additive — new datasource + new pipe,
nothing existing is touched.

## 5. Seeds (via CLI after deploy — data lives in Tinybird, not in git)

Known precisely today: lambda 7,500 USD (start ≈2026-03-30) · openrouter
3,000 USD (≈2026-05-01) · azure 250,036 USD (2026-04-06 → 2028-04-06) ·
azure lot 1 100,000 USD (2025-09-19 → 2025-12-15, expired unused) ·
fireworks 4 × 10,000 USD (one per account, labels) · elevenlabs 3,300 USD
(2026-02-01 → 2026-04-30, "3 months free") · aws Bedrock credit EUR
(remaining 24,295 EUR known; granted amount TBD Elliot) · digitalocean
(granted TBD, expires 2026-07-22) · modal / perplexity / airforce / google
(granted TBD Elliot).

## 6. Out of scope (later, separate)

- RAW "grants" tab in the web app (mirror of grants_api)
- Insight lens (remaining derived from provider credit burn, runway, drift)

## 7. Verify

`tb` deployment output; readback via `ingest.inspect grants` (add `grants` to
the inspect TABLES map); seeds visible through grants_api with the web token.
