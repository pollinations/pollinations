# Cloudflare proxy → AWS CloudFront migration

Status as of 2026-06-03. **All 6 target hosts are LIVE on CloudFront.** The
legacy Cloudflare Workers proxy is kept for rollback (not yet decommissioned;
legacy account not yet downgraded).

## Done ✅ — all live
| Host | Dist | Origin |
|---|---|---|
| gen.pollinations.ai | E35MFLKOJK04O7 | gen.myceli.ai |
| enter.pollinations.ai | E1621Y522BHBWP | enter.myceli.ai |
| media.pollinations.ai | E1Z6LB9U99HNL7 | media.myceli.ai |
| staging.enter.pollinations.ai | EWH89KR7VA1VA | staging.enter.myceli.ai |
| staging.gen.pollinations.ai | EXPRZGSA2VOHZ | staging.gen.myceli.ai |
| pollinations.ai (apex) | E3TC5DH134RLUG | pollinations.myceli.ai |

Plus the legacy cache-worker hosts, also on CloudFront: image.pollinations.ai
(E1ODE9U7PM1DCA → image.myceli.ai), text.pollinations.ai (E1N0S50MFRA845 →
text.myceli.ai).

`staging.pollinations.ai` (single-label) and ~other out-of-scope hosts remain on
legacy. `staging.media.pollinations.ai` does not exist → ignore.

See **README.md** for per-dist config + the origin-timeout / access-logging
operations notes. Apply config from `distribution-*.json`; enable logging with
`setup-logging.sh`.

## Proven per-host runbook
1. Clone `infra/aws/distribution-media.json` → swap `CallerReference`, origin `DomainName`, `X-Forwarded-Host`, `Aliases`, `ACMCertificateArn`. Keep `ResponseHeadersPolicyId b872080f-...` (header parity), `OriginRequestPolicyId b689b0a8` (AllViewerExceptHostHeader), `CachePolicyId 4135ea2d`.
2. `aws cloudfront create-distribution` (profile admin, us-east-1). Wait `Deployed`.
3. Verify via `--resolve <host>:443:<cf-ip>`: `https / → 200`, `http / → 301→https`, endpoint+body parity vs legacy.
4. **Fire-time gate:** both legacy + CloudFront edges `https / → 200`, `http / → 301→https` (no self-redirect). Abort otherwise.
5. **Minimal-gap cutover:** GET binding id (`workers/domains?hostname=`), then DELETE binding + POST DNS-only CNAME (`<host> → <cf-domain>`, ttl=60) back-to-back, no sleep (~0.4s gap).
6. Verify: dig converges to CloudFront on @1.1.1.1/@8.8.8.8/@9.9.9.9 (no legacy dual-state), `http / → 200` terminates, `via …cloudfront.net`.
7. Rollback (if needed): delete CNAME → `PUT workers/domains {hostname, service:pollinations-proxy, environment:<env>, zone_id:<POLLINATIONS_ZONE_ID>}` (auto-restores read-only AAAA).

## Staging specifics
- `staging.*` bindings live on the **staging worker env** (`pollinations-proxy-staging`), NOT the prod `pollinations-proxy`. Confirm the binding's `service`/`environment` when re-adding for rollback (likely service `pollinations-proxy-staging` or `pollinations-proxy` env `staging` — VERIFY via the GET before cutover).
- Cert: `arn:aws:acm:us-east-1:<AWS_ACCOUNT_ID>:certificate/<deleted-cert-id>-efec-4dc4-8b3e-8dc4163bff91`.

## Apex specifics (do LAST, separately)
- pollinations.ai has MX (Google), TXT (SPF/verifications) — **must not be disturbed**.
- Method chosen: **Cloudflare CNAME-flattening**. The apex stays on the CF account's DNS; flatten an apex CNAME → the apex CloudFront dist. Apex DNS is currently the read-only Workers AAAA — same delete-binding-then-add-flattened-CNAME dance, but a flattened CNAME at apex coexisting with MX/TXT is allowed (CF flattening handles it).
- Build apex dist: origin `pollinations.myceli.ai`, alias `pollinations.ai`, cert c0f0cee5 (exact match), same policies.
- Higher stakes (marketing site) — verify the rendered site in a real browser post-cutover, and keep rollback hot.

## Notes
- No Myceli wrangler login needed; all ops run against legacy account (<LEGACY_CF_ACCOUNT_ID>) via `.testingtokens` tokens + AWS `admin` profile.
- `*.myceli.ai` origins stay on Cloudflare (only the public hostname proxy layer moves).
- Free-plan zone: negative-cache TTL fixed at 1800s (can't lower, error 1003). Minimal-gap keeps the NXDOMAIN window to ~0.4s.
