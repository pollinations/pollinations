---
name: abuse-detection
description: Detect and analyze abusive accounts on Pollinations. IP clustering, multi-signal scoring, ban recommendations. Use when investigating abuse, bot farms, or suspicious usage patterns.
---

# Requirements

- `sops` and `jq` (the prod Tinybird read token comes from SOPS)
- **Cloudflare D1** access for banning users (via wrangler)

**Tinybird query pattern** (prod workspace `pollinations_enter`, no row cap):
```bash
enter.pollinations.ai/observability/scripts/tb-prod.sh "SELECT ... FROM generation_event_v2 ... FORMAT JSONCompact"
```

> **Workspace**: prod-only — staging has no real traffic. `tb-prod.sh --check` confirms
> events are fresh. Don't switch or save credentials just to run an audit.

> **Quoting**: Use double quotes for the SQL string. Use single quotes inside SQL. Avoid `!=` with `$'...'` shell quoting (escaping issues) — prefer `NOT IN ('undefined', '')` instead.

---

# Composite Abuse Score (0-100)

Six signals, each weighted independently:

| Signal | Max Points | Threshold | What it catches |
|--------|-----------|-----------|-----------------|
| IP cluster size | 30 | `cluster * 0.15` | Multiple users sharing same IP hash |
| Zero pack spend | 15 | `spend = 0` | No paid pack usage |
| Error rate | 15 | `>= 95%` (15pts), `>= 70%` (10pts) | Bots hammering failing endpoints |
| Moderation flags | 15 | `>= 90%` sexual (15pts), `>= 50%` (8pts) | NSFW generation bots |
| Disposable email | 15 | hotmail/outlook/proton + no spend | Random-string throwaway emails |
| IP rotation | 10 | `>= 50` IPs (10pts), `>= 20` (5pts) | Rotating through many exit IPs |

**Score interpretation:**

| Score | Action | False positive risk |
|-------|--------|-------------------|
| 90-100 | Ban immediately | Very low |
| 70-89 | Ban after quick review | Low |
| 40-69 | Manual review needed | Medium |
| 10-39 | Monitor only | High — many legit users with NSFW or errors |
| 0-9 | Clean | N/A |

---

# Quick Ban Criteria (High Confidence)

For accounts generating massive failing traffic with no paid pack usage, a simpler signal is sufficient:

```
zero pack spend + 95%+ error rate + 1000+ requests/week
```

This catches bot farm accounts that are already rate-limited (no spendable balance) but still hammering the API with failing requests. These accounts waste server resources with zero legitimate usage.

**Query:**

```sql
SELECT user_id
FROM (
    SELECT
        g.user_id,
        count() as total_reqs,
        round(sumIf(g.total_price, g.selected_meter_slug IN ('v1:meter:pack', 'local:pack')), 4) as pack_spend,
        countIf(g.response_status >= 400) * 100.0 / count() as err_pct
    FROM generation_event_v2 g
    WHERE g.start_time >= now() - INTERVAL 7 DAY
        AND g.is_final
        AND g.user_id NOT IN ('undefined', '')
    GROUP BY g.user_id
    HAVING total_reqs >= 1000
)
WHERE pack_spend = 0 AND err_pct >= 95
```

---

# Key Queries

## 1. Full Abuse Scoring Query

Returns all users with abuse score, sorted by score descending. The spend signal uses `selected_meter_slug` to distinguish paid pack consumption from the other active balance bucket.

