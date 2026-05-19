# Country-Routed Checkout Plan

> **Status (2026-05-19):** Phase 1 backend code is **deployed to the staging Cloudflare Worker** (`staging.enter.pollinations.ai`, using **sandbox Stripe** + the staging Tinybird workspace + the staging D1 database). Visually verified end-to-end for EU_CORE. **Not yet on production** — production worker still runs the pre-Phase-1 code from #11158. Awaiting the pre-merge checklist (below) before merging the PR to `main` and pushing to `production`. Phase 2 (frontend local-currency display) is deferred until Phase 1 has 2 weeks of clean production data.

## Why this exists

Our company is registered in Estonia. Stripe settles us in EUR by default. Before this plan, every Checkout Session used USD as the integration currency. That mismatch is why several regional payment methods didn't work end-to-end on our account: Pix (BR), iDEAL (NL), Bancontact (BE), SEPA Direct Debit (DE/NL/ES/FR), EPS (AT), Multibanco (PT), Satispay (IT), and mainland Alipay for genuine CN/HK/TW buyers all require EUR (or a regional currency) as the session integration currency.

This plan unlocks those methods for buyers who are actually in those regions, **without disrupting the dominant US-card cohort**. We ship it backend-first (cohort routing) and frontend later (local-currency display).

## What we found: country labels in our analytics are misleading

Before Phase 1 was scoped, we ran a card-country audit against 5,000 recent paid Stripe charges (live account). The results reshape the strategy materially:

| Billing country (what our analytics shows) | Cards from that same country (genuine) | US-issued cards | Verdict |
|---|---|---|---|
| MO (Macao) | 0 | 507 of 508 (99.8%) | 🚨 ghost market — pure card-testing fingerprint |
| AQ (Antarctica) | 0 | 20 of 20 (100%) | 🚨 obvious spoof |
| DE (Germany) | 5 of 33 (15%) | 27 of 33 (82%) | mostly spoofed; ~5 genuine DE cards/sample |
| NL (Netherlands) | 2 of 7 | 1 of 7 | small + mixed |
| BR (Brazil) | 11 of 11 (100%) | 0 | ✅ fully genuine |
| CN (China) | 17 of 17 (100%) | 0 | ✅ fully genuine |
| KR (Korea) | 5 of 5 (100%) | 0 | ✅ fully genuine |
| GB (UK) | 12 of 14 (86%) | 0 | ✅ mostly genuine |
| IN (India) | 14 of 17 (82%) | 3 of 17 | ✅ mostly genuine |
| UA (Ukraine) | 13 of 18 (72%) | 5 of 18 | ✅ mostly genuine |
| ID (Indonesia) | 11 of 16 (~70%) | — | ✅ likely genuine |

Two consequences of this audit:

