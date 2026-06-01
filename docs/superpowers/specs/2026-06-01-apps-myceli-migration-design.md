# Apps → Myceli migration design

**Date:** 2026-06-01
**Status:** Design — pending user review
**Owner:** Elliot

## Goal

Move the community apps in `apps/` from the **old Pollinations** Cloudflare account
(`efdcb0933eaac64f27c0b295039b28f2`) to the **Myceli** account
(`b6ec751c0862027ba269faf7029b2501`), keeping their public URLs unchanged
(`<app>.pollinations.ai`). This continues the account decommissioning: the old
account ends as a DNS-zone + thin-proxy shell only.

## Scope

- **In scope:** the 14 apps in `apps/apps.json` (`react`, `catgpt`,
  `ai-dungeon-master`, `sirius-cybernetics-elevator-challenge`, `map-to-isometric`,
  `product-packaging-designer`, `virtual-makeup`, `opposite-prompt-generator`,
  `chat`, `model-monitor`, `changelog-generator`, `gsoc`, `openclaw`,
  `slidepainter`).
- **Out of scope:** `websim` and `operation`/`kpi` — handled separately, and not
  present in `apps.json`, so they are excluded automatically.
- **Non-goal:** changing any public URL. Every app stays at `<app>.pollinations.ai`.

## Current state (old account)

Apps auto-deploy on push to `main` touching `apps/**`:

1. `.github/workflows/app-deploy-automatic.yml` detects the changed app, checks it
   exists in `apps.json`, then runs `./apps/_scripts/deploy.sh <app>` with old-account
   secrets `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID`.
2. `deploy.sh` builds the app and calls `deploy-app.js`.
3. `deploy-app.js` (old account): creates Pages project `apps-<sub>`, adds Pages
   **custom domain** `<sub>.pollinations.ai`, creates a **proxied DNS CNAME**
   `<sub>` → `apps-<sub>.pages.dev` in the `pollinations.ai` zone
   (`0942247b74a58e4fc5ea70341a3754a3`).
4. `deploy.sh` then `wrangler pages deploy <outputDir> --project-name=apps-<sub>
   --branch=production`.

So today each app is served directly by an old-account Pages project via its own
`<sub>.pollinations.ai` Pages custom domain.

## Target architecture

```text
Browser → <app>.pollinations.ai          (old account: pollinations.ai zone)
        → pollinations-proxy worker       (custom domain per app, generated from apps.json)
        → <app>.myceli.ai                  (Myceli: apps-<app> Pages project, custom domain)
```

`apps.json` is the **single source of truth**, and validation happens at
**provisioning time, not request time**:

1. **Routing is the allowlist.** Each app gets one `custom_domain` on the proxy worker,
   provisioned per-app by the existing deploy pipeline (driven by `apps.json`). Only
   those exact hostnames (plus the core services) ever reach the proxy — every other
   subdomain is untouched. Because the deploy pipeline only runs for apps in `apps.json`,
   the set of proxy custom domains *is* the `apps.json` allowlist.
2. **Forwarding is a generic transform.** The proxy maps the explicit core services
   first (`pollinations.ai`/`enter`/`gen`/`media`), else forwards `<sub>.pollinations.ai
   → <sub>.myceli.ai`. No embedded app list, so adding an app never requires a proxy
   code change or redeploy — the new custom domain is all that's needed.

This mirrors the existing `enter`/`gen`/`media`/apex custom-domain pattern in
`pollinations-myceli-proxy/wrangler.toml`. No wildcard route, so no risk of
hijacking non-app subdomains, and **no DNS inventory required**.

## Naming conventions

**No new Workers are created by this migration.** The only worker involved is the
existing proxy, and the apps stay as Cloudflare **Pages** projects (they're static —
no reason to convert them to Workers-with-assets like the website).

| Resource | Name | Account | Notes |
| --- | --- | --- | --- |
| App Pages project | `apps-<subdomain>` | Myceli | Unchanged convention (`deploy.sh`/`deploy-app.js` already use it); recreated in Myceli |
| App origin custom domain | `<subdomain>.myceli.ai` | Myceli | On the `apps-<subdomain>` Pages project |
| App public custom domain | `<subdomain>.pollinations.ai` | old (proxy) | On the existing proxy worker; URL users see — unchanged |
| Proxy worker | `pollinations-proxy` (`-staging`, `-dev`) | old | Existing; gains per-app custom domains |

`<subdomain>` is the `subdomain` field in `apps.json` (e.g. `catgpt` →
`apps-catgpt` Pages project, `catgpt.myceli.ai` origin, `catgpt.pollinations.ai`
public).

## Components & changes

### 1. App deploy → Myceli (`deploy-app.js`, `deploy.sh`, workflow)

- `deploy-app.js`:
  - `CLOUDFLARE_ZONE_ID` → the **myceli.ai** zone id (replaces the hardcoded
    `pollinations.ai` zone).
  - Custom domain and DNS CNAME → `<sub>.myceli.ai` (not `.pollinations.ai`).
  - Account → Myceli (via the Myceli token/account env).
- `deploy.sh`: final "Deployed:" URL string updated to `<app>.myceli.ai` (cosmetic);
  `wrangler pages deploy` unchanged (project `apps-<sub>`, branch `production`) but
  now runs against the Myceli account.
- `app-deploy-automatic.yml`: swap secrets to `CLOUDFLARE_API_TOKEN_MYCELI` /
  `CLOUDFLARE_ACCOUNT_ID_MYCELI` (same names already used by the website workflow).