```sql
SELECT
    user_id, github_username, email,
    total_reqs, pack_spend, total_spend, max_ip_cluster, distinct_ips,
    round(err_pct, 1) as err_pct, round(sex_pct, 1) as sex_pct,
    abuse_score
FROM (
    SELECT
        g.user_id, u.github_username, u.email,
        count() as total_reqs,
        round(sumIf(g.total_price, g.selected_meter_slug IN ('v1:meter:pack', 'local:pack')), 4) as pack_spend,
        round(sum(g.total_price), 4) as total_spend,
        max(coalesce(ips.ip_cluster_size, 0)) as max_ip_cluster,
        countDistinct(g.ip_hash) as distinct_ips,
        countIf(g.response_status >= 400) * 100.0 / count() as err_pct,
        countIf(g.moderation_prompt_sexual_severity NOT IN ('safe', '')) * 100.0 / count() as sex_pct,
        round(
            least(30, max(coalesce(ips.ip_cluster_size, 0)) * 0.15) +
            multiIf(
                splitByChar('@', u.email)[2] = 'proton.me' AND pack_spend = 0, 15,
                splitByChar('@', u.email)[2] = 'hotmail.com' AND pack_spend = 0, 12,
                splitByChar('@', u.email)[2] = 'outlook.com' AND pack_spend = 0, 10,
                0) +
            if(pack_spend = 0, 15, 0) +
            if(countIf(g.response_status >= 400) * 100.0 / count() >= 95, 15,
               if(countIf(g.response_status >= 400) * 100.0 / count() >= 70, 10, 0)) +
            if(countIf(g.moderation_prompt_sexual_severity NOT IN ('safe', '')) * 100.0 / count() >= 90, 15,
               if(countIf(g.moderation_prompt_sexual_severity NOT IN ('safe', '')) * 100.0 / count() >= 50, 8, 0)) +
            if(countDistinct(g.ip_hash) >= 50, 10, if(countDistinct(g.ip_hash) >= 20, 5, 0))
        , 0) as abuse_score
    FROM generation_event_v2 g
    LEFT JOIN d1_user u ON g.user_id = u.id
        AND u.synced_at = (SELECT max(synced_at) FROM d1_user)
    LEFT JOIN (
        SELECT ip_hash, count(DISTINCT user_id) as ip_cluster_size
        FROM generation_event_v2
        WHERE start_time >= now() - INTERVAL 7 DAY
            AND is_final
            AND ip_hash NOT IN ('undefined', '')
            AND user_id NOT IN ('undefined', '')
        GROUP BY ip_hash
    ) ips ON g.ip_hash = ips.ip_hash
    WHERE g.start_time >= now() - INTERVAL 7 DAY
        AND g.is_final
        AND g.user_id NOT IN ('undefined', '')
    GROUP BY g.user_id, u.github_username, u.email
    HAVING total_reqs >= 5
)
WHERE abuse_score >= 40
ORDER BY abuse_score DESC, total_reqs DESC
LIMIT 100
```

## 2. IP Cluster Analysis

Find IPs shared by many users (bot farm detection):

```sql
SELECT
    ip_subnet, ip_hash,
    count(DISTINCT user_id) as unique_users,
    count() as total_requests,
    dateDiff('minute', min(start_time), max(start_time)) as span_min
FROM generation_event_v2
WHERE start_time >= now() - INTERVAL 7 DAY
    AND is_final
    AND ip_hash NOT IN ('undefined', '')
    AND user_id NOT IN ('undefined', '')
GROUP BY ip_hash, ip_subnet
HAVING unique_users >= 10
ORDER BY unique_users DESC
LIMIT 30
```

## 3. User Details for an IP Cluster

```sql
SELECT DISTINCT
    g.user_id, u.github_username, u.email,
    sumIf(g.total_price, g.selected_meter_slug IN ('v1:meter:pack', 'local:pack')) as pack_spend,
    sum(g.total_price) as total_spend
FROM generation_event_v2 g
LEFT JOIN d1_user u ON g.user_id = u.id
    AND u.synced_at = (SELECT max(synced_at) FROM d1_user)
WHERE g.start_time >= now() - INTERVAL 7 DAY
    AND g.is_final
    AND g.ip_hash = '<IP_HASH_HERE>'
    AND g.user_id NOT IN ('undefined', '')
GROUP BY g.user_id, u.github_username, u.email
ORDER BY pack_spend DESC
```

## 4. Score Distribution (Overview)

```sql
SELECT
    multiIf(abuse_score >= 90, '90-100 definite',
            abuse_score >= 70, '70-89 likely',
            abuse_score >= 40, '40-69 suspicious',
            abuse_score >= 10, '10-39 low_risk',
            '0-9 clean') as bucket,
    count() as users,
    round(sum(total_spend), 2) as spend,
    sum(total_reqs) as requests
FROM ( /* ... full scoring subquery from #1 ... */ )
GROUP BY bucket
ORDER BY bucket DESC
```

