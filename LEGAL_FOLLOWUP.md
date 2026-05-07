# Legal Compliance Follow-Up Work

Updated: 2026-05-07

This tracks legal/compliance work that is not fully done by the current PR split.

Current PR split:

- `#10725` - legal docs plus legal markdown heading anchors.
- `#10748` - 30-day generated-cache HTTP headers and media/API docs.

Do not treat the public legal docs as fully ready until the blocking items below
are complete or explicitly accepted by the owner.

## Blocking Before Legal Docs Are Ready

### Merge or coordinate the dependent cache PR

- `#10748` must land before the docs rely on 30-day generated-cache HTTP headers.
- If `#10748` is delayed, update the legal docs to avoid promising that behavior.

### Apply 30-day R2 lifecycle rules

Privacy §9 says generated response caches and uploaded media are typically kept up
to 30 days in R2/downstream caches. `#10748` updates HTTP headers and docs, but
R2 object deletion is an external Cloudflare bucket setting.

Buckets, account `efdcb0933eaac64f27c0b295039b28f2`:

- `pollinations-images` - replace existing `cleanup-14days` rule with 30 days.
- `pollinations-text-enter` - add 30-day expiry rule.
- `pollinations-media` - add 30-day expiry rule.

Operator steps:

```bash
export CLOUDFLARE_ACCOUNT_ID=efdcb0933eaac64f27c0b295039b28f2
npx wrangler r2 bucket lifecycle list pollinations-images
npx wrangler r2 bucket lifecycle list pollinations-text-enter
npx wrangler r2 bucket lifecycle list pollinations-media

npx wrangler r2 bucket lifecycle remove pollinations-images --name cleanup-14days
npx wrangler r2 bucket lifecycle add pollinations-images expire-30d "" --expire-days 30
npx wrangler r2 bucket lifecycle add pollinations-text-enter expire-30d "" --expire-days 30
npx wrangler r2 bucket lifecycle add pollinations-media expire-30d "" --expire-days 30

npx wrangler r2 bucket lifecycle list pollinations-images
npx wrangler r2 bucket lifecycle list pollinations-text-enter
npx wrangler r2 bucket lifecycle list pollinations-media
```

Capture the before/after command output in the relevant PR or issue. Cloudflare
notes that lifecycle changes apply at bucket level and existing objects can take
time to reflect new rules.

Dashboard fallback: R2 -> bucket -> Settings -> Object lifecycle rules -> add a
30-day delete rule named `expire-30d` for all prefixes.

### Legal owner signoff for consumer-withdrawal wording

The public Refunds/Terms wording touches EU/EEA consumer withdrawal rights for
digital content/services. The current docs intentionally do **not** claim that
Stripe Checkout collects a separate immediate-delivery waiver. Before
publication, get explicit signoff from the legal owner/counsel on:

- Refunds §4 and Terms §7 consumer-withdrawal wording.
- The choice to review any non-waived statutory withdrawal-right requests under
  applicable law rather than adding a Stripe Checkout checkbox in this PR.
- Whether a future one-time Pollen checkout consent PR is required.

Reference: European Commission Consumer Rights Directive materials:
https://commission.europa.eu/law/law-topic/consumer-protection-law/consumer-contract-law/consumer-rights-directive_en

## High-Priority Follow-Ups

### Optional Stripe Checkout immediate-delivery consent

- **Files:** future follow-up to `enter.pollinations.ai/src/routes/stripe.ts`,
  `enter.pollinations.ai/src/routes/stripe-webhooks.ts`, tests, and public legal
  docs if the wording changes.
- **What:** If the legal owner decides Pollinations should collect an explicit
  immediate-delivery waiver for one-time Pollen purchases, add a separate PR that:
  - creates versioned consent text for one-time Pollen purchases;
  - sets `consent_collection.terms_of_service = "required"` and
    `custom_text.terms_of_service_acceptance.message` on Stripe Checkout Sessions;
  - stores the consent version in Checkout Session metadata;
  - verifies `session.consent.terms_of_service = "accepted"` before crediting new
    sessions;
  - verifies Stripe public Terms/Privacy URLs and test/live Checkout UX; and
  - updates Terms/Refunds/Privacy to say checkout consent is collected.
- **Why:** Current public legal docs no longer promise this checkbox, so this
  should not block the legal-doc PR. If added later, Stripe is the proof source
  and Tinybird can mirror the Stripe event. This is separate from any future
  auto-topup/off-session charge consent.

### Move the 20% developer-share disclosure out of the tooltip

- **File:** `enter.pollinations.ai/src/client/components/auth/app-attribution.tsx`
- **What:** The "20% of what you spend in this app goes to the developer" line
  currently lives in the `InfoTip`. Move it into visible body text between the
  GitHub byline and `redirectHostname`, conditional on
  `attribution.found && attribution.earningsEnabled`.
- **Affects:** Pre-login and post-login `/authorize` modal, plus device-mode
  flow. They share this component.
- **Why:** Terms §6 says we show the app share before authorization. The tooltip
  is defensible, but visible text is clearer, better on touch devices, and easier
  to defend as pre-authorization disclosure.

