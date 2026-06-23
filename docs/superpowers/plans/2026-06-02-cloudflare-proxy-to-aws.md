# Cloudflare proxy → AWS (CloudFront) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Front `enter.pollinations.ai` and `gen.pollinations.ai` with per-host AWS CloudFront distributions (replacing the legacy thomash@ Cloudflare proxy Worker for these two hosts), preserving headers/client-IP/WebSocket/SSE parity, so the legacy account can later be downgraded without outage.

**Architecture:** One plain CloudFront distribution per host → origin `<sub>.myceli.ai` (stays on Cloudflare). A shared **custom origin-request policy** (`allViewerAndWhitelistCloudFront` + `CloudFront-Viewer-Address`) drops the viewer Host (so CloudFront sends `Host: <sub>.myceli.ai`) and forwards the real client IP. Static origin custom headers set `X-Forwarded-Host`/`X-Forwarded-Proto`. One backend change makes `getRealClientIp` read `CloudFront-Viewer-Address`. No edge functions, no Lambda@Edge, no new AWS features.

**Tech Stack:** AWS CLI (`--profile admin`, account `<AWS_ACCOUNT_ID>`, us-east-1) for CloudFront/ACM; Cloudflare API tokens (in `enter.pollinations.ai/.testingtokens`) for DNS; TypeScript/Hono (`shared/`); vitest (CF Workers pool) in `gen.pollinations.ai`.

**Spec:** `docs/superpowers/specs/2026-06-02-cloudflare-proxy-to-aws-design.md`

---

## File Structure

- `shared/client-ip.ts` — MODIFY: add `CloudFront-Viewer-Address` branch to `getRealClientIp`. The single backend code change.
- `gen.pollinations.ai/test/client-ip.test.ts` — CREATE: unit tests for `getRealClientIp` (no test exists today; `shared/` has no test runner, so the test lives in a consuming service that has the `@shared/*` alias + vitest).
- `infra/aws/` — CREATE (CLI-driven JSON configs, committed for reproducibility):
  - `origin-request-policy.json` — the shared custom policy config.
  - `distribution-enter.json`, `distribution-gen.json` — per-host distribution configs.
  - `README.md` — the exact CLI runbook (create cert, create policy, create dists, cutover, rollback, teardown).

No IaC framework exists in the repo; provisioning is CLI + committed JSON, matching the repo's existing convention (no Terraform/CDK present).

---

## Task 1: Backend client-IP parity (`CloudFront-Viewer-Address`)

**Files:**
- Modify: `shared/client-ip.ts:14-21`
- Test: `gen.pollinations.ai/test/client-ip.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `gen.pollinations.ai/test/client-ip.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { Context } from "hono";
import { getRealClientIp } from "@shared/client-ip.ts";

/**
 * Minimal Hono Context stub: getRealClientIp only reads request headers and
 * (via hasTrustedProxyHeaders) the request URL host. Headers are case-insensitive.
 */
function ctx(url: string, headers: Record<string, string>): Context {
    const lower: Record<string, string> = {};
    for (const [k, v] of Object.entries(headers)) lower[k.toLowerCase()] = v;
    return {
        req: {
            url,
            header: (name: string) => lower[name.toLowerCase()],
        },
    } as unknown as Context;
}

const TRUSTED = {
    // req host gen.myceli.ai + X-Forwarded-Host gen.pollinations.ai => trusted pair
    url: "https://gen.myceli.ai/v1/chat/completions",
    xfh: "gen.pollinations.ai",
};

