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

Live mode uses a password gate. The Tinybird read token lives only in
`secrets/web.json` and is exposed only to the local/production Worker, never to
the browser bundle.

Production deploys through `.github/workflows/deploy-operations-cloudflare.yml`
on the `production` branch. The workflow deploys the Worker with both custom
domains and verifies both session endpoints.

The OP Tinybird datasource and pipe definitions (`op_*`) live in
[`enter.pollinations.ai/observability/`](../../../enter.pollinations.ai/observability/).
