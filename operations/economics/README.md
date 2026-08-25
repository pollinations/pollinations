# Economics

Economics is Pollinations' private cash, runway, provider-cost, credit, and unit
economics app. Its Myceli origin is `economics.myceli.ai`, and it is also
available at `economics.pollinations.ai` through the same Cloudflare Worker.

Run locally from this directory:

```bash
npm run dev
```

The dev server is pinned to `127.0.0.1:4180`.

Use fixtures mode for UI development without password or Tinybird access:

```text
http://127.0.0.1:4180/?fixtures=1
```

Live mode uses a password gate. Local development reads the staging Tinybird
workspace through `secrets/web.dev.json`; production reads the production
workspace through `secrets/web.json`. The credentials are exposed only to the
Worker, never to the browser bundle.

Production deploys through `.github/workflows/deploy-applications.yml`
on the `production` branch. The workflow deploys the Worker with both custom
domains and verifies both session endpoints.

The OP Tinybird datasource and pipe definitions (`op_*`) live in
[`enter.pollinations.ai/observability/`](../../enter.pollinations.ai/observability/).

## Legacy runway retirement

`op_runway` and `op_runway_api` remain deployed only for the currently live
legacy Economics Worker. The current app derives runway mathematically from
`op_transactions_api`, `op_cloud_api`, checked balances, and the reviewed
calculation rules in `web/src/lib/forecastTerms.ts`. It does not read
`op_runway_api` or `op_forecast_api`.

Keep both legacy objects until all of the following are true:

1. the transaction and provider ledgers are present in production Tinybird;
2. all three current production pipes pass the Worker contract check;
3. the new Worker has been deployed and verified on both custom domains; and
4. rollback to the legacy Worker is no longer required.

Remove the legacy datasource and pipe only in a later, explicitly approved
destructive Tinybird deployment. Their removal is not part of the current app
promotion.

Before deploying the explicit `source=tombstone` filter in `op_cloud_api`, run
`ingest/scripts/prepare-op-cloud-tombstone-migration.py` against a fresh raw
`op_cloud` export, publish its reviewed corrections, and verify the effective
endpoint is unchanged. This data migration must precede the pipe deployment;
the old evidence-text filter currently hides legacy tombstones.
