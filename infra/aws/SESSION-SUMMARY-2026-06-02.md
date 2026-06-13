# Cloudflare→AWS proxy migration — session summary (2026-06-02 → 06-03)

Detailed handoff for compaction. Branch: `feat/cloudflare-proxy-to-aws`.

## What we did — DNS cutover of ALL 6 target hosts to AWS CloudFront ✅ LIVE

Migrated the public-traffic proxy for 6 hosts (incl. the apex) off the legacy thomash@ Cloudflare
Workers proxy onto per-host AWS CloudFront distributions. All verified healthy in production.

| Host | CloudFront dist | CF domain | Origin | Config | Gap | Rollback CNAME id |
|---|---|---|---|---|---|---|
| gen.pollinations.ai | E35MFLKOJK04O7 | d2w26ehy17hxt9.cloudfront.net | gen.myceli.ai | distribution-gen.json | ~9s (drain-gap) | <rollback-cname-id> |
| enter.pollinations.ai | E1621Y522BHBWP | d161vu6omct0xx.cloudfront.net | enter.myceli.ai | distribution-enter.json | 0.39s | <rollback-cname-id> |
| media.pollinations.ai | E1Z6LB9U99HNL7 | d3ohgrrttqhabo.cloudfront.net | media.myceli.ai | distribution-media.json | 0.38s | <rollback-cname-id> |
| staging.enter.pollinations.ai | EWH89KR7VA1VA | d26096spt63fif.cloudfront.net | staging.enter.myceli.ai | distribution-staging-enter.json | 0.40s | <rollback-binding-id> |
| staging.gen.pollinations.ai | EXPRZGSA2VOHZ | d1r1c9pwlldm9u.cloudfront.net | staging.gen.myceli.ai | distribution-staging-gen.json | 0.32s | <rollback-binding-id> |
| **pollinations.ai (apex)** | **E3TC5DH134RLUG** | **d2hovdp85ipa0z.cloudfront.net** | **pollinations.myceli.ai** | **distribution-apex.json** | **~2.2s** | **CNAME id <rollback-cname-id>** |

## Apex cutover (2026-06-03 ~00:29) — DONE, the grey-cloud question RESOLVED ✅
- **The open question is answered: a grey-cloud (DNS-only) apex CNAME → CloudFront IS flattened by Cloudflare to CloudFront's real IPs** (18.66.102.x = AWS), NOT Cloudflare anycast. Confirmed by CF docs ("if the CNAME record is grey cloud, CNAME Flattening will still work") AND empirically: all 4 public resolvers (1.1.1.1/8.8.8.8/9.9.9.9/OpenDNS) return ONLY CloudFront IPs, 0 legacy. This is exactly "off CF" — grey-cloud is REQUIRED (orange-cloud would re-insert CF anycast).
- Method: same minimal-gap as the subdomains. Apex WAS a Workers custom-domain binding (pollinations-proxy/production, binding id <binding-id>). Flip = DELETE binding (frees read-only AAAA 100::) + POST grey-cloud CNAME (proxied:false, ttl 60) back-to-back. Gap ~2.2s (slower than subdomain flips because the binding DELETE + DNS POST were sequential curls; still well under the neg-cache window; no NXDOMAIN observed).
- Verified: https 200 from 18.66.102.40 (0.13s), x-amz-cf-id + via cloudfront headers present, http→301→https clean, all static assets (index/HelloPage JS, favicon) 200 from CloudFront, MX×5 + TXT×11 preserved, browser render OK. The 4 console 401s are PRE-EXISTING homepage anon-chat calls to gen.pollinations.ai (unrelated to apex; same call with a model returns 200).
- Rollback: delete CNAME <rollback-cname-id> → PUT Workers binding {hostname:pollinations.ai, service:pollinations-proxy, environment:production, zone_id} (auto-restores proxied AAAA 100::).