### Maintain a named subprocessor inventory and notice process

- **Where:** internal ops/legal docs, not public repo unless approved.
- **What:** Keep the full named subprocessor list that the public Terms/Privacy
  say is available on request. Include owner, category, region, data touched,
  SCC/DPA status, and material-change notice date.
- **Why:** Terms §15 and Privacy §7 now say categories are public, the full named
  list is available on request, and material changes get at least 14 days' prior
  notice. That promise needs an owner and a maintained source of truth.

### Refund/dispute reversal runbook

- **Where:** support docs or `.claude/skills/provider-billing/`. Do not put the
  operational runbook in `AGENTS.md`.
- **What:** Manual procedure for reviewing and reversing Pollen, credits,
  benefits, and developer earnings after refunds, chargebacks, fraud, abuse,
  pricing errors, or self-crediting.
- **Why:** Refunds §3/§6 and Terms §7 say reversals may be manually reviewed and
  reversed or adjusted. The manual process should be executable by support.

### Privacy-rights and account-deletion runbook

- **Where:** support/admin docs.
- **What:** Define how to handle access, deletion, restriction, portability, and
  objection requests. Include D1, Tinybird, Stripe, R2 caches/media, support
  tickets, and legal-retention exceptions.
- **Why:** Privacy §10 grants these rights, and Privacy §9 says account deletion
  removes personal data within 30 days except where legal retention applies.

## Code Follow-Ups

### Stronger data minimization in the analytics warehouse

- **Files:** `enter.pollinations.ai/src/scheduled/d1-tinybird-sync.ts`,
  `enter.pollinations.ai/src/routes/stripe-webhooks.ts`
  (`sendStripeEventToTinybird`), Tinybird datasource schemas.
- **Current state:** Privacy §2 discloses the current analytics datasource,
  including replicated emails, names, GitHub identity, API key metadata, session
  user agent, and Stripe payloads.
- **What:** Do a field-by-field minimization pass before changing code. Candidate
  reductions:
  - `d1_user`: remove/hash `name`, `email`, `image`, `github_id`,
    `github_username` unless a specific dashboard needs them.
  - `d1_apikey`: review `name`, `prefix`, `permissions`, `metadata`, and usage
    counters; remove or hash anything not needed for reporting.
  - `d1_session`: remove or coarse-grain `user_agent`.
  - `d1_account`: remove/hash external `account_id` and provider identifiers
    where possible.
  - `stripe_event`: redact top-level `customer_email` and email/name/address
    fields inside the raw `payload` string if we keep storing payloads.
- **Why:** Current docs disclose the behavior, so this is not a live mismatch.
  It is the path toward removing the explicit PII disclosure later.

### Account-deletion sweep across Tinybird append-only datasources

- **Files:** account deletion/support flow, Tinybird delete calls, and related
  datasource/materialized-view definitions.
- **Discovery:** There is no obvious self-service account deletion path in
  `enter.pollinations.ai/src`; first define the support/admin trigger.
- **What:** On approved deletion, remove or anonymize user-linked rows from
  append-only datasources such as `generation_event`, `stripe_event`,
  `tier_event`, `polar_event`, and `crypto_event`, subject to legal retention.
- **Caution:** Tinybird datasource deletes do not cascade into dependent
  materialized views/datasources. Audit dependents before claiming deletion is
  complete.
- **Reference:** Tinybird datasource API:
  https://www.tinybird.co/docs/api-reference/datasource-api

### Hash-only generated-media R2 cache keys

- **File:** `gen.pollinations.ai/src/utils/media-cache.ts`
- **Current state:** `generateCacheKey()` stores a sanitized prompt/path prefix
  plus hash in R2 object keys.
- **What:** Move to a hash-only key format, for example `media-v2/<hash>`, and
  avoid embedding prompt-derived path segments in object keys.
- **Why:** Privacy §2 already discloses prompt-derived cache identifiers, so this
  is hardening. It becomes more important for erasure requests and support
  reviews where object keys may be visible.

### Image metadata `prepareMetadata` audit

- **File:** `gen.pollinations.ai/src/image/createAndReturnImages.ts`
  (`prepareMetadata`).
- **What:** Generated image files currently embed `prompt` and `originalPrompt`
  in their metadata (EXIF / PNG text chunks). Audit whether they need to ship
  inside the image binary; if not, remove.
- **Why:** Privacy §2 already discloses generically that "image metadata may
  include prompt-derived data," so this is hardening. Becomes important for
  erasure requests where image metadata may be enumerated alongside cache keys.

### BYOP preflight cost check including 25% markup

- **File:** `gen.pollinations.ai/src/utils/generation-access.ts`
- **What:** Preflight gates against raw `estimatedCost`; actual billing can
  charge baseline plus 25% app markup. Users with balance between `baseline` and
  `baseline * 1.25` can pass preflight then go negative.
- **Why:** Terms §6 says final usage may exceed the preflight estimate, so this
  is billing correctness rather than a current legal-doc mismatch.

### Automated refund/dispute reversal

- **Files:** `enter.pollinations.ai/src/routes/stripe-webhooks.ts`, shared
  billing helpers, tests.