describe("getRealClientIp", () => {
    it("uses CloudFront-Viewer-Address (stripping :port) when trusted", () => {
        const c = ctx(TRUSTED.url, {
            "x-forwarded-host": TRUSTED.xfh,
            "cloudfront-viewer-address": "46.142.212.69:60063",
            "cf-connecting-ip": "10.0.0.1",
        });
        expect(getRealClientIp(c)).toBe("46.142.212.69");
    });

    it("handles IPv6 CloudFront-Viewer-Address (splits on last colon)", () => {
        const c = ctx(TRUSTED.url, {
            "x-forwarded-host": TRUSTED.xfh,
            "cloudfront-viewer-address": "2001:db8::1:54321",
        });
        expect(getRealClientIp(c)).toBe("2001:db8::1");
    });

    it("prefers CloudFront-Viewer-Address over x-original-client-ip when both present", () => {
        const c = ctx(TRUSTED.url, {
            "x-forwarded-host": TRUSTED.xfh,
            "cloudfront-viewer-address": "203.0.113.5:1111",
            "x-original-client-ip": "198.51.100.9",
        });
        expect(getRealClientIp(c)).toBe("203.0.113.5");
    });

    it("falls back to x-original-client-ip (Cloudflare proxy path) when no CF header", () => {
        const c = ctx(TRUSTED.url, {
            "x-forwarded-host": TRUSTED.xfh,
            "x-original-client-ip": "198.51.100.9",
        });
        expect(getRealClientIp(c)).toBe("198.51.100.9");
    });

    it("ignores CloudFront-Viewer-Address on an UNTRUSTED host (anti-spoof)", () => {
        // Direct *.myceli.ai hit with NO matching X-Forwarded-Host => untrusted.
        const c = ctx("https://gen.myceli.ai/v1/chat/completions", {
            "cloudfront-viewer-address": "9.9.9.9:1234",
            "cf-connecting-ip": "10.0.0.1",
        });
        expect(getRealClientIp(c)).toBe("10.0.0.1");
    });

    it("returns 'unknown' when nothing is present", () => {
        const c = ctx("https://gen.myceli.ai/x", {});
        expect(getRealClientIp(c)).toBe("unknown");
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd gen.pollinations.ai && npx vitest run test/client-ip.test.ts`
Expected: FAIL — the `CloudFront-Viewer-Address` and IPv6 cases fail (current code never reads that header).

- [ ] **Step 3: Implement the minimal change**

Modify `shared/client-ip.ts` — replace the body of `getRealClientIp` (lines 14-21) with:

```ts
export function getRealClientIp(c: Context): string {
    if (hasTrustedProxyHeaders(c)) {
        // CloudFront-fronted hits (AWS migration): real viewer IP arrives in
        // CloudFront-Viewer-Address as "IP:port" (IPv4) or "<ipv6>:port".
        // Split on the LAST colon so IPv6 addresses survive intact.
        const cfViewerAddr = c.req.header("cloudfront-viewer-address");
        if (cfViewerAddr) {
            const i = cfViewerAddr.lastIndexOf(":");
            const ip = i === -1 ? cfViewerAddr : cfViewerAddr.slice(0, i);
            if (ip) return ip;
        }
        // Cloudflare-proxy path (legacy pollinations-myceli-proxy).
        const originalIp = c.req.header("x-original-client-ip");
        if (originalIp) return originalIp;
    }

    return c.req.header("cf-connecting-ip") || "unknown";
}
```

Also update the doc comment above the function (lines 4-13) to mention the CloudFront path:

```ts
/**
 * Resolve the real visitor IP. The worker can be reached three ways:
 * - via AWS CloudFront (AWS migration): real viewer IP is in CloudFront-Viewer-Address ("IP:port").
 * - via the legacy pollinations-myceli-proxy (old Cloudflare account): IP is in X-Original-Client-IP.
 * - directly (e.g. *.myceli.ai): only CF-Connecting-IP is present and already correct.
 * Forwarded headers are trusted only on a matching host-pair (hasTrustedProxyHeaders).
 */
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd gen.pollinations.ai && npx vitest run test/client-ip.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Format + commit**

```bash
npx biome check --write shared/client-ip.ts gen.pollinations.ai/test/client-ip.test.ts
git add shared/client-ip.ts gen.pollinations.ai/test/client-ip.test.ts
git commit -m "feat(client-ip): read CloudFront-Viewer-Address for AWS-fronted requests"
```

---

## Task 2: ACM certificate (shared, us-east-1)

**Files:**
- Create: `infra/aws/README.md` (runbook; append the cert section)

- [ ] **Step 1: Request the certificate**

Run:

```bash
aws acm request-certificate --profile admin --region us-east-1 \
  --domain-name pollinations.ai \
  --subject-alternative-names '*.pollinations.ai' \
  --validation-method DNS \
  --query CertificateArn --output text
```

Save the printed ARN. Expected: an `arn:aws:acm:us-east-1:<AWS_ACCOUNT_ID>:certificate/...`.

- [ ] **Step 2: Get the DNS validation record**

Run:

```bash
aws acm describe-certificate --profile admin --region us-east-1 \
  --certificate-arn <ARN> \
  --query 'Certificate.DomainValidationOptions[0].ResourceRecord' --output json
```

Expected: a `{Name, Type: CNAME, Value}` to add to the `pollinations.ai` Cloudflare zone.

- [ ] **Step 3: Add the validation CNAME to Cloudflare (DNS-only)**

Using the WRITE token + zone id from `enter.pollinations.ai/.testingtokens`:

```bash
ZONE=<POLLINATIONS_ZONE_ID>
TOKEN=<CLOUDFLARE_API_TOKEN_WRITE from .testingtokens>
curl -s -X POST "https://api.cloudflare.com/client/v4/zones/$ZONE/dns_records" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  --data '{"type":"CNAME","name":"<validation Name>","content":"<validation Value>","proxied":false,"ttl":300}'
```

Expected: `"success": true`.

- [ ] **Step 4: Wait for validation**

Run: `aws acm wait certificate-validated --profile admin --region us-east-1 --certificate-arn <ARN>`
Expected: returns when status is `ISSUED` (minutes). Verify:
`aws acm describe-certificate --profile admin --region us-east-1 --certificate-arn <ARN> --query 'Certificate.Status' --output text` → `ISSUED`.

- [ ] **Step 5: Record the ARN in the runbook + commit**

Append the cert ARN to `infra/aws/README.md`, then:

```bash
git add infra/aws/README.md
git commit -m "docs(infra): record ACM cert for pollinations.ai"
```

---

## Task 3: Shared custom origin-request policy

**Files:**
- Create: `infra/aws/origin-request-policy.json`

- [ ] **Step 1: Write the policy config**

Create `infra/aws/origin-request-policy.json`:

```json
{
  "Name": "pln-proxy-allviewer-plus-viewer-address",
  "Comment": "Drops viewer Host (CloudFront sends origin Host=<sub>.myceli.ai) and forwards CloudFront-Viewer-Address for real client IP.",
  "HeadersConfig": {
    "HeaderBehavior": "allViewerAndWhitelistCloudFront",
    "Headers": { "Quantity": 1, "Items": ["CloudFront-Viewer-Address"] }
  },
  "CookiesConfig": { "CookieBehavior": "all" },
  "QueryStringsConfig": { "QueryStringBehavior": "all" }
}
```

Note: `allViewerAndWhitelistCloudFront` forwards all viewer headers **plus** the whitelisted CloudFront-generated header. CloudFront still applies the distribution's behavior; Host is handled because CloudFront sets the origin domain as Host when the viewer Host is not explicitly forwarded by this mode for the origin. (Verified empirically: origin received `Host: <origin-domain>` and `CloudFront-Viewer-Address` with the real IP.)

- [ ] **Step 2: Create the policy**

Run:

```bash
aws cloudfront create-origin-request-policy --profile admin \
  --origin-request-policy-config file://infra/aws/origin-request-policy.json \
  --query 'OriginRequestPolicy.Id' --output text
```

Save the printed policy Id. Expected: a UUID.

- [ ] **Step 3: Verify**

Run: `aws cloudfront get-origin-request-policy --profile admin --id <policyId> --query 'OriginRequestPolicy.OriginRequestPolicyConfig.HeadersConfig' --output json`
Expected: `HeaderBehavior: allViewerAndWhitelistCloudFront`, Items include `CloudFront-Viewer-Address`.

- [ ] **Step 4: Commit**

```bash
git add infra/aws/origin-request-policy.json
git commit -m "feat(infra): shared CloudFront origin-request policy (viewer-address + drop host)"
```

---

## Task 4: `gen` CloudFront distribution (build + verify, NOT cut over)

**Files:**
- Create: `infra/aws/distribution-gen.json`

`gen` first (lower auth-risk than `enter`). Built and verified against the `*.cloudfront.net` domain BEFORE any DNS change.

- [ ] **Step 1: Write the distribution config**

Create `infra/aws/distribution-gen.json` (fill `<CERT_ARN>`, `<POLICY_ID>`; `CallerReference` must be unique):

```json
{
  "CallerReference": "pln-gen-2026-06-02",
  "Aliases": { "Quantity": 1, "Items": ["gen.pollinations.ai"] },
  "Comment": "Proxy for gen.pollinations.ai -> gen.myceli.ai",
  "Enabled": true,
  "Origins": {
    "Quantity": 1,
    "Items": [{
      "Id": "gen-myceli",
      "DomainName": "gen.myceli.ai",
      "CustomOriginConfig": {
        "HTTPPort": 80, "HTTPSPort": 443,
        "OriginProtocolPolicy": "https-only",
        "OriginSslProtocols": { "Quantity": 1, "Items": ["TLSv1.2"] },
        "OriginReadTimeout": 60, "OriginKeepaliveTimeout": 5
      },
      "CustomHeaders": {
        "Quantity": 2,
        "Items": [
          { "HeaderName": "X-Forwarded-Host", "HeaderValue": "gen.pollinations.ai" },
          { "HeaderName": "X-Forwarded-Proto", "HeaderValue": "https" }
        ]
      }
    }]
  },
  "DefaultCacheBehavior": {
    "TargetOriginId": "gen-myceli",
    "ViewerProtocolPolicy": "redirect-to-https",
    "AllowedMethods": {
      "Quantity": 7,
      "Items": ["GET","HEAD","OPTIONS","PUT","POST","PATCH","DELETE"],
      "CachedMethods": { "Quantity": 2, "Items": ["GET","HEAD"] }
    },
    "Compress": false,
    "CachePolicyId": "4135ea2d-6df8-44a3-9df3-4b5a84be39ad",
    "OriginRequestPolicyId": "<POLICY_ID>"
  },
  "ViewerCertificate": {
    "ACMCertificateArn": "<CERT_ARN>",
    "SSLSupportMethod": "sni-only",
    "MinimumProtocolVersion": "TLSv1.2_2021"
  },
  "PriceClass": "PriceClass_All"
}
```

- [ ] **Step 2: Create the distribution**

Run:

```bash
aws cloudfront create-distribution --profile admin \
  --distribution-config file://infra/aws/distribution-gen.json \
  --query '{Id:Distribution.Id,Domain:Distribution.DomainName}' --output json
```

Save `Id` and `Domain` (`<gen-dist>.cloudfront.net`). Then:
`aws cloudfront wait distribution-deployed --profile admin --id <Id>`

- [ ] **Step 3: Verify behavior against the CloudFront domain (no DNS change yet)**

The Aliases include `gen.pollinations.ai`, but DNS still points at the Worker — so test with a forced Host via the resolved CloudFront IP, or test the cloudfront.net domain directly for non-Host-sensitive checks:

```bash
# a) Reaches origin (expect a gen response, NOT 502). If 502, debug CF->Cloudflare egress before proceeding.
curl -s -o /dev/null -w "GET / -> %{http_code}\n" "https://<gen-dist>.cloudfront.net/"
# b) SSE streams (authed key from .testingtokens), chunks incremental:
KEY=$(grep '^ENTER_API_TOKEN_REMOTE=' enter.pollinations.ai/.testingtokens | cut -d= -f2- | tr -d '"')
curl -sN --max-time 30 -X POST "https://<gen-dist>.cloudfront.net/v1/chat/completions" \
  -H "Authorization: Bearer $KEY" -H "content-type: application/json" \
  -d '{"model":"openai","messages":[{"role":"user","content":"count 1 to 5"}],"stream":true}' | head
# c) WebSocket upgrade reaches origin (expect 401 auth, NOT 426 — proves Upgrade survived):
python3 -c "import asyncio,websockets;\
asyncio.run((lambda u: websockets.connect(u))('wss://<gen-dist>.cloudfront.net/v1/realtime?model=gpt-realtime-2'))" 2>&1 | head -3 || true
```

Expected: (a) a normal gen status (not 502), (b) incremental `data:` chunks, (c) a 401/handshake error proving the upgrade reached origin (not a 426).

If (a) is a persistent 502: this is the known CloudFront→Cloudflare egress quirk — **STOP and resolve before cutover** (it succeeded in earlier WS/SSE runs; retry, confirm origin health, check OriginSslProtocols/timeouts).

- [ ] **Step 4: Commit the config**

```bash
git add infra/aws/distribution-gen.json
git commit -m "feat(infra): gen.pollinations.ai CloudFront distribution"
```

---

## Task 5: Cut over `gen` DNS (reversible)

**Files:** none (DNS operations; record outcome in `infra/aws/README.md`).

Today `gen.pollinations.ai` is a proxied `AAAA 100::` Worker custom-domain binding. Cutover = release the binding, then point a DNS-only CNAME at CloudFront.

- [ ] **Step 1: Snapshot current DNS (for rollback)**

```bash
ZONE=<POLLINATIONS_ZONE_ID>
TOKEN=<CLOUDFLARE_API_TOKEN_WRITE>
curl -s -H "Authorization: Bearer $TOKEN" \
  "https://api.cloudflare.com/client/v4/zones/$ZONE/dns_records?name=gen.pollinations.ai" | tee /tmp/gen-dns-before.json
```

Save `/tmp/gen-dns-before.json` (record id, type, content, proxied). Expected: the `AAAA 100::` proxied record.

- [ ] **Step 2: Remove the Worker custom-domain binding for `gen.pollinations.ai`**

The binding lives on the `pollinations-proxy` Worker in the OLD account. Using the old-account access (the `.testingtokens` CF tokens reach account `<LEGACY_CF_ACCOUNT_ID>`), remove the custom domain `gen.pollinations.ai` from the `pollinations-proxy` Worker. (A hostname can be owned by only one CF service; this must happen before Cloudflare will release it.) Verify the custom domain no longer lists `gen.pollinations.ai`.

If the tokens lack Workers-edit scope, this single step is done by the user in the Cloudflare dashboard (Workers → pollinations-proxy → Custom Domains → remove `gen.pollinations.ai`). Surface via `show` if blocked.

- [ ] **Step 3: Replace the DNS record with a DNS-only CNAME to CloudFront**

```bash
REC=<record id from step 1>
# delete the AAAA 100:: record
curl -s -X DELETE "https://api.cloudflare.com/client/v4/zones/$ZONE/dns_records/$REC" \
  -H "Authorization: Bearer $TOKEN"
# create DNS-only (grey cloud) CNAME -> CloudFront
curl -s -X POST "https://api.cloudflare.com/client/v4/zones/$ZONE/dns_records" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  --data '{"type":"CNAME","name":"gen.pollinations.ai","content":"<gen-dist>.cloudfront.net","proxied":false,"ttl":300}'
```

Expected: both `"success": true`. **`proxied` MUST be false** (CloudFront owns TLS; an orange-cloud record would double-proxy and break SNI).

- [ ] **Step 4: Verify the live public host serves from CloudFront**

```bash
# served via CloudFront:
curl -s -i "https://gen.pollinations.ai/" | grep -iE "^HTTP|via:|x-cache" | head
# real client IP flows (check a gen log / rate-limit path reflects the true IP, not a CF egress IP)
# SSE + WS as in Task 4 but against gen.pollinations.ai
```

Expected: `via: ...cloudfront.net`; SSE + WS work; logs show real client IPs.

- [ ] **Step 5: Record outcome**

Append the gen cutover result + timestamp to `infra/aws/README.md` and commit.

**Rollback (if any check fails):** re-add the `gen.pollinations.ai` custom domain to the `pollinations-proxy` Worker, delete the CNAME, recreate the `AAAA 100::` proxied record from `/tmp/gen-dns-before.json`.

---

## Task 6: `enter` distribution + cutover (auth/billing — last, most careful)

**Files:**
- Create: `infra/aws/distribution-enter.json`

Identical pattern to `gen`, but `enter` carries OAuth/billing — verify a full login round-trip. `BETTER_AUTH_URL` is hardcoded to `https://enter.pollinations.ai`, so callbacks stay host-anchored.

- [ ] **Step 1: Write `infra/aws/distribution-enter.json`**

Copy `distribution-gen.json` and change: `CallerReference` → `pln-enter-2026-06-02`; `Aliases.Items` → `["enter.pollinations.ai"]`; `Comment` → enter; origin `Id` → `enter-myceli`, `DomainName` → `enter.myceli.ai`; the `X-Forwarded-Host` CustomHeader value → `enter.pollinations.ai`. Keep the same `CachePolicyId`, `<POLICY_ID>`, `<CERT_ARN>`.

- [ ] **Step 2: Create + wait + verify (same as Task 4 Step 2-3, against `<enter-dist>.cloudfront.net`)**

```bash
aws cloudfront create-distribution --profile admin \
  --distribution-config file://infra/aws/distribution-enter.json \
  --query '{Id:Distribution.Id,Domain:Distribution.DomainName}' --output json
aws cloudfront wait distribution-deployed --profile admin --id <Id>
curl -s -o /dev/null -w "GET / -> %{http_code}\n" "https://<enter-dist>.cloudfront.net/"
```

Expected: not a 502 (resolve egress quirk if so). `enter` is mostly HTTP/JSON (no WS); verify a normal API path responds.

- [ ] **Step 3: Commit the config**

```bash
git add infra/aws/distribution-enter.json
git commit -m "feat(infra): enter.pollinations.ai CloudFront distribution"
```

- [ ] **Step 4: Cut over `enter` DNS (same procedure as Task 5, with enter values)**

Snapshot → remove `enter.pollinations.ai` Worker custom-domain binding → delete `AAAA 100::` → create DNS-only CNAME → `<enter-dist>.cloudfront.net`.

- [ ] **Step 5: Verify auth round-trip (the decisive enter check)**

```bash
curl -s -i "https://enter.pollinations.ai/" | grep -iE "^HTTP|via:" | head
```
Then in a browser: complete a full OAuth login at `https://enter.pollinations.ai` (GitHub sign-in → callback → authenticated session). Confirm the callback lands on `enter.pollinations.ai`, billing/API-key pages load, and a generated key works. Surface the result via `show` for user confirmation.

Expected: `via: ...cloudfront.net`; login + callback + key issuance all succeed.

**Rollback:** same as Task 5 (re-bind to Worker, restore `AAAA 100::`).

- [ ] **Step 6: Record outcome + commit**

Append enter cutover result to `infra/aws/README.md` and commit.

---

## Task 7: Runbook + stabilization (no decommission this phase)

**Files:**
- Modify: `infra/aws/README.md` (finalize the runbook)

- [ ] **Step 1: Finalize `infra/aws/README.md`**

Document, with the real IDs/ARNs filled in: cert ARN, policy Id, both distribution Ids + domains, the create/cutover/rollback/teardown commands, and the **hard rule** that the `pollinations-proxy` Worker stays live (it still serves the other ~18 hosts) and the account is **NOT** downgraded in this phase.

- [ ] **Step 2: Soak check (after ~1 day stable)**

Confirm `enter` + `gen` remain healthy via CloudFront (logs show real client IPs, error rates flat, WS/SSE/auth working). Only then remove `enter`/`gen` from the Worker's `UPSTREAM_MAP`/routes in a follow-up (separate change — not in this plan).

- [ ] **Step 3: Commit the runbook**

```bash
git add infra/aws/README.md
git commit -m "docs(infra): CloudFront proxy runbook for enter + gen"
```

---

## Self-Review

**Spec coverage:**
- Per-host plain distribution, origin `<sub>.myceli.ai` → Tasks 4, 6 ✓
- Custom origin-request policy (`allViewerAndWhitelistCloudFront` + `CloudFront-Viewer-Address`) → Task 3 ✓
- Static `X-Forwarded-Host`/`X-Forwarded-Proto` → Tasks 4/6 origin CustomHeaders ✓
- `shared/client-ip.ts` change + tests → Task 1 ✓
- ACM cert `pollinations.ai` + `*.pollinations.ai` → Task 2 ✓
- WS + SSE verification → Task 4 Step 3 ✓
- Reversible per-host cutover, gen first / enter last, OAuth verify → Tasks 5, 6 ✓
- Migrate-before-downgrade / worker stays live → Task 7 ✓
- CF→Cloudflare 502 risk gate → Task 4 Step 3, Task 6 Step 2 ✓
- Anti-spoof (trust gate unchanged) → Task 1 untrusted-host test ✓

**Placeholder scan:** `<ARN>`, `<POLICY_ID>`, `<gen-dist>` etc. are runtime-discovered IDs (created in earlier steps), not unspecified logic — each has an explicit "save the printed value" step. No TODO/TBD/vague-logic placeholders.

**Type consistency:** `getRealClientIp(c: Context): string` signature unchanged; test imports it from `@shared/client-ip.ts` (alias verified in both services' tsconfig). Header name `cloudfront-viewer-address` (lowercase) matches Hono's case-insensitive `c.req.header`.
