# Polar.sh (historical billing, read-only)

Status: **retired from runtime**.

Polar handled Pollen pack billing and free daily tier subscriptions before the
Stripe/D1 migration at the end of January 2026. New Polar customer and
subscription writes stopped on January 27, 2026; the remaining webhook and SDK
integration was removed on May 2, 2026.

Existing historical orders, customers, and subscriptions remain useful for
reconciliation. Old free subscriptions may also continue producing
Polar-internal lifecycle events until Polar archives or revokes them.

## Guardrails

- Use Polar only for read-only historical queries.
- Never add the Polar SDK, Worker bindings, webhooks, or subscription writes
  back to Pollinations services.
- Keep the access token in the local shell only. Do not store it in deployed
  Worker secrets or the repository's runtime SOPS files.
- Do not use `POST`, `PATCH`, or `DELETE` without explicit approval.

## Access

Create a read-only organization access token in the Polar organization
settings, then load it locally:

```bash
export POLAR_ACCESS_TOKEN="polar_oat_..."
export POLAR_ORG_ID="b3caa8b6-a64b-4c7c-94ad-03f70cc06841"
```

Never print the token. Unset it after the query session:

```bash
unset POLAR_ACCESS_TOKEN
```

## Quick queries

Organization:

```bash
curl -sSL "https://api.polar.sh/v1/organizations/" \
  -H "Authorization: Bearer $POLAR_ACCESS_TOKEN" \
  | jq '.items[] | {id, name}'
```

Historical products:

```bash
curl -sSL "https://api.polar.sh/v1/products/?organization_id=$POLAR_ORG_ID&limit=100" \
  -H "Authorization: Bearer $POLAR_ACCESS_TOKEN" \
  | jq '.items[] | {id, name, is_recurring}'
```

Recent orders and total count:

```bash
curl -sSL "https://api.polar.sh/v1/orders/?organization_id=$POLAR_ORG_ID&limit=100" \
  -H "Authorization: Bearer $POLAR_ACCESS_TOKEN" \
  | jq '{total: .pagination.total_count, orders: [.items[] | {id, created_at, paid, total_amount, currency}]}'
```

Historical monthly one-time revenue (currency values are returned in cents):

```bash
curl -sSL "https://api.polar.sh/v1/metrics/?organization_id=$POLAR_ORG_ID&start_date=2025-11-01&end_date=2026-01-31&interval=month&billing_type=one_time" \
  -H "Authorization: Bearer $POLAR_ACCESS_TOKEN" \
  | jq '{periods: [.periods[] | {timestamp, orders, revenue_usd: (.revenue / 100), net_revenue_usd: (.net_revenue / 100)}], totals: {orders: .totals.orders, revenue_usd: (.totals.revenue / 100), net_revenue_usd: (.totals.net_revenue / 100)}}'
```

Subscription status counts from the first page:

```bash
curl -sSL "https://api.polar.sh/v1/subscriptions/?organization_id=$POLAR_ORG_ID&limit=100" \
  -H "Authorization: Bearer $POLAR_ACCESS_TOKEN" \
  | jq '{total: .pagination.total_count, statuses: (.items | group_by(.status) | map({status: .[0].status, count: length}))}'
```

For totals spanning more than one page, paginate with Polar's current API
pagination fields rather than treating the first 100 rows as the full dataset.

## Reconciliation boundary

- Use Stripe/Tinybird for current revenue.
- Use Polar for historical pre-migration investigation.
- Check dates before summing both sources; the transition period can overlap.
- The retained `polar_event` Tinybird datasource is an archive, not a live
  integration.
