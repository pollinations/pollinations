# AWS infra (account 301235909293)

Use `--profile admin --region us-east-1` for all commands below. ACM certs
fronting CloudFront MUST live in `us-east-1`.

## ACM certificate — pollinations.ai

- **ARN:** `arn:aws:acm:us-east-1:301235909293:certificate/c0f0cee5-221d-40b3-9d04-357a9f4cccaa`
- **Covers:** `pollinations.ai` + `*.pollinations.ai`
- **Region:** `us-east-1`
- **Validation:** DNS. ACM issues one CNAME covering both names (apex +
  wildcard share the same validation record).
- **Validation CNAME name:** `_ddd25a95c8d7a0d725f3be3bae0e6d06.pollinations.ai`
  (DNS-only / unproxied, added to the Cloudflare `pollinations.ai` zone).
- **Status:** ISSUED.

This cert is intended for the CloudFront distributions that will front
enter/gen.pollinations.ai. Keep the validation CNAME in place so ACM can
auto-renew.

## CloudFront distribution — gen.pollinations.ai

- **Distribution Id:** `E35MFLKOJK04O7`
- **CloudFront domain:** `d2w26ehy17hxt9.cloudfront.net`
- **Alias:** `gen.pollinations.ai` (no DNS pointed here yet — verified via the
  cloudfront.net domain only; no cutover performed)
- **Origin:** `gen.myceli.ai` (Cloudflare Worker), `https-only`, TLSv1.2
- **Custom headers to origin:** `X-Forwarded-Host: gen.pollinations.ai`,
  `X-Forwarded-Proto: https`
- **Origin-request policy:** `b689b0a8-53d0-40ab-baf2-68738e2966ac`
  (managed `AllViewerExceptHostHeader`)
- **Cache policy:** `4135ea2d-6df8-44a3-9df3-4b5a84be39ad` (CachingDisabled)
- **Config:** `infra/aws/distribution-gen.json`

Verified via the cloudfront.net domain: `301` on `/` (redirects to
`gen.pollinations.ai/docs`, proving `X-Forwarded-Host` is applied), `200` on
`/v1/models`, `/image/models`, `/models` — matching origin-direct. No cutover
performed.

### Why the managed policy (not a custom one)

The origin Cloudflare Worker serves only its own hostnames. CloudFront MUST
NOT forward the viewer `Host` header (it would send `*.cloudfront.net` /
`gen.pollinations.ai`, which Cloudflare rejects → surfaces as a CloudFront
`502`). `AllViewerExceptHostHeader` drops viewer `Host` so CloudFront sets
`Host = gen.myceli.ai`, AND it natively forwards the CloudFront-generated
`CloudFront-Viewer-Address` header (real client IP as `IP:port`). The backend
`shared/client-ip.ts` reads `CloudFront-Viewer-Address` under the existing
trusted host-pair gate. A custom `allViewerAndWhitelistCloudFront` policy was
tried first and caused the 502 because it forwards ALL viewer headers,
including `Host`.