- **Current state:** Refund events are ingested to Tinybird, but Pollen and
  developer-earnings reversal is manual.
- **What:** Add automated or semi-automated handling for `refund.*` and
  `charge.dispute.*` events after the manual runbook exists.
- **Why:** Manual processing is acceptable under the current wording, but
  automation reduces support risk and inconsistent outcomes.

### Auto-topup consent flow if recurring/off-session charges are added

- **Where:** future dashboard auto-topup UI and Stripe setup flow.
- **What:** Add a separate `AUTO_TOPUP_CONSENT_VERSION` and consent text for
  recurring/off-session charging. Do not reuse the one-time Pollen purchase
  consent unchanged.
- **Why:** One-time checkout consent, if added later, would only cover manual
  purchases. Auto-topup needs its own saved-payment-method and off-session charge
  authorization.

### Self-service media delete and owner index for `media.pollinations.ai`

- **Files:** `media.pollinations.ai/src/index.ts`, plus new auth/owner-index
  schema.
- **What:** Add an authenticated delete endpoint and a per-user object index.
  Today the service is content-addressed by hash with no delete endpoint and
  no per-user listing.
- **Why:** Privacy §10 erasure requests for uploaded media currently rely on
  manual R2 deletion via support plus the 30-day TTL eventually expiring
  objects. Becomes blocking if `media.pollinations.ai` graduates to a
  paid/core feature, or if erasure traffic grows.

### Region-aware EU-only dispatch (only if reintroducing "EU by default")

- **Files:** model/provider region registry; account/app `allowNonEEA` flag;
  dispatch gate in `gen.pollinations.ai`.
- **What:** Restore an "EU regions by default, non-EEA opt-in" routing
  capability.
- **Why:** Terms §15 was rewritten *away* from this promise to match current
  multi-region reality. Listed here so the option is not forgotten — it is
  product scope, not a current compliance gap.

### Customer IP capture for one-time Checkout (only if reintroducing IP-in-consent-record)

- **Files:** `enter.pollinations.ai/src/routes/stripe.ts`; D1 schema
  migrations.
- **What:** Capture customer IP at Checkout-Session creation time. Stripe does
  not surface customer IP via the session API, so it has to come from the
  request to our endpoint.
- **Why:** Refunds §4 dropped the "may store ... IP address" claim. If we ever
  want to reintroduce it, the capture path needs to exist. Stripe currently
  retains customer IP on their side via their request log.

## Ops Follow-Ups

### Apply Tinybird `ENGINE_TTL` for 24-month API metadata retention

- **Directory:** `enter.pollinations.ai/observability`
- **Datasources and timestamp columns:**
  - `generation_event`: `start_time + toIntervalMonth(24)`
  - `tier_event`: `timestamp + toIntervalMonth(24)`
  - `stripe_event`: `timestamp + toIntervalMonth(24)`
  - `polar_event`: `timestamp + toIntervalMonth(24)`
  - `crypto_event`: `timestamp + toIntervalMonth(24)`
- **Deadline:** target 2027-04-30. This gives buffer before the earliest
  production rows approach 24 months.
- **Pre-flight:** query `min(<timestamp_col>)` for each datasource. If any row is
  already older than 24 months, pause and decide whether destructive deletion is
  acceptable.
- **Deploy safety:** from `enter.pollinations.ai/observability`, run:

```bash
tb --cloud deploy --check --wait
tb --cloud deploy --wait
```

Never use `--allow-destructive-operations` without explicit approval.

Reference: Tinybird datasource files support `ENGINE_TTL`:
https://www.tinybird.co/docs/forward/dev-reference/datafiles/datasource-files

### D1 row-level retention cleanup

- **Where:** scheduled job or support/admin workflow.
- **What:** Define cleanup for expired sessions, expired API keys after any
  grace period, revoked app authorizations, and deleted-user data after legal
  retention periods.
- **Why:** Current company age makes long retention boundaries non-urgent, but
  the retention policy should eventually have routine enforcement.

## Process Follow-Ups

### Analytics-SDK release gate

- **Where:** release-process docs or CODEOWNERS/review rule for
  `pollinations.ai/package.json`.
- **What:** Any PR adding a non-essential analytics or marketing SDK such as
  PostHog or Google Analytics must include consent UI and footer/settings access.
- **Why:** Privacy §6 says only essential cookies/storage are used today and
  non-essential cookies/SDKs require consent first.

### Internal security runbook for upstream IdP 2FA

- **Where:** internal security docs.
- **What:** Document 2FA enforcement on GitHub, Cloudflare, Stripe, Polar, and
  other admin accounts.
- **Why:** Required before any future MFA/2FA claim is reintroduced to Privacy
  §11. The previous claim was removed because we could not back it operationally.

### Legal change checklist

- **Where:** PR template or internal release checklist.
- **What:** Any future PR that changes checkout terms, refunds, privacy,
  subprocessors, cookies/analytics, retention, or region routing must identify:
  code behavior, public-doc wording, operational dependency, owner signoff, and
  verification evidence.
- **Why:** Most risk in this pass came from legal docs and implementation drifting
  apart.