## 5. Extract User IDs for Banning

```sql
SELECT user_id
FROM ( /* ... full scoring subquery from #1 ... */ )
WHERE abuse_score >= 90
```

---

# Known False Positive Patterns

**Always check before banning:**

| Pattern | Why it's a false positive | How to detect |
|---------|--------------------------|---------------|
| **Cloudflare WARP/Workers** | IPv6 `2a06:98c0:3600::` — legit users behind Cloudflare | Check `ip_subnet` starts with `2a06:98c0` |
| **VPN/proxy clusters** | Multiple real users behind same VPN exit | Check if cluster has paying users with real emails |
| **Chinese CGNAT** | Mobile carriers (China Mobile/Unicom/Telecom) share IPs via NAT | Cross-reference with email pattern + spend |
| **Free balance usage** | Accounts show small "spend" from non-pack balance, not real payment | Check `pack_spend` — a strong signal, not proof of payment (see below) |
| **High NSFW, legit user** | Some paying users generate NSFW content legitimately | Check pack spend > $5 — real customers |

**Safe to ban (high confidence):**
- Zero pack spend + 95%+ error rate + 1000+ requests/week
- Score >= 90 + hotmail/outlook random email + zero pack spend
- Score >= 70 + IP cluster >= 100 + zero pack spend
- Disposable email (hotmail/outlook/proton/qq/mail.ru/vk.com/anonaddy/anondrop/rambler/gmx/yandex) + error >= 95% + $0 pack spend
- 100% error rate + $0 pack spend (zero successful requests ever)
- 99%+ error rate + 1000+ requests/week (hammering)
- Multi-account cluster (same email root, e.g. `reksely`/`notreksely`/`rekselicha`)

**Needs review:**
- Any account with pack spend > $2 (could be real customer)
- Accounts on Cloudflare IPs (`2a06:98c0:*`)
- Accounts with real-looking Gmail addresses
- Accounts with 90-95% error rate but some successful pack spend (may be bad integration, not abuse)

---

## Pack spend is not proof of payment

`pack_balance` is the bucket paid users draw from, but money gets into it in more than one
way. Besides Stripe purchases and auto-top-ups, **earnings land there too**: BYOP markup and
community-model rewards are credited to the same bucket the *payer* used
(`shared/billing/track-helpers.ts`), and some quest rewards are pack-bucket
(`shared/billing/rewards.ts`). So `pack_spend > 0` means "spent from the paid bucket", not
"paid us cash". The reverse check is incomplete too: Stripe checkout rows miss auto-top-ups,
which never create a `checkout.session.*` event.

Before calling an account a real customer (or clearing it) on spend alone, check the actual
credit sources: Stripe checkout `pollen_credited`, auto-top-up `amount_usd`, historical
Polar credits, and claimed rewards by bucket. No cash purchase is not an abuse signal by
itself.

Auto-top-up `amount_usd` is the Pollen principal credited, not what the customer paid (fees
and tax sit on top). It proves a funding event happened; the exact dollars are on the Stripe
invoice (`stripe_invoice_id`, `amount_paid`) — rarely needed for an abuse verdict.

---

# Banning Users

## How Banning Works

The ban system uses **Better Auth** fields on the `user` table in Cloudflare D1:

| Field | Type | Description |
|-------|------|-------------|
| `banned` | boolean (integer 0/1) | Set to `1` to ban |
| `ban_reason` | text | Shown in 403 error response |
| `ban_expires` | integer (epoch ms) | `NULL` for permanent, epoch ms for temporary |

**Enforcement** (`shared/auth/api-key.ts`, `shared/auth/ban.ts`):
- `assertNotBanned()` runs on every authenticated request (session + API key)
- If `banned = 1` and not expired → HTTP 403 with ban reason
- If `ban_expires` is set and has passed → ban is automatically lifted
- A ban also hides the user's community models, blocks checkout and auto top-up,
  and sends the sign-in flow to the Account Suspended screen