1. **The headline "Alipay 0/75 = 100% failure for Macao" is not a currency-mismatch problem.** Those 75 attempts are US cards trying to use Alipay (a method that fundamentally doesn't accept US-issued cards). Phase 1 doesn't fix that — it's card-testing abuse and is covered by [Card Testing Abuse Plan.md](Card%20Testing%20Abuse%20Plan.md).
2. **By card-issuer country, US is the dominant cohort.** Of 913 paid card charges in the sample, 632 (~69%) had US-issued cards. Most of them appear under spoofed billing addresses (MO/AQ/DE/etc.). Any change that risks US conversion is much more consequential than the original plan estimated.

Together: the win in this plan is unlocking regional methods for the **genuine** non-US markets (BR, CN, EU-core, and similar) — not "fix Macao Alipay."

---

## Cohort design (the contract)

Four cohorts, decided by `CF-IPCountry` at checkout-session-creation time. Cloudflare injects this header at the edge based on the buyer's real IP — buyers cannot spoof it.

```ts
type CheckoutCohort = {
  id: "USD" | "BR" | "APAC_ALIPAY" | "EU_CORE";
  checkoutCurrency: "usd" | "eur";  // what we send to Stripe
  adaptivePricing: boolean;          // whether Stripe localizes presentment
  pmcEnvVar: "STRIPE_PMC_USD" | "STRIPE_PMC_BR" | "STRIPE_PMC_APAC_ALIPAY" | "STRIPE_PMC_EU_CORE";
};
```

| Cohort | Countries | Currency | AP | PMC contents |
|---|---|---|---|---|
| **USD** (default) | US, CA, GB, AU, NZ, UA + everything else (unknown / `XX` / unrouted, **including MO**) | `usd` | off | Cards, Link, Apple Pay, Google Pay, Klarna, PayPal |
| **BR** | BR | `eur` | on → BRL | Cards, Link, Apple Pay, Google Pay, **Pix**, PayPal |
| **APAC_ALIPAY** | CN, HK, TW (**not MO**) | `eur` | on → CNY/HKD/TWD | Cards, Link, Apple Pay, Google Pay, **mainland Alipay**, PayPal. UnionPay covered by Cards. |
| **EU_CORE** | NL, DE, FR, ES, BE, AT, PT, IE, IT, LU, GR, CY, MT, SI, SK, EE, LV, LT, IS, LI | `eur` | off | Cards, Link, Apple Pay, Google Pay, **iDEAL / Bancontact / EPS / MB Way / SEPA Debit / Multibanco / Satispay**, PayPal, Revolut Pay, Klarna |

**Why MO is excluded from APAC_ALIPAY.** The 99.8% spoof signal. Routing MO into APAC_ALIPAY would just give US card testers a cohort with more methods to probe. MO drops into the USD default where the abuse plan's filters apply. Covered by a regression test (`test/integration/stripe.test.ts` — `MO → USD-regression`).

**Why AP is off on EU_CORE.** EU buyers using EU-issued cards already see EUR natively; AP would no-op. Keeping it off removes a 2–4% Stripe FX margin layer that would otherwise apply on rare cross-EU presentments.

**Why AP is on for BR and APAC_ALIPAY.** Pix requires BRL presentment and mainland Alipay requires CNY/HKD/TWD presentment. These cohorts use EUR as the integration currency (required for EE merchants per Stripe docs) and let AP handle the localized presentment.

### Pricing anchor: 1 pollen = $1

USD is the canonical reference. Non-USD cohorts derive their EUR integration amount from `pack.amountUsd × current USD→EUR FX rate` at session-creation time, via a daily-refresh KV cache backed by [frankfurter.dev](https://api.frankfurter.dev) (ECB rates, free, no auth). Safety fallback: hardcoded `0.93` if both KV cache and frankfurter are unavailable.

Pollen credit per pack stays USD-anchored (5-pollen pack always grants 5+1 pollen, regardless of currency paid). Snapshot persists in Stripe `session.metadata` and `payment_intent.metadata` (`packKey`, `packPollenGrant`, `packBonusPollen`, `packAmountUsd`, `packAmountCents`, `cohort`).

---

## What's shipped ✅

All on branch `feat/country-routed-checkout-phase-1` (draft PR #11172), deployed to **staging** as worker version `a7daa56d-98e0-417a-aee4-86196805f5a8`.

### Code

| File | What it does |
|---|---|
| [enter.pollinations.ai/src/utils/currency-router.ts](enter.pollinations.ai/src/utils/currency-router.ts) | `getCohortFromCountry(country)` — pure resolver. Encapsulates the 4-cohort lookup table; MO routes to USD; case-insensitive; defensive against null/undefined/empty. |
| [enter.pollinations.ai/src/utils/fx-cache.ts](enter.pollinations.ai/src/utils/fx-cache.ts) | `getUsdToEurRate(env)` — KV-cached (24h TTL), frankfurter.dev source, 5s fetch timeout, safety fallback `0.93`. |
| [enter.pollinations.ai/src/pollen-packs.ts](enter.pollinations.ai/src/pollen-packs.ts) | Removed hand-set `priceEurCents` table (was off by 2-8% from $1/pollen). Added `getPackEurCents(pack, fxRate)` which rounds USD reference × FX to whole EUR cents. |
| [enter.pollinations.ai/src/routes/stripe.ts](enter.pollinations.ai/src/routes/stripe.ts) `/checkout/:packKey` | Reads `CF-IPCountry` → resolves cohort → picks currency/AP/PMC. USD cohort sends USD cents directly (no FX call). Non-USD cohorts call `getUsdToEurRate` once. Metadata snapshot includes `cohort` for downstream observability. |
| [enter.pollinations.ai/wrangler.toml](enter.pollinations.ai/wrangler.toml) | 4 new env vars per non-prod section: `STRIPE_PMC_USD`, `STRIPE_PMC_BR`, `STRIPE_PMC_APAC_ALIPAY`, `STRIPE_PMC_EU_CORE` (sandbox values). Production env block untouched (awaits live PMCs). Dead `[env.dev]` block and orphan `STRIPE_BUY_POLLEN_PMC_ID` removed from non-prod sections. |

### Tests (118/118 green)

| File | Coverage |
|---|---|
| [enter.pollinations.ai/test/currency-router.test.ts](enter.pollinations.ai/test/currency-router.test.ts) | 41 tests — every country in every cohort, MO regression, case-insensitivity, null/undefined defaults |
| [enter.pollinations.ai/test/fx-cache.test.ts](enter.pollinations.ai/test/fx-cache.test.ts) | 11 tests — KV cache hit/miss, frankfurter success, network failure, non-2xx, malformed JSON, missing rate field, zero rate, corrupt cache value, KV read/write/both-fail non-fatal |
| [enter.pollinations.ai/test/pollen-packs.test.ts](enter.pollinations.ai/test/pollen-packs.test.ts) | 5 tests — catalog integrity + `getPackEurCents` derivation |
| [enter.pollinations.ai/test/integration/stripe.test.ts](enter.pollinations.ai/test/integration/stripe.test.ts) | 59 stripe tests including 4 new cohort cases (BR/EU_CORE/APAC_ALIPAY/MO-regression) verifying per-cohort currency, AP, PMC, metadata, FX-derived unit_amount |
| [shared/test/mocks/frankfurter.ts](shared/test/mocks/frankfurter.ts) | New fetch mock for frankfurter.dev, returns configurable rate, registered in the project's mock infrastructure |

### Stripe (sandbox)

| Cohort | PMC ID | Methods |
|---|---|---|
| USD | `pmc_1TYjwI6O03AauPe8spSyH3ph` | card, link, apple_pay, google_pay, klarna, paypal |
| BR | `pmc_1TYjxa6O03AauPe8w1niCN1s` | card, link, apple_pay, google_pay, pix, paypal |
| APAC_ALIPAY | `pmc_1TYjxo6O03AauPe8hw5qidqt` | card, link, apple_pay, google_pay, alipay, paypal |
| EU_CORE | `pmc_1TYjy16O03AauPe8QDf9zVag` | card, link, apple_pay, google_pay, ideal, bancontact, eps, mb_way, sepa_debit, multibanco, satispay, paypal, revolut_pay, klarna |

### Verified end-to-end on staging

- **EU_CORE** (Germany buyer, real IP): page rendered €4.29 with iDEAL, Bancontact, EPS, MB Way, SEPA Debit, Multibanco, Satispay, Klarna, Revolut Pay all present; VAT €0.68 calculated; pollen grant 6 (5+1).
- **USD / BR / APAC_ALIPAY / MO** (via Stripe API retrieval and the `?country=` debug override, since visual testing of off-region cohorts ran into a Stripe sandbox-account-specific bootstrap glitch with hosted Checkout): every cohort produced the correct currency, amount, AP setting, PMC, and metadata. The `?country=` override has been removed before PR.

### Architecture decisions made along the way

- **D1 schema unchanged.** Earlier plan added 5 audit-trail columns to `stripe_checkout_credits` (pack_key / currency / amount / presentment_currency / presentment_amount). Dropped — nothing in the codebase reads them, and Tinybird `stripe_event` is the system of record for analytics. D1 migration 0026 was never committed.
- **Tinybird `stripe_event` already has 10 of the columns we need** — shipped via #11158 (card_country, card_brand, card_network, risk_level, risk_score, presentment_currency, presentment_amount, payment_method_raw, payment_method_wallet, payment_methods_offered). The `cohort` column was added on staging as part of Stage B (deployment #8 promoted live).
- **No D1 `cohort` column either.** Cohort lives in Stripe metadata + Tinybird only.
- **No feature flag for per-cohort rollout.** The earlier plan called for `CHECKOUT_VARIANT_COHORTS` to ramp per cohort. We're shipping all four at once because (a) the worst case per cohort is "shows the same payment options as before but in a slightly different currency", (b) MO-regression is covered by a regression test, (c) the simpler deploy avoids state-machine confusion.

---

## ⚠️ Pre-merge checklist — everything to do before pushing to `production`

Ordered. Each step has an owner: 🤖 = Claude (CLI/API automation), 👤 = you (browser UI or sensitive systems).

> **CRITICAL rule throughout:** any **live-mode** Stripe write or any **production** deploy/migration needs explicit per-action approval from you in the same conversation. "Go" said earlier does not carry over. Every live write or prod step gets a fresh, specific instruction.

### Stage A — Webhook cohort observability fix ✅ done

The webhook handler now forwards `session.metadata.cohort` (and the equivalent `charge.metadata.cohort` / `paymentIntent.metadata.cohort` / `refund.metadata.cohort`) to Tinybird `stripe_event` on all 7 emit paths.

- [x] 🤖 Added `cohort?: string` to `StripeEventData` in [enter.pollinations.ai/src/routes/stripe-webhooks.ts](enter.pollinations.ai/src/routes/stripe-webhooks.ts)
- [x] 🤖 `sendStripeEventToTinybird` JSON payload includes `cohort: data.cohort ?? ""`
- [x] 🤖 All 7 webhook call sites updated to pass cohort from the relevant event's metadata
- [x] 🤖 Integration test `POST /api/webhooks/stripe forwards cohort from event metadata to Tinybird` asserts the field lands
- [x] 🤖 Added `cohort LowCardinality(String) json:$.cohort DEFAULT ''` to [enter.pollinations.ai/observability/datasources/stripe_event.datasource](enter.pollinations.ai/observability/datasources/stripe_event.datasource)

### Stage B — Tinybird staging deploy ✅ done

- [x] 🤖 `tb --cloud deploy --check --wait` clean
- [x] 🤖 Row-count tripwire confirmed staging (40 rows vs prod's ~40k)
- [x] 🤖 `tb --cloud deploy --wait` → deployment #8 promoted
- [x] 🤖 `DESCRIBE stripe_event` confirms `cohort` column live (23 columns total)

### Stage C — PR + review

- [ ] 🤖 Open PR from `wip/country-routed-checkout` (or rename to `feat/country-routed-checkout-phase-1`) to `main` with the description summarizing scope + Stage-A through Stage-G work
- [ ] 👤 Human review; address feedback
- [ ] 👤 Approve and merge to `main` once review passes
- [ ] *(optional, in parallel)* 👤 Open Stripe support ticket about the sandbox-account Checkout bootstrap glitch (`apiKey is not set` on hosted Checkout pages for sessions where buyer IP doesn't match cohort region) — non-blocking; useful for future sandbox QA

### Stage D — Live Stripe setup (requires your explicit live-mode approvals)

- [ ] 👤 Stripe Dashboard → **Live mode** → Settings → Payments → Checkout → toggle **Adaptive Pricing ON** (sandbox may already be on; verify live)
- [ ] 👤 Tell Claude "go: create live PMCs" — Claude creates 4 LIVE PMCs matching sandbox composition:
  ```
  cohort_usd:  card, link, apple_pay, google_pay, klarna, paypal
  cohort_br:   card, link, apple_pay, google_pay, pix, paypal
  cohort_apac_alipay:  card, link, apple_pay, google_pay, alipay, paypal
  cohort_eu_core:  card, link, apple_pay, google_pay, ideal, bancontact,
                    eps, mb_way, sepa_debit, multibanco, satispay,
                    paypal, revolut_pay, klarna
  ```
- [ ] 🤖 Verify each LIVE PMC has every configured method showing `available: true` (especially Pix, mainland Alipay, SEPA Debit, Klarna, Multibanco, Satispay — these need account capability)
- [ ] 🤖 Update `[env.production.vars]` in `wrangler.toml` with the 4 LIVE PMC IDs (`STRIPE_PMC_USD/BR/APAC_ALIPAY/EU_CORE`)
- [ ] 🤖 Remove the now-orphan `STRIPE_BUY_POLLEN_PMC_ID` from `[env.production.vars]` (last reference — sandbox sections already cleaned)
- [ ] 🤖 Commit `wrangler.toml` changes to the same PR/branch and push

### Stage E — Multi-currency settlement (can run in parallel with Stage D)

Required so USD-cohort revenue settles in USD (zero Stripe FX margin on the dominant cohort). Without this step, USD-cohort payouts still convert to EUR via Stripe's FX rate (~2% margin).

- [ ] 👤 Confirm Wise USD + EUR EBANs are verified and active
- [ ] 👤 Stripe Dashboard → **Sandbox** → Settings → Payouts → enable USD payout → link Wise USD EBAN
- [ ] 👤 Send a $1 test payout from sandbox → verify it lands in your Wise USD EBAN
- [ ] 👤 Stripe Dashboard → **Live** → Settings → Payouts → enable USD payout → link Wise USD EBAN (do **only after** sandbox test succeeds)
- [ ] 👤 Confirm EUR payout destination is already set to Wise EUR EBAN (probably is, since EUR is current settlement)

### Stage F — Coupon / promo code audit

USD-scoped Coupons silently no-op on EUR cohorts. Don't surprise customers.

- [ ] 🤖 `stripe coupons list --limit=100 --live` and report any USD-scoped codes
- [ ] 🤖 For each USD-scoped code: either convert to multi-currency (USD + EUR) or document scope and accept it doesn't apply to non-USD cohorts
- [ ] 🤖 Same audit for `stripe promotion_codes list --live`

### Stage G — Tinybird production deploy

Additive `cohort` column on prod `stripe_event` (matches Stage B but on prod workspace).

- [ ] 👤 Explicitly say "go: deploy Tinybird to prod" — Claude does **not** deploy prod Tinybird otherwise
- [ ] 🤖 Verify row-count tripwire: prod `stripe_event` has ≫ 30,000 rows (catches a misrouted token before deploy)
- [ ] 🤖 `tb --cloud deploy --check --wait` against prod (with prod admin token from local `.tinyb`)
- [ ] 🤖 `tb --cloud deploy --wait` against prod (no `--allow-destructive-operations` — additive column only)
- [ ] 🤖 Verify new column via `tb --cloud sql 'DESCRIBE stripe_event'` against prod

### Stage H — Production worker deploy

- [ ] 👤 Push `main` → `production` branch (or merge the production PR if that's the flow). This triggers `.github/workflows/deploy-enter-cloudflare.yml` which runs `npm run deploy:production`.
- [ ] 🤖 Watch CI; verify deploy success
- [ ] 🤖 `gh run view` the workflow run and confirm exit 0
- [ ] 🤖 `wrangler tail --env production --format pretty` to start watching live traffic

### Stage I — Smoke test on live

- [ ] 👤 From your real IP (Germany → EU_CORE), open `https://enter.pollinations.ai`, click Buy Pollen ($5), confirm Stripe page shows €4.65-ish in EUR + iDEAL/Bancontact/SEPA/etc.
- [ ] 👤 Complete the $5 purchase via card (don't worry, you can refund yourself afterward)
- [ ] 🤖 Verify Tinybird `stripe_event` row has `cohort=EU_CORE`, `currency=eur`, `payment_method=card`
- [ ] 🤖 Verify D1 `stripe_checkout_credits` row has the right pollen_credited (5+1=6) and your user_id
- [ ] 🤖 Verify your account's pack_balance increased by 6 in D1
- [ ] 👤 Refund the $5 via Stripe Dashboard to clean up

### Stage J — 24-hour monitoring

- [ ] 🤖 Set up a cron to check Tinybird every 4 hours for the first 24h: per-cohort completion rate, AP-presentment-currency distribution, failed-payment rate
- [ ] 🤖 Alert (Discord/Slack) on first BR / APAC_ALIPAY / EU_CORE payment landing — these are the cohorts we haven't visually verified
- [ ] 👤 Be ready to roll back if the failed-payment rate on any cohort jumps >5pp from baseline (rollback = push the previous commit to `production` branch; takes ~3 minutes)

---

## Per-cohort monitoring queries

Snippets — not Tinybird pipes. Promote to pipes only if a real consumer (dashboard, automation) materializes.

```sql
-- Per-cohort completion volume + revenue (last 30 days, prod).
-- amount_cents is in the integration currency (USD for USD cohort, EUR for the rest)
-- so we group by currency to avoid mixing.
SELECT
    cohort,
    currency,
    if(payment_method_wallet != '', payment_method_wallet,
       if(payment_method_raw != '', payment_method_raw, payment_method)) AS method,
    presentment_currency,
    count() AS completions,
    sum(amount_cents) AS amount_cents_in_integration_currency
FROM stripe_event
WHERE event_type IN ('checkout.session.completed', 'checkout.session.async_payment_succeeded')
  AND payment_status = 'paid'
  AND timestamp >= today() - INTERVAL 30 DAY
GROUP BY cohort, currency, method, presentment_currency
ORDER BY completions DESC
```

```sql
-- Per-cohort genuine-vs-spoofed revenue.
-- Card-issuer country was added in #11158; cohort was added in this PR.
SELECT
    cohort,
    currency,
    card_country,
    count() AS n,
    sum(amount_cents) AS amount_cents_in_integration_currency
FROM stripe_event
WHERE event_type IN ('charge.succeeded', 'checkout.session.completed', 'checkout.session.async_payment_succeeded')
  AND payment_status IN ('paid', 'succeeded')
  AND timestamp >= today() - INTERVAL 30 DAY
GROUP BY cohort, currency, card_country
ORDER BY n DESC
```

```sql
-- Regression check: any MO buyers landing in APAC_ALIPAY? (Should be zero.)
SELECT count() AS misrouted
FROM stripe_event s
INNER JOIN d1_user u ON s.user_id = u.id
WHERE s.cohort = 'APAC_ALIPAY'
  AND s.card_country = 'MO'
  AND s.timestamp >= today() - INTERVAL 30 DAY
```

---

## Risks

| Level | Risk | Mitigation |
|---|---|---|
| High | **VPN/proxy → wrong cohort.** Buyer sees a different payment-method set than they expect. | Phase 2 will add a "Change region" link near the pack picker. For Phase 1: cohort routing is a no-op for buyers whose VPN exits in a country whose cohort matches their card. Worst case: a US-card buyer behind a BR VPN sees Pix, can't use it, switches to card → completes normally. |
| High | **`CF-IPCountry` returns `XX` or empty.** | USD default catches this (tested). |
| High | **LIVE PMC misconfiguration.** Forgetting Pix on cohort_br silently breaks that cohort. | Stage D's post-create verification step checks every method's `available: true` per cohort. |
| High | **Card-testing abuse poisoning cohort analytics.** Spoofed billing addresses (the MO problem) skew per-cohort metrics. | All cohort dashboards key on **card-issuer country** (via #11157, shipped). `CF-IPCountry` is used **ONLY** for the routing decision — and `cf-ipcountry: MO` routes to USD-default (regression-tested). |
| Medium | **Multi-currency settlement misconfiguration.** USD payouts going to wrong account → revenue lost / delayed. | Stage E's $1 manual sandbox payout test before enabling live USD payout. |
| Medium | **Adaptive Pricing × inclusive tax rounding** on €2 / €5 packs across BRL / CNY / HKD / TWD. | Stage I smoke test covers EU_CORE; first real BR/APAC payments in Stage J monitoring will surface any rounding artifacts. |
| Medium | **Promo codes scoped per currency.** USD-scoped codes silently no-op on EUR cohorts. | Stage F's audit converts to multi-currency. |
| Medium | **Tinybird cohort observability lag.** Stage A adds the column; if a webhook code-path is missed, that event won't have cohort set. | Stage A includes a regression test asserting cohort is forwarded for `checkout.session.completed`. |
| Low | **Frankfurter.dev outage.** FX cache falls back to 0.93 safety rate. | Drift up to ~2% from real rate during outage. Refresh `FX_SAFETY_RATE_USD_EUR` constant occasionally (annually). |
| Low | **Cohort-table maintenance.** Adding a country to a cohort is editing a constant. | — |

---

## Out of scope

### Phase 2 (frontend local-currency display) — deferred

Buyers see their local currency on the pack picker (≈ R$25,80 for BR-cohort buyers, ≈ ¥38 for APAC-cohort), FX-converted from the USD reference. Pure UX. Reuses the FX cache module from Phase 1. Will ship after 2 weeks of clean Phase 1 production data.

### Payment methods we're not adding now

| Method | Status | When to revisit |
|---|---|---|
| AlipayHK | Stripe confirmed not available to EE merchants (2026-05-18) | If HK/MO conversion lags despite mainland Alipay → secondary PSP |
| WeChat Pay (mainland + HK) | Stripe confirmed not available to EE | If CN/HK conversion lags → secondary PSP or direct integration |
| Boleto (Brazil) | Pix is the dominant Brazilian rail and is on cohort_br | If Pix conversion <70% post-launch |
| Korean methods (Kakao Pay, Naver Pay, PAYCO, kr_card) | Require KRW session | If genuine KR volume >$500/mo (currently ~$750/mo — real candidate for a 5th cohort) |
| TWINT (CH), BLIK (PL), Swish (SE) | On account but require native currency | If single-country volume justifies adding a cohort |
| Bizum (Spain) | Stripe Bizum is in beta | Apply for access once GA |
| Bacs Direct Debit (UK), Interac (Canada) | Merchant-domicile-restricted; blocked for EE | Not realistic |
| Giropay | Stripe deprecated 2024 | Don't pursue |

### Things explicitly out of this plan

- Crypto / AgentaOS track (#11193)
- Polar.sh MoR migration
- Multi-currency auto-top-up (auto-top-up stays USD-only in Phase 1; cohort-aware enrollment is a separate workstream)
- Per-cohort Stripe Customers (one Customer per `user × currency`) — current single-Customer-per-user model works
- GBP / AUD dedicated cohorts — revisit at 90 days if card-country data justifies
- Stripe API version upgrade — held at `2025-12-15.clover`, separate PR after Phase 1 stabilizes
- Recurring non-card payment methods (Pix recurring, SEPA on auto-top-up, etc.) — Stripe docs confirm save-during-payment via Checkout Sessions only supports cards + ACH Direct Debit

---

## Appendix — Revision log

**2026-05-19** — Heavy rewrite reflecting actual implementation state.

- Phase 1 backend code is complete and on staging (`a7daa56d-...`), draft PR #11172.
- Cohort routing wired into `stripe.ts` via `currency-router.ts` + `fx-cache.ts`. 118 tests green.
- 4 sandbox PMCs created and bound to non-prod envs. Production env left empty.
- D1 schema unchanged — earlier `0026_phase1_eur_checkout_columns.sql` migration dropped (Tinybird-only audit trail).
- Hand-set EUR price table replaced with live FX from frankfurter.dev.
- `?country=XX` dev override added for staging validation, then removed.
- Old `STRIPE_BUY_POLLEN_PMC_ID` references cleaned from non-prod sections.
- Dead `[env.dev]` wrangler block removed.
- Replaced earlier "branch state today" and "rollout discipline" sections with the explicit pre-merge checklist above.
- Dropped the "feature flag per cohort ramp" approach — shipping all four at once based on the risk analysis above.

**2026-05-18** — Strategic rewrite based on card-country audit findings. Three-phase model collapsed to two phases. Macao → USD default. Card-country in Tinybird (#11157) became the hard prerequisite. Daily Stripe revenue + paid customers pipes fixed for async-paid undercount.