## NOT done
- staging.pollinations.ai (single-label, exists, user says not meaningful → left on legacy)
- staging.media.pollinations.ai (doesn't exist → ignore)
- Other ~18 hosts (out of scope). Legacy proxy NOT decommissioned, legacy account NOT downgraded (later phases).

## The cutover method (PROVEN — "minimal-gap")
Per host: (1) clone a distribution-*.json, swap origin/alias/X-Forwarded-Host/cert; KEEP policies CachePolicy 4135ea2d, OriginRequestPolicy b689b0a8 (AllViewerExceptHostHeader), ResponseHeadersPolicy b872080f (parity: nosniff + vary). (2) create dist, wait Deployed. (3) verify via `--resolve <host>:443:<cf-ip>` — parity vs legacy. (4) FIRE-TIME GATE: both legacy+CF edges https/→200, http/→301→https (abort if self-redirect). (5) DELETE Workers binding + POST DNS-only CNAME (ttl=60) back-to-back, NO sleep (~0.4s gap). (6) verify resolve+health+convergence (no legacy IP dual-state). Rollback: delete CNAME → PUT workers/domains {hostname, service, environment, zone_id} (auto-restores read-only AAAA).

## Key learnings this session
- **The enter redirect loop (first attempt) was a TRANSIENT dual-state artifact**, NOT a config bug. Drain-gap (gen) avoided it but caused a ~9s NXDOMAIN window. Minimal-gap (enter/media/staging) is strictly better: ~0.4s gap, no loop (both edges return 200 to / — neither emits a self-referential 301; http→https is a clean scheme upgrade that terminates).
- **Free-plan zone: negative-cache TTL (SOA min_ttl=1800/30min) is NOT editable** (`error 1003 Custom SOA records not available`). Can't shrink the NXDOMAIN window via TTL — only via minimizing the gap. The positive 300s TTL is also read-only (Workers record). NXDOMAIN residual after a 0.4s gap is tiny + self-healing (flush/restart). macOS stub resolver (mDNSResponder) caches NXDOMAIN locally even when upstream is correct (`dig` ok but `curl`/browser fail until flush: `sudo dscacheutil -flushcache; sudo killall -HUP mDNSResponder`).
- **CERT wildcard position trap:** `*.staging.pollinations.ai` covers `X.staging.` NOT `staging.X.` (our hosts staging.gen/staging.enter). CloudFront rejected it (InvalidViewerCertificate). Fix = exact-SAN cert **dec8c450-b3cc-4f5f-83df-4ec37610fbb8** (SANs staging.enter + staging.gen). Deleted the wrong *.staging cert (<deleted-cert-id>). The c0f0cee5 cert (pollinations.ai + *.pollinations.ai) covers single-label prod hosts only (TLS wildcards single-label).
- Staging Workers bindings were on service `pollinations-proxy-staging` env `production` (not prod `pollinations-proxy`).

## Post-cutover health (Tinybird, verified)
NO error regression from cutover. 5xx flat-to-declining across the window (~0.04% now); zero 504; gateway 502s declined to 0. All recent 5xx are GPU/provider backends (RunPod zimage 502 — pre-existing+declining, RunPod klein 500, OpenAI geo-block, Bedrock/Fireworks/Azure 502s), NONE from the proxy/CloudFront path. High 401/402 = normal anon/out-of-credit traffic.

## Resources / access
- AWS: account <AWS_ACCOUNT_ID>, profile `admin`, us-east-1. Certs: c0f0cee5 (prod hosts), dec8c450 (staging pair). Policies: CachePolicy 4135ea2d, OriginRequestPolicy b689b0a8, ResponseHeadersPolicy b872080f.
- Legacy CF account <LEGACY_CF_ACCOUNT_ID>, zone pollinations.ai = <POLLINATIONS_ZONE_ID>.
- Tokens in enter.pollinations.ai/.testingtokens (gitignored): CLOUDFLARE_DNS_EDIT_TOKEN, CLOUDFLARE_WORKERS_EDIT_TOKEN, CLOUDFLARE_ZONE_ID. NO Myceli wrangler login needed.
- Host→origin map: pollinations-myceli-proxy/wrangler.toml UPSTREAM_MAP; logic pollinations-myceli-proxy/src/upstream.ts.

## PR / repo state (branch feat/cloudflare-proxy-to-aws)
6 commits already: client-ip CloudFront-Viewer-Address (644b6d7), shared origin-request policy (e33fa83), ACM cert doc (efba0d9), gen dist (8e23c33), gen 502 fix (96e4222a), enter dist (0cbc395b).
UNCOMMITTED to add to PR:
- infra/aws/distribution-{media,staging-enter,staging-gen}.json (NEW dist configs)
- infra/aws/MIGRATION-PLAN.md, infra/aws/SESSION-SUMMARY-2026-06-02.md
- docs/superpowers/{plans,specs}/2026-06-02-cloudflare-proxy-to-aws*
- README.md NEEDS UPDATE: says "no cutover performed" for gen/enter — now ALL 5 are LIVE. Add media + staging dists, mark cutovers done, document the exact-SAN staging cert + the minimal-gap method.
SEPARATE / EXCLUDE:
- enter.pollinations.ai/src/routes/api-keys.ts (M) — UNRELATED (removes redirectUris validation; belongs to OAuth-convergence work, not this migration). Revert or separate PR.
- .playwright-mcp/, enter-cutover-live.png, skill-observations/ — artifacts, gitignore/exclude.
## PR-impact audit (workflow wd6jkv8kd, 7 agents, adversarially verified) — RESULTS

**No code change is REQUIRED for correctness/security. One analytics regression + housekeeping.**

1. **Client-IP / trusted-proxy: NO regression, NO change needed.** `shared/client-ip.ts` `getRealClientIp()` gates ALL forwarded-header reads behind `hasTrustedProxyHeaders()` (host-pair match in `shared/public-origin.ts` TRUSTED_FORWARDED_HOSTS). CloudFront not stripping client-supplied X-Original-Client-IP is NOT a spoofing regression because the trust gate rejects forwarded headers on untrusted host-pairs (test client-ip.test.ts:60-66 proves it). Commit 644b6d7 (CloudFront-Viewer-Address) is complete + tested. All consumers (rate-limit-edge/durable, logger, track, realtime) read via the single getRealClientIp chokepoint.

2. **⚠️ ONE REAL REGRESSION (analytics only, NOT billing) — `enter.pollinations.ai/src/routes/stripe.ts:72`.** Reads `cf-ipcountry` for `getCohortFromCountry()`. CloudFront does NOT forward `cf-ipcountry` (the managed AllViewerExceptHostHeader policy doesn't include CloudFront-Viewer-Country). So all checkouts now tag the DEFAULT cohort. **BUT** — verified by reading the code — the cohort is "for analytics" only (comments lines 36,70); **currency + localized payment methods come from Stripe Adaptive Pricing + STRIPE_PMC env, NOT the cohort.** So payments/currency still work; only cohort analytics segmentation degrades. **Fix (not a blocker):** add a custom origin-request policy that ALSO forwards `CloudFront-Viewer-Country` and read it (fallback to cf-ipcountry) in stripe.ts. Only matters for enter (the host that does checkout).

3. **CORS / CSP / hardcoded origins: NONE needed.** Public hostnames unchanged → SDK (packages/sdk hardcoded gen/enter/media URLs), frontend (pollinations.ai/src/api.config.ts), media key-verify — all fine. CORS is origin:* bearer-auth, CloudFront doesn't touch it. Header parity (nosniff+vary) restored via response-headers-policy b872080f.

4. **CI/deploy: RECOMMENDED housekeeping (no blocker).** No CI deploys the legacy proxy (manual `npm run deploy:production`). gen/enter/media/staging wrangler.toml correctly bind *.myceli.ai (not the public hosts) — no conflict. After cutover, the legacy proxy's wrangler.toml STILL lists gen/enter/media/staging routes — harmless (they're just unused now; proxy still serves apex + other hosts) but should be cleaned up eventually. Don't remove yet (rollback safety).

5. **Tests/docs: RECOMMENDED.** client-ip tests are thorough. GAP: `getPublicOrigin()`/`getPublicUrl()` (shared/public-origin.ts, used for OAuth callbacks/image URLs/logging) have ZERO tests — worth adding. infra/aws/README.md is STALE ("no cutover performed") — UPDATE to reflect 5 live + the method.

## PR RECOMMENDATION
**Yes, make a PR** — but it's mostly committing what's already built + done. Contents:
- ADD: infra/aws/distribution-{media,staging-enter,staging-gen}.json, MIGRATION-PLAN.md, SESSION-SUMMARY-2026-06-02.md, docs/superpowers/{plans,specs}/2026-06-02-*.
- UPDATE: infra/aws/README.md (mark 5 live, add media+staging dists, exact-SAN staging cert dec8c450, minimal-gap method).
- EXCLUDE/gitignore: .playwright-mcp/, enter-cutover-live.png, skill-observations/.
- SEPARATE: enter.pollinations.ai/src/routes/api-keys.ts (M) is UNRELATED (OAuth redirectUris dead-code removal; audit says safe but it's not this migration). Revert here or its own PR.
- FOLLOW-UP (separate issue/PR, not blocking): (a) stripe.ts cf-ipcountry→CloudFront-Viewer-Country cohort fix, (b) getPublicOrigin/getPublicUrl tests, (c) eventually trim legacy proxy routes after apex done + rollback window closed.
- The branch already has 6 infra commits; this PR finalizes the whole feat/cloudflare-proxy-to-aws line.