**There is no admin API for banning** — use `wrangler d1 execute` directly.

## A ban is three statements, not one

Setting `banned = 1` alone leaves the account logged in and still charging its
card. Use all three, matching `fraudBanQueries()` in
`enter.pollinations.ai/src/utils/stripe-fraud-ban.ts`:

```sql
UPDATE user SET banned = 1, ban_reason = '<reason>', ban_expires = NULL, auto_top_up_enabled = 0
  WHERE id = '<USER_ID>' AND (COALESCE(banned, 0) = 0 OR ban_expires <= unixepoch());
UPDATE user SET auto_top_up_enabled = 0 WHERE id = '<USER_ID>';
DELETE FROM session WHERE user_id = '<USER_ID>';
```

Then expire any open Stripe Checkout sessions for the user's
`stripe_customer_id`, or they can still complete a purchase already in flight.

Verify afterwards: banned count, `ban_reason`, `auto_top_up_enabled = 0`, and
zero rows left in `session`.

## Ban Commands

```bash
# Single user ban (from enter.pollinations.ai/ directory)
npx wrangler d1 execute production-pollinations-enter-db --remote \
  --command "UPDATE user SET banned = 1, ban_reason = 'Bot farm abuse' WHERE id = '<USER_ID>'"

# Batch ban (from a file of user IDs, one per line)
IDS=$(cat user_ids_to_ban.txt | sed "s/^/'/;s/$/'/" | paste -sd, -)
npx wrangler d1 execute production-pollinations-enter-db --remote \
  --command "UPDATE user SET banned = 1, ban_reason = 'Automated: bot farm abuse' WHERE id IN ($IDS)"

# Unban a user (if false positive) - see the warning below first
npx wrangler d1 execute production-pollinations-enter-db --remote \
  --command "UPDATE user SET banned = 0, ban_reason = NULL, ban_expires = NULL WHERE id = '<USER_ID>'"

# Temporary ban (expires after 7 days)
npx wrangler d1 execute production-pollinations-enter-db --remote \
  --command "UPDATE user SET banned = 1, ban_reason = 'Temporary: rate abuse', ban_expires = $(date -v+7d +%s)000 WHERE id = '<USER_ID>'"
```

## Unbanning: the trap

If the account was banned by the payment-fraud policy, **clearing `banned` is not
enough to remove it from the review queue**. The daily job rescores all attributable
history but takes no enforcement action. Add a reviewed exception to the repository
variable `FRAUD_BAN_EXCLUDED_USER_IDS` (comma separated) to omit it from that queue.

Auto top-up stays off after an unban; re-enable it deliberately if the user asks.

## Payment-fraud bans

Separate from the abuse scoring above, `.github/workflows/billing-check-fraud.yml`
scores accounts daily on Stripe signals (`enter.pollinations.ai/src/utils/stripe-fraud-score.ts`).

- Scheduled and manually dispatched checks are read-only during calibration.
  The report always passes `apply: false`; bans and refunds require manual decisions.
- Every run posts accounts still needing review to the private Discord channel via
  `DISCORD_FRAUD_WEBHOOK_URL`. One compact, deterministic message shows only open
  disputes, unbanned accounts needing review, refund/Pollen mismatches, and blocked
  checks. Disputes are grouped by exact UTC deadline and currency, with counts and
  total amounts. Each section shows up to three rows with links and an accurate remaining
  count. Empty sections and resolved refunds are hidden. No model call, event feed,
  KV history or score-delta tracking. Excluded and already-banned accounts are omitted
  from the fraud queue, not from disputes. Manual reruns post again.
- Refund reconciliation requires the `stripe_refund` ledger and webhook deployment
  from #15044. At production activation, set GitHub repository variable
  `STRIPE_REFUND_LEDGER_START_SECONDS` once to that activation time (Unix seconds).
  Do not use the merge time or advance it on reruns: missing post-activation records
  must remain visible until resolved. An unset or invalid value blocks only refund
  checks. Review pre-activation refunds separately once, including pending refunds
  that may transition after activation; historical manual adjustments may predate
  the ledger. Missing or mismatched records are unverified, not proof of a failed deduction.
