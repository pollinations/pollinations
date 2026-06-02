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
