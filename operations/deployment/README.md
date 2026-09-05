# Deployment

## Workflows

| Workflow | Target | Automatic trigger |
| --- | --- | --- |
| `deploy-applications.yml` | Repository applications | Relevant push to `production` |
| `deploy-cloudflare-production.yml` | `enter`, `gen` and `media.pollinations.ai` | Relevant push to `production` |
| `deploy-portkey-cloudflare.yml` | Portkey gateway | Relevant push to `production` |
| `deploy-website-cloudflare.yml` | `pollinations.ai` | Relevant push to `production` |

`deploy-cloudflare-production.yml` applies the shared D1 migrations once, then
deploys the three workers in parallel. Its `service` dispatch input targets a
single worker.

Application deployment is discovered from each app's `deploy.json`. All
applications deploy from `production`; `main` never deploys. Manual dispatch
accepts an application name or path and is also restricted to `production`.

## Single-endpoint registration cutover

This change is **not safe for automatic production promotion** until a real
maintenance gate and staging migration/rollback rehearsal are arranged. No gate
is implemented here. Migrate-first deployment exposes old workers to new
payloads; legacy writes can recreate unmigrated rows.

- Rehearse migration, verification, rollback, and retry on staging first.
- Gate affected generation and registration traffic, drain in-flight requests,
  and freeze registration writes before migrating. Keep the gate through verification.
- Privately snapshot only IDs and original endpoint fields:
  `base_url`, current `responsesUrl`, and pending `responsesUrl`, preserving
  absent/null distinctions. Do not export credentials, complete payloads, or the
  shared wallet database.
- Deploy Enter and Gen together through existing GitHub Actions from
  `production`. Verify worker versions, migrated registrations,
  catalog, streaming, and billing before reopening traffic.
- Roll back while writes remain frozen: restore only endpoint fields and remove
  the introduced `api` fields, then redeploy old code through Actions. Worker
  rollback [does not restore D1 data](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/).
  Never use [whole-database Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/)
  for registration rollback; it also rewinds wallet/auth changes.
- The migration remains marked applied after data restoration. Rehearse explicit
  repair/reapplication; rerunning deployment will not repeat it. After reopening
  writes, prefer forward repair.