- Both scheduled and manual runs check out `production`; branch previews are disabled.
- Issuer warnings are **suspected** fraud, not proof. They enter the review queue
  even below 0.75. Radar blocks have zero weight; highest-risk flags contribute but
  never qualify an account alone. Scores are heuristic, not probabilities.
- Charges before 2026-05-01 carry no identity and are not scanned. Accounts whose
  activity predates that must be reviewed and banned by hand.
- One account is excluded by id in the source (a settled case). Add later
  exceptions to `FRAUD_BAN_EXCLUDED_USER_IDS` instead of editing code.

**Before a manual payment-fraud ban**, confirm the account owns its charges using
the Checkout Session metadata our server wrote (`metadata.userId`). Never ban on a
billing-email match: the buyer controls that field, which is why production
refuses it.

**D1 database names:**
- Production: `production-pollinations-enter-db`
- Staging: `staging-pollinations-enter-db`
- Development: `development-pollinations-enter-db`

---

# Abuse Profile: Chinese Bot Farm (March 2026)

**Characteristics discovered:**
- **Scale**: 234+ accounts, 6.4M requests/week (23% of all traffic)
- **IPs**: Chinese residential ISPs (China Telecom, Unicom, Mobile) — 60+ distinct IPs per user across 50+ subnets
- **Emails**: Random strings at hotmail.com/outlook.com/proton.me (e.g., `lhanbqkf6005@hotmail.com`)
- **Usernames**: Gibberish GitHub usernames (e.g., `bomteupted-bsfo`, `jwolfwersenmroom`)
- **Behavior**: 100% image generation, 100% error rate, 100% NSFW moderation flags
- **Spend**: $0 pack spend (small non-pack balance usage at most)
- **Account age**: All created within days of each other (Feb 2026)

---

# Data Sources

| Table | Key columns for abuse |
|-------|----------------------|
| `generation_event_v2` | `user_id`, `ip_hash`, `ip_subnet`, `response_status`, `total_price`, `selected_meter_slug`, `moderation_prompt_*`, `event_type` |
| `d1_user` | `id`, `email`, `github_username`, `banned`, `banReason`, `created_at` |

**IP implementation** (`src/middleware/track.ts`):
- `ip_hash`: Salted SHA-256 of full IP (irreversible)
- `ip_subnet`: Truncated to /24 (IPv4) or /48 (IPv6)
- Source: `cf-connecting-ip` header

---

# Action Log

| Date | Action | Count | Details |
|------|--------|-------|---------|
| 2026-03-06 | Banned bot farm | 277 | IP cluster ≥100, 95%+ errors, $0 pack spend |
| 2026-03-06 | Rate-limited bot farm | 42 | Same bot farm, no pack spend |
| 2026-03-06 | Rate-limited bot farm | 59 | Multi-signal: IP clusters, gibberish suffixes, disposable emails, hammering |
| 2026-09-16 | Banned card testers | 22 | Stripe fraud signals; 9 found by the scan, 13 by hand (pre-May charges). 176 card fingerprints added to the Radar block list |

---

# Notes

- **IP coverage**: Started 2026-03-06, ~19% user coverage initially. Re-run analysis as coverage grows.
- **d1_user sync lag**: The `d1_user` table in Tinybird syncs periodically (not real-time). After banning on D1, Tinybird data is stale — verify actions on D1 directly.
- **Pack spend is the strongest payment signal, but not proof** — see "Pack spend is not
  proof of payment". Filter on `pack_spend` to narrow the review, then check credit sources
  before treating it as cash paid.
- **Gibberish suffix usernames**: Bot farms use GitHub usernames with suffixes like `-boop`, `-a11y`, `-max`, `-sudo`, `-cmd`, `-stack`, `-pixel`, `-dot`, `-beep`, `-commits`, `-ops`, `-dotcom`, `-lang`, `-bit`. These are auto-generated.
- Consider adding: account age signal, GitHub account age, user-agent clustering
