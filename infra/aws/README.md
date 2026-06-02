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
- **Origin-request policy:** `cee68e99-f3e4-4f65-811e-e5d2e050bb18`
  (allViewerAndWhitelistCloudFront + CloudFront-Viewer-Address)
- **Cache policy:** `4135ea2d-6df8-44a3-9df3-4b5a84be39ad` (CachingDisabled)
- **Config:** `infra/aws/distribution-gen.json`

Known issue: requests through the cloudfront.net domain return `502 Bad
Gateway` ("can't connect to the server"), while the origin `gen.myceli.ai`
is healthy directly (301 on `/`, 200 on `/v1/models`, serves forced TLSv1.2,
cert SAN covers `gen.myceli.ai`). This is the CloudFront -> Cloudflare egress
quirk — Cloudflare rejecting connections from CloudFront edge ranges. Origin
config matches spec (https-only, TLSv1.2). Resolve before DNS cutover.
