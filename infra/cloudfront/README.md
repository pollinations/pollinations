# CloudFront: gen.pollinations.ai

AWS CloudFront in front of the `gen.pollinations.ai` Cloudflare Worker.

- **Account:** `301235909293` (CLI profile `admin`, region `us-east-1`)
- **Distribution:** `E35MFLKOJK04O7` — aliases `gen.pollinations.ai`, `gen-aws.pollinations.ai`
- **Origin:** `gen.myceli.ai` (Worker `pollinations-gen-production`)

```
viewer ──▶ CloudFront ──▶ Origin Shield (us-east-1) ──▶ gen.myceli.ai
             └─ viewer-request fn: pln-gen-viewer-ip (stamps real viewer IP)
```

**Origin Shield (us-east-1):** routes all origin fetches through IAD to avoid a
Cloudflare edge stall at East-Asia colos that hung requests (499/TTFB=0).
Rollback: `OriginShield.Enabled=false`.

**`pln-gen-viewer-ip`** (`gen-viewer-request.js`): Origin Shield collapses
viewers to shared `64.252.x` IPs, so this stamps the real `event.viewer.ip` into
`X-Original-Client-IP` at the edge. The Worker trusts it (see
`shared/client-ip.ts`); the function overwrites any client-spoofed value.

**Do not change the origin request policy** — `Managed-AllViewerExceptHostHeader`
keeps `Host: gen.myceli.ai` (Cloudflare routes on it) and forwards the injected
header.

**Logs** → CloudWatch `/cloudfront/gen-pollinations` + S3
`pollinations-cf-logs-301235909293`. ⚠️ contain `sk_`/`pk_` keys — keep restricted.

## Deploy the function

```bash
PROFILE=admin REGION=us-east-1 FN=pln-gen-viewer-ip

# update code + publish (create-function/associate only needed first time)
ETAG=$(aws cloudfront describe-function --name $FN --stage DEVELOPMENT \
  --profile $PROFILE --region $REGION --query ETag --output text)
aws cloudfront update-function --name $FN --if-match "$ETAG" \
  --function-config '{"Comment":"real viewer IP for gen.pollinations.ai","Runtime":"cloudfront-js-2.0"}' \
  --function-code fileb://infra/cloudfront/gen-viewer-request.js \
  --profile $PROFILE --region $REGION
ETAG=$(aws cloudfront describe-function --name $FN --stage DEVELOPMENT \
  --profile $PROFILE --region $REGION --query ETag --output text)
aws cloudfront publish-function --name $FN --if-match "$ETAG" \
  --profile $PROFILE --region $REGION
```

Associate (first time): add to distribution `DefaultCacheBehavior`:
`FunctionAssociations = {Quantity:1, Items:[{FunctionARN:.../function/pln-gen-viewer-ip, EventType:viewer-request}]}`.
