# Cloudflare proxy → AWS CloudFront migration — remaining hosts

Status as of 2026-06-02. Pattern proven on **gen, enter, media** (all live on CloudFront).

## Done ✅
| Host | Dist | CloudFront domain | Origin |
|---|---|---|---|
| gen.pollinations.ai | E35MFLKOJK04O7 | d2w26ehy17hxt9.cloudfront.net | gen.myceli.ai |
| enter.pollinations.ai | E1621Y522BHBWP | d161vu6omct0xx.cloudfront.net | enter.myceli.ai |
| media.pollinations.ai | E1Z6LB9U99HNL7 | d3ohgrrttqhabo.cloudfront.net | media.myceli.ai |

## Remaining
| Host | Origin (verified serving) | Cert | Special |
|---|---|---|---|
| staging.enter.pollinations.ai | staging.enter.myceli.ai (200) | `*.staging.pollinations.ai` ✅ ISSUED (<deleted-cert-id>) | none |
| staging.gen.pollinations.ai | staging.gen.myceli.ai (301) | `*.staging.pollinations.ai` ✅ ISSUED (<deleted-cert-id>) | none |
| pollinations.ai (apex) | pollinations.myceli.ai (200) | pollinations.ai exact (c0f0cee5) ✅ | **apex — CNAME-flatten** |

`staging.pollinations.ai` exists but user says not meaningful → leave on legacy unless asked.
`staging.media.pollinations.ai` does not exist → ignore.

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
