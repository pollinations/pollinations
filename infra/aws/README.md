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
- **Aliases:** `gen.pollinations.ai` (LIVE — DNS cut over), `gen-aws.pollinations.ai` (direct-test alias)
- **Origin:** `gen.myceli.ai` (Cloudflare Worker), `https-only`, TLSv1.2
- **Custom headers to origin:** `X-Forwarded-Host: gen.pollinations.ai`,
  `X-Forwarded-Proto: https`
- **Origin-request policy:** `b689b0a8-53d0-40ab-baf2-68738e2966ac`
  (managed `AllViewerExceptHostHeader`)
- **Cache policy:** `4135ea2d-6df8-44a3-9df3-4b5a84be39ad` (CachingDisabled)
- **Config:** `infra/aws/distribution-gen.json`

Verified: `301` on `/` (redirects to `gen.pollinations.ai/docs`, proving
`X-Forwarded-Host` is applied), `200` on `/v1/models`, `/image/models`,
`/models` — matching origin-direct. LIVE.

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

## CloudFront distribution — enter.pollinations.ai

- **Distribution Id:** `E1621Y522BHBWP`
- **CloudFront domain:** `d161vu6omct0xx.cloudfront.net`
- **Aliases:** `enter.pollinations.ai` (LIVE — DNS cut over), `enter-aws.pollinations.ai` (direct-test alias)
- **Origin:** `enter.myceli.ai` (Cloudflare Worker), `https-only`, TLSv1.2
- **Custom headers to origin:** `X-Forwarded-Host: enter.pollinations.ai`,
  `X-Forwarded-Proto: https`
- **Origin-request policy:** `b689b0a8-53d0-40ab-baf2-68738e2966ac`
  (managed `AllViewerExceptHostHeader`) — same as gen
- **Cache policy:** `4135ea2d-6df8-44a3-9df3-4b5a84be39ad` (CachingDisabled)
- **Config:** `infra/aws/distribution-enter.json`

Verified: `200` on `/` (`server: cloudflare`), JSON error-body parity on
`/api/*`, and auth-gate parity — both the `Authorization: Bearer` header and
`?key=` query param reach enter's auth layer and produce identical `401`
verdicts through CloudFront vs origin-direct. POST passthrough confirmed. LIVE.

## Operations: origin timeouts (the 504 story)

CloudFront imposes timeouts that the legacy Cloudflare Workers proxy did not.
A Worker has no wall-clock request limit; CloudFront does. After the migration,
slow non-streaming requests started returning CloudFront `504`s. The relevant
origin settings (per `distribution-*.json`):

| Setting | Field | What it is | Our value |
|---|---|---|---|
| Response (read) timeout | `OriginReadTimeout` | Inter-packet timer: max wait for the next byte from the origin. **Resets on every byte.** Not a total-duration cap. | **180** on gen + staging-gen; 60 elsewhere |
| Connection timeout | `ConnectionTimeout` | Max wait to *establish* the TCP/TLS connection. Hard-capped at **10s** by CloudFront (`[1,10]`). | 10 |
| Connection attempts | `ConnectionAttempts` | Retries for BOTH connect-establishment AND read-timeout (see below). | **1** on gen + staging-gen; 3 elsewhere |
| Keep-alive | `OriginKeepaliveTimeout` | How long an idle origin connection is reused. | 5 |

**`OriginReadTimeout` requires a quota.** The default is 60s; the account quota
"CloudFront → Response timeout per origin" (`L-AECE9FA7`) gates higher values.
It was raised to 120, then 180 via the Service Quotas **console** (the quota is
NOT visible/requestable through the Service Quotas API — `NoSuchResource`).
Setting a value above the current quota fails with `InvalidOriginReadTimeout`.

**The GET-vs-POST retry asymmetry (per AWS docs).** On a *read* timeout:
`GET`/`HEAD` are retried per `ConnectionAttempts`; `POST`/`PUT`/`PATCH`/`DELETE`
are **not** retried. So with `ConnectionAttempts=3`, a slow image `GET` would
hit the origin up to 3× (`3 × OriginReadTimeout`) — three real generations —
while a slow chat `POST` fails after one. We set **`ConnectionAttempts=1` on
gen** to stop slow image GETs from triple-billing the GPU backend; both methods
then cap cleanly at one attempt × `OriginReadTimeout`.

**Tradeoff to know:** `ConnectionAttempts` is one knob for two retry types.
Setting it to 1 also removes the *connect-establishment* retry (which is
method-independent and harmless — a failed handshake never reaches the worker,
so nothing is billed). If you ever want connect-retry resilience back without
re-introducing the slow-GET GPU waste, set `ConnectionAttempts=2` **plus**
`ResponseCompletionTimeout=180` (a total-duration cap, independent of retries),
so a retried GET still can't exceed 180s total.

**Streaming is unaffected.** SSE/streamed responses send bytes continuously, so
the inter-packet `OriginReadTimeout` never trips. Only non-streaming (buffer-
then-burst) requests are exposed to the ceiling.

## Operations: access logging

CloudFront issues `504`/timeout errors at the **edge, before the request reaches
the worker** — so they are invisible to Cloudflare/worker logs. CloudFront's own
access logs are the only record. We use **Standard logging v2 → CloudWatch Logs**
(queryable with Logs Insights, no S3/Athena). Enabled on all 6 migrated dists by
**`infra/aws/setup-logging.sh`** (idempotent). Each dist → log group
`/cloudfront/<name>-pollinations`.

v2 logging is configured via the CloudWatch **delivery** API
(`delivery-source → delivery-destination → delivery`), NOT the distribution
config's `Logging` block — which is why it lives in the script, not the
`distribution-*.json` files.

Diagnostic fields delivered include `sc-status`, `x-edge-result-type`,
`x-edge-detailed-result-type` (`OriginCommError` = connect/read timeout;
`ClientCommError` = viewer hung up), `time-taken`, `time-to-first-byte`,
`cs-method`, `cs-uri-stem`, and `x-edge-location` (POP — lets you tell whether
connect-timeouts cluster on one CloudFront edge's path to Cloudflare).
Reading 504s: `~10s` time-taken = connection-establishment timeout; `~180s` =
read timeout.
