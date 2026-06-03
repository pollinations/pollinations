# Cloudflare proxy → AWS (CloudFront) migration — design

**Date:** 2026-06-02
**Status:** Design — pending user review
**Scope:** Phase 1, hosts `enter.pollinations.ai` + `gen.pollinations.ai` only

## Goal

Move the public-traffic proxy for `enter.pollinations.ai` and `gen.pollinations.ai`
off the legacy **thomash@ Cloudflare account** (`<LEGACY_CF_ACCOUNT_ID>`) onto **AWS CloudFront**, so
that account can be safely downgraded to Workers Free (100k req/day) without a public
outage. The proxy worker there fronts all `*.pollinations.ai` traffic and is well over
100k/day, so on downgrade it would hard-fail.

This is the first wedge of a larger migration. Apps + `economics`/`kpi` follow later with
the identical pattern. DNS-zone migration to Route53 is a **separate, later phase** (CF DNS
is free + unlimited and is *not* throttled by the downgrade).

**Non-goal:** changing any public URL. `enter`/`gen.pollinations.ai` stay exactly as users
see them. Myceli upstreams stay on Cloudflare.

## Current state

```text
Browser → enter/gen.pollinations.ai          (old account: pollinations.ai zone)
        → pollinations-proxy Worker           (old account, custom_domain binding; 100k/day cap)
        → enter/gen.myceli.ai                  (Myceli: real Workers — STAY on Cloudflare)
```

- DNS: `enter`/`gen.pollinations.ai` are `AAAA → 100::`, **proxied (orange cloud)**. The
  `100::` target is a dummy; routing is the Worker **custom-domain binding**, not the DNS
  target. (Consequence: cutover is *not* a simple record-target edit — see Cutover.)
- The Worker (`pollinations-myceli-proxy/src/index.ts`) rewrites Host → `<sub>.myceli.ai`,
  sets `X-Forwarded-Host`/`X-Forwarded-Proto`, **overwrites** `X-Original-Client-IP` /
  `X-Forwarded-For` from `CF-Connecting-IP` and **deletes** them when absent (anti-spoof),
  and passes through WebSocket upgrades + SSE streaming.
- Backend trust (`shared/public-origin.ts`, `shared/client-ip.ts`): `getRealClientIp()` /
  `getPublicOrigin()` trust forwarded headers only when the host-pair matches
  `TRUSTED_FORWARDED_HOSTS` (e.g. req host `gen.myceli.ai` + `X-Forwarded-Host:
  gen.pollinations.ai`). `BETTER_AUTH_URL` is hardcoded to `https://enter.pollinations.ai`,
  so OAuth callbacks are anchored to the public host independent of the request path.

## Target architecture

**One plain CloudFront distribution per host. No CloudFront Function, no Lambda@Edge.**

```text
Browser → enter.pollinations.ai → CloudFront dist (enter) → origin enter.myceli.ai  (Cloudflare)
        → gen.pollinations.ai   → CloudFront dist (gen)   → origin gen.myceli.ai    (Cloudflare)
```

Each distribution:
- **Origin:** `<sub>.myceli.ai`, HTTPS-only, TLS 1.2+.
- **Cache policy:** `CachingDisabled` (`4135ea2d-6df8-44a3-9df3-4b5a84be39ad`).
- **Origin-request policy:** a single **custom** policy reused by both dists —
  `HeaderBehavior = allViewerAndWhitelistCloudFront`, whitelist `[CloudFront-Viewer-Address]`.
  This drops the viewer `Host` (so CloudFront sends `Host = <sub>.myceli.ai` to the
  Cloudflare origin) **and** adds the real-viewer-IP header. *(The managed
  `AllViewerExceptHostHeader` was empirically shown NOT to add CloudFront-generated headers —
  hence a custom policy.)*