Result: app builds publish to Myceli Pages and are reachable at `<app>.myceli.ai`.

### 2. Proxy forwarding (`pollinations-myceli-proxy/src/index.ts`)

- Generalize `lookupUpstream`:
  1. exact match against the explicit core map (`pollinations.ai`, `enter`, `gen`,
     `media`) — unchanged;
  2. else if `host` matches `<sub>.pollinations.ai` → `<sub>.myceli.ai`;
  3. else `undefined` (→ existing 502).
- No embedded app list. The custom-domain set (provisioned per-app, see §3) is the gate,
  so the proxy code never changes when apps are added.
- All existing proxy behavior (WS upgrade pass-through, SSE/streaming header stripping,
  `X-Forwarded-*`, Host override) is unchanged and already correct for app traffic.

### 3. Routing provisioning — reuse the existing per-app deploy (`deploy-app.js`)

The steady-state sync already exists: `app-deploy-automatic.yml` → `deploy.sh` →
`deploy-app.js` runs per app on every `apps/**` push and **already provisions routing
idempotently** (today: a Pages custom domain + DNS CNAME). We extend that same run
rather than add a new workflow.

`deploy-app.js` becomes cross-account in one pass:

- **Myceli (origin):** create/ensure the `apps-<sub>` Pages project, the
  `<sub>.myceli.ai` custom domain, and the `myceli.ai` DNS CNAME — using
  `*_MYCELI` creds.
- **Old account (public):** ensure `<sub>.pollinations.ai` is a custom domain on the
  `pollinations-proxy` worker — using the old-account `CLOUDFLARE_API_TOKEN` /
  `CLOUDFLARE_ACCOUNT_ID` creds.

Both credential sets already live in CI (old-account creds power this workflow today;
`*_MYCELI` power the website workflow), so **no new secret types and no new workflow**.
Adding a future app to `apps.json` therefore wires up its public URL automatically,
with no proxy redeploy (forwarding is generic; §2).

One behavior to confirm in staging first: whether a later `wrangler deploy` of the
proxy prunes proxy custom domains added via the API. Worker **routes** are overridden
by config on deploy, but **Custom Domains** are a separate resource type and the docs
don't state pruning behavior. If staging shows pruning, the fallback is to generate the
full custom-domain set (core + apps from `apps.json`) into the proxy config at deploy
time so every proxy deploy is complete. See Risks.

## Cutover plan (per app, reversible)

Do one app first end-to-end (recommend `catgpt` — static, `buildCommand: null`),
verify, then batch the rest. Per app, the extended `deploy-app.js` does steps 1–3 in
one pass; the **reclaim (step 2) must run before step 3** because a hostname can be
claimed by only one project/worker per account:

1. **Origin (Myceli):** create/ensure `apps-<app>`, the `<app>.myceli.ai` custom
   domain, and the `myceli.ai` DNS CNAME; verify `https://<app>.myceli.ai` serves.
2. **Reclaim (old account):** remove the `<app>.pollinations.ai` custom domain from the
   old-account `apps-<app>` Pages project, and remove/replace the old proxied CNAME if
   it conflicts with attaching the proxy custom domain.
3. **Public (old account):** add `<app>.pollinations.ai` as a custom domain on the
   `pollinations-proxy` worker. No proxy code change/redeploy (forwarding is generic).
4. **Verify:** `https://<app>.pollinations.ai` serves from Myceli (compare body/headers
   to `<app>.myceli.ai`); check any app that uses streaming/WS (e.g. `chat`,
   `model-monitor`).

## Rollback

Per app, before old cleanup: remove `<app>.pollinations.ai` from the proxy worker, then
re-add it as a custom domain on the old-account `apps-<app>` Pages project (and restore
the proxied CNAME). Because the old Pages project and its content stay intact until the
final cleanup step, rollback is a domain re-attach, not a redeploy.

## Post-migration cleanup (after all apps stable, ~1 day)

- Delete the old-account `apps-*` Pages projects (rollback targets — remove last).
- Remove any now-orphaned `<app>` CNAMEs in the `pollinations.ai` zone superseded by
  the proxy custom domains.
- (Tracked separately from this spec: delete old-account `pollinations-ai` worker +
  `hello.pollinations.ai`, from the website migration.)

## Risks / pre-implementation verifications

- **Custom-domain reconciliation (load-bearing):** app custom domains are added to the
  proxy via the API, while core routes live in `wrangler.toml`. Worker **routes** are
  overridden by config on `wrangler deploy` (confirmed in CF docs); whether **Custom
  Domains** are pruned is undocumented. **Verify in staging before cutover.** If pruned,
  fall back to generating the full custom-domain set (core + apps from `apps.json`) into
  the proxy config so every deploy is complete.
- **Custom-domain count:** ~18 custom domains on one worker (4 core + 14 apps). Confirm
  against Cloudflare limits (expected fine). **Verify.**
- **Cross-account credentials in one job:** the extended `deploy-app.js` uses both
  Myceli and old-account creds in a single run. Both already exist in CI, so no new
  secrets — but the job now writes to two accounts; keep the two clients clearly
  separated in code.
- **Doc drift:** `.github/docs/DEPLOYMENT.md` names `app-deploy.yml`/`production`; the
  real workflow is `app-deploy-automatic.yml`/`main`. Fix opportunistically (separate).

## Out of scope (YAGNI)

- No wildcard route, no wildcard DNS.
- No app staging environments (apps deploy `production` only today).
- No change to app source, build commands, or `apps.json` schema.
- No new workflow and no embedded allowlist — the existing per-app deploy and generic
  forwarding cover steady state.
