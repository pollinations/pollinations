# Staging Auto Top-Up — Test Plan & Runbook

Branch: `codex/stripe-portal-auto-top-up` · PR #10561 · Environment: **staging** (Stripe **sandbox** — no real money)

Test user: `fouchyelliot@gmail.com` · single reusable user, full-wiped before S1.

Tick each checkbox after the corresponding step is verified. Update `STATUS` lines with concrete IDs (`user.id`, `cus_…`, `in_…`, `pi_…`) as we go.

---

## Preflight — verified before S1

- [x] Migrations `0025_blue_banshee.sql` + `0026_youthful_surge.sql` applied to `staging-pollinations-enter-db`
- [x] `pollinations-enter-staging` deployed (includes all SCA / hard-auth + Thomas's simplification commits)
- [x] `pollinations-gen-staging` deployed (has `ENTER` service binding to `pollinations-enter-staging` + `PLN_ENTER_TOKEN`)
- [x] Staging Stripe mode = `sandbox` (confirmed on enter binding)
- [x] `PLN_ENTER_TOKEN` matches across `enter.pollinations.ai/secrets/staging.vars.json` and `gen.pollinations.ai/secrets/staging.vars.json`
- [x] `fouchyelliot@gmail.com` wiped from staging D1 (`user`, `account`, `session`, `apikey`, `stripe_auto_top_up_attempt` — all 0 rows)
- [x] Prior Stripe customer `cus_UVIFi9x4rgZgcK` deleted in sandbox (cascades detach PMs + void invoices)

## Observation channels

Open all four before starting S1.

- [ ] `npx wrangler tail pollinations-enter-staging --env staging` running
- [ ] `npx wrangler tail pollinations-gen-staging` running
- [ ] Stripe sandbox dashboard open at Developers → Events (filtered to the new `cus_…` once it exists)
- [ ] D1 snapshot helper ready: `wrangler d1 execute DB --remote --env staging --command "…" --config enter.pollinations.ai/wrangler.toml`
- [ ] staging.enter.pollinations.ai Pollen tab open in browser

## Captured identifiers

Fill in as we discover them.

- `user.id` (new): `ZBFTtv6Nywso2fdU7k9ko6ZusZn4Y1eg`
- `stripe_customer_id`: `cus_UVKARufy9WGNL3`
- Default `payment_method` ids: `pm_1TWJWb6O03AauPe8oZt60L8p` (Visa •• 4242)
- Notable `invoice` ids: _________________________________
- Notable `payment_intent` ids: _________________________________

---

## S1 — Sign in & baseline snapshot

**Goal:** fresh user row exists, no Stripe customer, no auto top-up state.

**Action (you):** Sign in to staging.enter.pollinations.ai via GitHub OAuth as `fouchyelliot@gmail.com`.

- [x] D1: new `user` row exists — `id = ZBFTtv6Nywso2fdU7k9ko6ZusZn4Y1eg`
- [x] D1: `pack_balance = NULL`
- [x] D1: `auto_top_up_enabled = 0`, `auto_top_up_amount_usd = NULL`, `stripe_customer_id = NULL`
- [x] D1: `stripe_auto_top_up_attempt` rows for this user = 0
- [ ] UI: Pollen tab loads, "Auto top-up" panel shows disabled / "Add a payment method to enable"

**Pass criteria:** user row present, no auto top-up state.

**STATUS:** **PASS** (D1) — UI check pending. Note: `tier_balance = 0.01` (refill ran on signin), harmless.

---

## S2 — Open billing portal & attach Visa 4242 (success card)

**Goal:** Stripe customer created, default PM attached, billing address complete.

**Action (you):**
1. Pollen tab → "Manage Billing" (or equivalent) → Stripe Portal opens
2. Add card `4242 4242 4242 4242` / `12/30` / `123`
3. Fill billing: name, line1, city, postal, country (US works)
4. Save → return to staging

- [ ] D1: `user.stripe_customer_id = cus_UVIFi9x4rgZgcK`
- [ ] Stripe: customer created with `metadata.pollinations_user_id = bOAt1Gky…`, `livemode: false`
- [ ] Stripe: PM `pm_1TWHfo6O03AauPe8l3yAy5Pv` (Visa •• 4242, FR) attached & set as default
- [ ] `isBillingDetailsComplete` passes (name `fouchyelliot-rgb`, country `FR` — non US/CA/IN OK)
- [ ] UI: "Visa •• 4242" shown as default

**Pass criteria:** `cus_…` in D1, default PM = pm_… for Visa 4242, billing complete.

**STATUS:** _pending_

---

## S3 — Enable auto top-up at $5 (no immediate charge)

**Goal:** preferences saved, no charge yet (balance above threshold).

**Action (you):** Toggle auto top-up on, slider at **$5**, save.

- [ ] D1: `auto_top_up_enabled = 1`, `auto_top_up_amount_usd = 5`
- [ ] D1: `auto_top_up_claimed_at = NULL`
- [ ] D1: `stripe_auto_top_up_attempt` rows still 0
- [ ] No Stripe invoice created
- [ ] UI: panel shows enabled at $5

**Pass criteria:** settings persisted, zero side effects on Stripe.

**STATUS:** _pending_

---

## S4 — Happy path: trigger → charge → credit (Visa 4242)

**Goal:** end-to-end success — gen drains balance, calls trigger, invoice paid, balance credited exactly once.

**Setup (me):** if `pack_balance > 5`, set it to `1` in D1 to skip slow drain.

**Action (you):** make a billed gen call:
```
curl https://gen.pollinations.ai/v1/chat/completions \
  -H "Authorization: Bearer sk_<your-key>" \
  -H "Content-Type: application/json" \
  -d '{"model":"<paid-model>","messages":[{"role":"user","content":"hi"}]}'
```

- [ ] gen-staging log: `Decremented … (tier: -0, pack: -…)` — bucket = pack
- [ ] gen-staging log: `triggerAutoTopUp` fired
- [ ] D1: new attempt row, `status=paid`, `pollen_grant=7`, `failure_reason=NULL`
- [ ] D1: `pack_balance` reflects: prior − usage + 7
- [ ] D1: `auto_top_up_enabled` still 1, `auto_top_up_claimed_at = NULL`
- [ ] Stripe events: `invoice.created` → `finalized` → `paid` + `payment_intent.succeeded`
- [ ] UI: balance updated, no warning

**Pass criteria:** attempt status='paid', balance +7 (not +14 — proves inline credit and webhook are idempotent together).

**STATUS:** _pending_

---

## S5 — Webhook idempotency (replay invoice.paid)

**Goal:** firing `invoice.paid` a second time must NOT double-credit.

**Action (me):** in Stripe sandbox dashboard → webhook deliveries → resend the `invoice.paid` event from S4.

- [ ] Replayed `evt_1TWHmp6O03AauPe8Mq3EhmxH` via Stripe `retry`
- [ ] D1: attempt unchanged (`status='paid'`, `updated_at=1778597995958` = initial)
- [ ] D1: `pack_balance` unchanged at `7.0113`

**Pass criteria:** no double credit; attempt + balance identical to S4 end-state.

**STATUS:** _pending_

---

## S6 — SCA required (Visa 4000 0027 6000 3184)

**Goal:** off-session 3DS path — attempt is `requires_action`, invoice stays open, auto top-up stays enabled, hosted URL surfaced.

**Setup (you):** in Stripe portal — remove `4242`, add `4000 0027 6000 3184` (`12/30` / `123`), set as default.
**Setup (me):** set `pack_balance = 1` in D1.

**Action (you):** make a billed gen call (same curl as S4).

- [x] Trigger fired via nanobanana call
- [ ] D1: attempt `020ff45a-aafc-4f2a-b637-7d4cb26e20bf`, status=`failed` (expected `pending`), invoice `in_1TWJc96O03AauPe83TIWXUcj` Stripe `status=void` (expected `open`), no hosted URL
- [x] `auto_top_up_enabled` still 1, `pack_balance = 0.9613` (drain only, no credit)
- [ ] Race fix `1a50bb7aa` regressed — `pending` overwritten by `invoice.payment_failed` because `invoice.payment_intent` is `null` on API `2025-12-15.clover`

**Pass criteria:** invoice open + payable, auto top-up enabled, hosted URL available.

**STATUS:** **FAIL** — SCA short-circuit at [stripe-billing.ts:655-666](enter.pollinations.ai/src/utils/stripe-billing.ts#L655-L666) reads `invoice.payment_intent` which is gone in API version `2025-12-15.clover`. `getInvoicePaymentIntentId` returns null → short-circuit skipped → invoice voided + attempt failed. `auto_top_up_enabled` survived because webhook handler passes `disableAutoTopUp: false`. Fix: resolve PI via `invoice.payments` list or expand at retrieval.

---

## S7 — Complete 3DS from hosted URL → credit applied

**Goal:** user finishes 3DS, invoice settles, balance credited (exactly once, via webhook).

**Action (you):** click hosted invoice link from S6 → Stripe test 3DS challenge → "Complete authentication".

- [ ] Stripe: invoice from S6 → `status=paid`, `amount_paid=500`
- [ ] D1: attempt transitioned `requires_action → paid`, `failure_reason=NULL`
- [ ] D1: `pack_balance` +7 (exactly once)
- [ ] `auto_top_up_enabled` still 1

**Pass criteria:** attempt status='paid', balance credited +7, no warning.

**STATUS:** _pending_

---

## S8 — Generic decline (Visa 4000 0000 0000 0002)

**Goal:** card_declined → fail attempt, void invoice, disable auto top-up.

**Setup (you):** in portal — swap default to a declining card. Stripe portal rejects raw `4000 0000 0000 0002` at attach; use the `pm_card_chargeCustomerFail` test token via API instead.
**Setup (me):** set `pack_balance = 1` in D1.

**Action (you):** billed gen call.

- [ ] Direct trigger response: `{"status":"failed","reason":"Your card was declined."}`
- [ ] Stripe: invoice → `status=void`, `amount_paid=0`
- [ ] D1: attempt `status=failed`, `failure_reason="Your card was declined."`
- [ ] D1: `auto_top_up_enabled = 0`
- [ ] D1: `pack_balance = 1.0` (no credit)

**Pass criteria:** invoice voided, auto top-up disabled, error surfaced.

**STATUS:** _pending_

---

## S9 — Hard authentication failure (Visa 4000 0084 0000 1629)

**Goal:** off-session 3DS auth fails permanently → disable auto top-up. This validates commit `3a619c5e9`.

**Setup (you):** re-enable auto top-up in UI; swap card to `4000 0084 0000 1629`.
**Setup (me):** set `pack_balance = 1` in D1.

**Action (you):** billed gen call.

- [ ] Code path covered by unit test `stripe.test.ts` "POST /api/stripe/auto-top-up/trigger disables auto top-up after failed authentication"

**Pass criteria:** auto top-up disabled (distinct from S6's `requires_action` outcome — hard auth fail must NOT leave invoice open).

**STATUS:** _pending_

---

## S10 — Missing default PM (defensive)

**Goal:** trigger with no default PM → fail + disable cleanly, no Stripe charge attempted.

**Setup (you):** re-enable auto top-up; in portal detach the current default PM and don't add another.
**Setup (me):** set `pack_balance = 1`.

**Action (you):** billed gen call.

- [ ] Direct trigger response: `{"status":"skipped","reason":"missing default payment method"}`
- [ ] D1: attempt `status=failed`, `failure_reason="missing default payment method"`, `stripe_invoice_id=NULL`
- [ ] D1: `auto_top_up_enabled = 0`
- [ ] D1: `pack_balance = 1.0` (untouched)

**Pass criteria:** clean fail without ever hitting Stripe's invoice API.

**STATUS:** _pending_

---

## Final verification

| Scenario | Status |
|---|---|
| S1 Sign-in & baseline | _pending_ |
| S2 Attach Visa 4242 | _pending_ |
| S3 Enable auto top-up | _pending_ |
| S4 Happy path | _pending_ |
| S5 Webhook idempotency | _pending_ |
| S6 SCA card | _pending_ |
| S7 3DS completion | _pending_ |
| S8 Generic decline | _pending_ |
| S9 Hard auth failure | _pending_ |
| S10 Missing default PM | _pending_ |

## S8 regression — release blocker 🚨

`markAutoTopUpInvoiceFailed` ([stripe-billing.ts:655-668](enter.pollinations.ai/src/utils/stripe-billing.ts#L655-L668)) short-circuits when invoice is `open` AND attempt is `pending`. Designed for the SCA race, but it also catches **generic declines**: Stripe leaves the invoice `open` for retry on declined cards, so the cleanup + disable never run. Net effect: a hard-declined card leaves the invoice indefinitely open and auto top-up enabled.

Repro: attached `pm_card_chargeCustomerFail` PM via API, fired trigger. Stripe emitted `invoice.payment_failed` with no `invoice.payment_action_required`. D1 attempt stayed `pending`, invoice stayed `open`, `auto_top_up_enabled` stayed 1. Captured ids: attempt `16ca14ee-a4e2-455f-950b-988dce76918e`, invoice `in_1TWHyT6O03AauPe8Onmxx8iF`.

Fix sketch: in [stripe-webhooks.ts:469-477](enter.pollinations.ai/src/routes/stripe-webhooks.ts#L469-L477), retrieve/expand `invoice.payment_intent` and only keep the invoice recoverable when `payment_intent.status === "requires_action"` (use existing `isSCARequiredError` helper at [stripe-billing.ts:1210](enter.pollinations.ai/src/utils/stripe-billing.ts#L1210)). Generic declines (`requires_payment_method`, etc.) should fall through to the cleanup + disable path.

## Prior-run findings (kept as context — do NOT re-introduce)

1. **SCA webhook race** — `invoice.payment_failed` fires alongside `invoice.payment_action_required` for off-session SCA cards. Old handler voided the invoice and overwrote `requires_action`→`failed`. Fixed in commit `1a50bb7aa` ([stripe-billing.ts:760-779](enter.pollinations.ai/src/utils/stripe-billing.ts#L760-L779)) by short-circuiting `markAutoTopUpInvoiceFailed` when the attempt is already in `requires_action`. Watch S6 for regression.

2. **Staging schema drift** — `expected_amount_cents` / `expected_currency` NOT NULL columns lingered on staging from a since-edited 0024 migration. Already patched live (`ALTER TABLE … DROP COLUMN`). Prod will only apply post-squash migrations so this won't recur.

## Notes

- Stripe portal cannot save cards that decline on attach (4000 0000 0000 0002). For decline scenarios, use API + Stripe test PM tokens (`pm_card_chargeCustomerFail`).
- Trigger only fires when bucket selection picks `pack` — that requires either a `paidOnly` model (e.g. `nanobanana`) or an existing `pack_balance > 0`. New users with `pack_balance=NULL` and any non-zero tier balance won't trigger off ordinary calls.
- Webhook URL on staging: `https://staging.enter.pollinations.ai/api/webhooks/stripe`.
- UI changes since prior run: `AutoTopUpIssue` now uses `"failed" | "pending_payment"` (was `"requires_action"`); `enableDraft` state replaces sessionStorage `pendingEnable`; `ToggleStatus` is `"off" | "draft" | "on"`.