- **Static origin custom headers:** `X-Forwarded-Host: <public host>` and
  `X-Forwarded-Proto: https` (both constant per host; both off CloudFront's denylist).
- **Viewer protocol policy:** `redirect-to-https`. **Compress:** off.
- **Alternate domain name (CNAME):** the public host; **ACM cert** (us-east-1) covering
  `pollinations.ai` + `*.pollinations.ai` (one cert serves both dists and future hosts).
- All viewer methods allowed (GET/HEAD/OPTIONS/PUT/POST/PATCH/DELETE); WebSocket pass-through
  is automatic on this shape.

### Why per-host plain distributions (not one distribution + a function)

CloudFront selects an origin by **URL path only, never by Host**. ~20 hosts share the same
paths, so a single distribution cannot route them without an edge function. A per-host
distribution sidesteps host-based routing entirely — **zero functions, zero new/young AWS
features** (no `updateRequestOrigin`, no Lambda@Edge). The cost is N distributions to manage,
which is scriptable from `apps.json` (like the existing `gen-routes.mjs`) and acceptable
(add-host is "nice, not critical"). At the 2-host scope it is trivially simple.

## Empirically proven (this session)

All load-bearing behavior was tested on throwaway distributions (all torn down + verified):

| Property | Result |
| --- | --- |
| WebSocket pass-through (`gen/v1/realtime`) | ✓ real WS client; origin + CloudFront both 401 at auth → Upgrade survived |
| SSE streaming | ✓ token-by-token, unbuffered, cache MISS |
| Host header to Cloudflare origin | ✓ must drop viewer Host (custom policy); `AllViewer` → 502 |
| `X-Forwarded-Host` static origin header | ✓ arrived verbatim at origin (httpbin echo) |
| Real viewer IP via `CloudFront-Viewer-Address` | ✓ `46.142.212.69:60063` matched `/cdn-cgi/trace` |

## Components & changes

### 1. Backend: `shared/client-ip.ts` (one small change)

`getRealClientIp()` currently reads `x-original-client-ip` (when host-pair trusted) else
`cf-connecting-ip`. Add a branch to read `CloudFront-Viewer-Address` (format `IP:port`),
gated on the same `hasTrustedProxyHeaders(c)` check:

```ts
if (hasTrustedProxyHeaders(c)) {
    const cfViewerAddr = c.req.header("cloudfront-viewer-address");
    if (cfViewerAddr) {
        // CloudFront sends "IP:port" (IPv4) or "<ipv6>:port" — split on the LAST colon.
        const i = cfViewerAddr.lastIndexOf(":");
        const ip = i === -1 ? cfViewerAddr : cfViewerAddr.slice(0, i);
        if (ip) return ip;
    }
    const originalIp = c.req.header("x-original-client-ip");
    if (originalIp) return originalIp;
}
return c.req.header("cf-connecting-ip") || "unknown";
```

`getRealClientIp` is the single chokepoint (consumers: `rate-limit-edge`, `rate-limit-durable`,
`logger`, `track`, `realtime`, `images`, `device`), so this one edit covers all of them.
The existing `x-original-client-ip` branch stays as the fallback for the Cloudflare-proxy path
during the transition. The host-pair trust gate (`hasTrustedProxyHeaders`, keyed on
`X-Forwarded-Host`) is unchanged → no new trust model (YAGNI; parity only).

### 2. AWS resources (per host, profile `admin`, account <AWS_ACCOUNT_ID>, us-east-1)

- One ACM cert: `pollinations.ai` + `*.pollinations.ai` (DNS-validated; shared).
- One custom origin-request policy (shared): `allViewerAndWhitelistCloudFront` +
  `CloudFront-Viewer-Address`.
- Two CloudFront distributions (`enter`, `gen`) as specified above.

No app code, no Myceli changes, no new security mechanism.

## Cutover plan (per host, reversible)

Because today's `enter`/`gen` records are **proxied `AAAA 100::` Worker custom-domain
bindings**, cutover is a binding+record change, not a target edit. Do `gen` first
(`enter` is auth/billing — cut last), each fully reversible:

1. **Stand up** the host's CloudFront dist + cert + custom policy + static headers. Verify
   `https://<dist>.cloudfront.net` serves correctly (compare body/headers to the live host;
   check SSE on `gen`, WS on `gen/v1/realtime`). Resolve the known CF-egress→Cloudflare 502
   quirk here if it recurs (already shown solvable).
2. **Add** the public host as an alternate domain name on the dist (cert must cover it).
3. **Reclaim the hostname** on the old account: remove the `enter`/`gen.pollinations.ai`
   **custom-domain binding** from the `pollinations-proxy` Worker (a hostname can be owned by
   only one CF service). Remove/replace the dummy `AAAA 100::` proxied record.
4. **Point DNS** at CloudFront: `CNAME <host> → <dist>.cloudfront.net`, **DNS-only (grey
   cloud)** — CloudFront terminates TLS via ACM, so the record must NOT be Cloudflare-proxied.
5. **Verify:** `https://<host>` serves from CloudFront (`via: …cloudfront.net`), origin
   receives `Host: <sub>.myceli.ai`, real client IP flows (`getRealClientIp` correct in
   logs/rate-limit), SSE + WS work, and (for `enter`) OAuth login round-trips.

**Rollback (per host):** re-add the host's custom-domain binding to the `pollinations-proxy`
Worker and restore the proxied `AAAA 100::` record. The Worker stays live and in the
`UPSTREAM_MAP` until the very end, so rollback is a binding/record restore, not a redeploy.

## Sequencing (hard rule)

Migrate **and verify both hosts on CloudFront BEFORE** decommissioning the proxy worker or
downgrading the legacy account. Wrong order = self-inflicted outage. `enter` (auth/billing)
is cut **after** `gen` and verified most carefully (OAuth round-trip).

## Post-migration (this phase)

- Leave the `pollinations-proxy` Worker live (it still serves the other ~18 hosts until their
  later migration). Only remove `enter`/`gen` from its routes once both are stable on
  CloudFront for ~1 day.
- Do **not** downgrade the account in this phase — the worker still fronts the remaining hosts.

## Out of scope (YAGNI)

- The other ~18 hosts (apps, `economics`, `kpi`) — later, same pattern.
- DNS-zone migration CF → Route53 (separate phase; context only — DO NOT START here).
- Any new security/trust mechanism. A **trusted-proxy marker/secret header** (require
  CloudFront to prove itself before the backend trusts forwarded headers) is real hardening
  but is *new* security that applies equally to today's Cloudflare proxy — explicitly deferred
  as a separate future item to keep this migration incremental. Header **parity** (overwrite/
  strip client-IP via `CloudFront-Viewer-Address`) is required and included — that prevents a
  regression, it is not new security.
- Edge functions / host-based routing / one shared distribution.

## Risks / verify-before-ship

- **CF-egress → Cloudflare 502 quirk:** seen intermittently when CloudFront fetches a
  `*.myceli.ai` origin. Header forwarding is origin-agnostic (proven on httpbin) and the path
  worked in the WS/SSE runs; **verify on each real per-host dist** before cutover and treat a
  persistent 502 as a blocker.
- **`CloudFront-Viewer-Address` trust:** present only on the CloudFront path. The backend
  change is gated on `hasTrustedProxyHeaders` (host-pair match), so a direct `*.myceli.ai` hit
  cannot inject it — matches the existing trust model.
- **`enter` OAuth:** `BETTER_AUTH_URL` is anchored to `https://enter.pollinations.ai`, so
  callbacks are host-stable; still explicitly verify a full login round-trip post-cutover.
- **DNS grey-cloud requirement:** the CloudFront CNAME must be DNS-only; an accidentally
  proxied (orange) record would double-proxy and break TLS/SNI.
