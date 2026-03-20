---
name: abuse-detection
description: Detect and analyze abusive accounts on Pollinations. IP clustering, multi-signal scoring, ban recommendations. Use when investigating abuse, bot farms, or suspicious usage patterns.
---

# Requirements

- **Tinybird CLI** (`tb`): Must be authenticated
- Run queries from `enter.pollinations.ai/observability/` (has `.tinyb` config)
- **Cloudflare D1** access for banning users (via wrangler)

**Tinybird query pattern:**
```bash
cd enter.pollinations.ai/observability
tb --cloud sql "SELECT ... FROM generation_event ..."
```

> **Quoting**: Use double quotes for the SQL string. Use single quotes inside SQL. Avoid `!=` with `$'...'` shell quoting (escaping issues) — prefer `NOT IN ('undefined', '')` instead.

> **`tb` CLI caps at 100 rows.** For large result sets, use the HTTP API:
> ```bash
> TB_TOKEN=$(python3 -c "import json; print(json.load(open('.tinyb'))['token'])")
> curl -s "https://api.europe-west2.gcp.tinybird.co/v0/sql" \
>   -H "Authorization: Bearer $TB_TOKEN" \
>   --data-urlencode "q=SELECT ... FORMAT JSONCompact" | python3 -c "import json,sys; ..."
> ```

---

# Composite Abuse Score (0-100)

Six signals, each weighted independently:

| Signal | Max Points | Threshold | What it catches |
|--------|-----------|-----------|-----------------|
| IP cluster size | 30 | `cluster * 0.15` | Multiple users sharing same IP hash |
| Zero spend | 15 | `spend = 0` | No paid usage (free tier only) |
| Error rate | 15 | `>= 95%` (15pts), `>= 70%` (10pts) | Bots hammering failing endpoints |
| Moderation flags | 15 | `>= 90%` sexual (15pts), `>= 50%` (8pts) | NSFW generation bots |
| Disposable email | 15 | hotmail/outlook/proton + no spend | Random-string throwaway emails |
| IP rotation | 10 | `>= 50` IPs (10pts), `>= 20` (5pts) | Rotating through many exit IPs |

**Score interpretation:**

| Score | Action | False positive risk |
|-------|--------|-------------------|
| 90-100 | Ban immediately | Very low |
| 70-89 | Ban after quick review | Low |
| 40-69 | Manual review needed | Medium — check if spend is just free-tier allotment |
| 10-39 | Monitor only | High — many legit users with NSFW or errors |
| 0-9 | Clean | N/A |

---

# Quick Ban Criteria (High Confidence)

For microbe-tier users generating massive failing traffic, a simpler signal is sufficient:

```
microbe tier + 95%+ error rate + 1000+ requests/week
```

This catches bot farm accounts that are already rate-limited (microbe = 0 pollen) but still hammering the API with failing requests. These accounts waste server resources with zero legitimate usage.

**Query:**

```sql
SELECT user_id
FROM (
    SELECT
        g.user_id, u.tier,
        count() as total_reqs,
        countIf(g.response_status >= 400) * 100.0 / count() as err_pct
    FROM generation_event g
    LEFT JOIN d1_user u ON g.user_id = u.id
        AND u.synced_at = (SELECT max(synced_at) FROM d1_user)
    WHERE g.start_time >= now() - INTERVAL 7 DAY
        AND g.user_id NOT IN ('undefined', '')
    GROUP BY g.user_id, u.tier
    HAVING total_reqs >= 1000
)
WHERE tier = 'microbe' AND err_pct >= 95
```

> **Note**: `tb --cloud sql` caps output at 100 rows. For large result sets, use the Tinybird HTTP API with `FORMAT JSONCompact`.

## Spore Tier Abuse Finder

Finds spore users to demote. Returns candidates with IP cluster size for classification.

```sql
SELECT g.user_id, u.github_username, u.email, u.tier,
    count() as total_reqs,
    round(sum(g.total_price), 4) as total_spend,
    round(countIf(g.response_status >= 400) * 100.0 / count(), 1) as err_pct,
    countDistinct(g.ip_hash) as distinct_ips,
    max(coalesce(ips.ip_cluster_size, 0)) as max_ip_cluster
FROM generation_event g
LEFT JOIN d1_user u ON g.user_id = u.id
    AND u.synced_at = (SELECT max(synced_at) FROM d1_user)
LEFT JOIN (
    SELECT ip_hash, count(DISTINCT user_id) as ip_cluster_size
    FROM generation_event
    WHERE start_time >= now() - INTERVAL 7 DAY
        AND ip_hash NOT IN ('undefined', '')
        AND user_id NOT IN ('undefined', '')
    GROUP BY ip_hash
) ips ON g.ip_hash = ips.ip_hash
WHERE g.start_time >= now() - INTERVAL 7 DAY
    AND g.user_id NOT IN ('undefined', '')
    AND u.tier = 'spore'
GROUP BY g.user_id, u.github_username, u.email, u.tier
HAVING total_reqs >= 100 AND err_pct >= 90 AND total_spend <= 1.6
ORDER BY max_ip_cluster DESC, total_reqs DESC
```

Then classify programmatically using the demotion signals listed under "Safe to demote" above.

---

# Key Queries

## 1. Full Abuse Scoring Query

Returns all users with abuse score, sorted by score descending.

```sql
SELECT
    user_id, github_username, email, tier,
    total_reqs, total_spend, max_ip_cluster, distinct_ips,
    round(err_pct, 1) as err_pct, round(sex_pct, 1) as sex_pct,
    abuse_score
FROM (
    SELECT
        g.user_id, u.github_username, u.email, u.tier,
        count() as total_reqs,
        round(sum(g.total_price), 4) as total_spend,
        max(coalesce(ips.ip_cluster_size, 0)) as max_ip_cluster,
        countDistinct(g.ip_hash) as distinct_ips,
        countIf(g.response_status >= 400) * 100.0 / count() as err_pct,
        countIf(g.moderation_prompt_sexual_severity NOT IN ('safe', '')) * 100.0 / count() as sex_pct,
        round(
            least(30, max(coalesce(ips.ip_cluster_size, 0)) * 0.15) +
            multiIf(
                splitByChar('@', u.email)[2] = 'proton.me' AND sum(g.total_price) = 0, 15,
                splitByChar('@', u.email)[2] = 'hotmail.com' AND sum(g.total_price) = 0, 12,
                splitByChar('@', u.email)[2] = 'outlook.com' AND sum(g.total_price) = 0, 10,
                0) +
            if(sum(g.total_price) = 0, 15, 0) +
            if(countIf(g.response_status >= 400) * 100.0 / count() >= 95, 15,
               if(countIf(g.response_status >= 400) * 100.0 / count() >= 70, 10, 0)) +
            if(countIf(g.moderation_prompt_sexual_severity NOT IN ('safe', '')) * 100.0 / count() >= 90, 15,
               if(countIf(g.moderation_prompt_sexual_severity NOT IN ('safe', '')) * 100.0 / count() >= 50, 8, 0)) +
            if(countDistinct(g.ip_hash) >= 50, 10, if(countDistinct(g.ip_hash) >= 20, 5, 0))
        , 0) as abuse_score
    FROM generation_event g
    LEFT JOIN d1_user u ON g.user_id = u.id
        AND u.synced_at = (SELECT max(synced_at) FROM d1_user)
    LEFT JOIN (
        SELECT ip_hash, count(DISTINCT user_id) as ip_cluster_size
        FROM generation_event
        WHERE start_time >= now() - INTERVAL 7 DAY
            AND ip_hash NOT IN ('undefined', '')
            AND user_id NOT IN ('undefined', '')
        GROUP BY ip_hash
    ) ips ON g.ip_hash = ips.ip_hash
    WHERE g.start_time >= now() - INTERVAL 7 DAY
        AND g.user_id NOT IN ('undefined', '')
    GROUP BY g.user_id, u.github_username, u.email, u.tier
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
FROM generation_event
WHERE start_time >= now() - INTERVAL 7 DAY
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
    g.user_id, u.github_username, u.email, u.tier,
    sum(g.total_price) as spend
FROM generation_event g
LEFT JOIN d1_user u ON g.user_id = u.id
    AND u.synced_at = (SELECT max(synced_at) FROM d1_user)
WHERE g.start_time >= now() - INTERVAL 7 DAY
    AND g.ip_hash = '<IP_HASH_HERE>'
    AND g.user_id NOT IN ('undefined', '')
GROUP BY g.user_id, u.github_username, u.email, u.tier
ORDER BY spend DESC
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
| **Free tier spend** | Spore accounts show ~$1.50 "spend" from free allotment | Check `tier = 'spore'` and `spend <= 1.6` — not real payment |
| **High NSFW, legit user** | Some paying users generate NSFW content legitimately | Check spend > $5 — real customers |

**Safe to ban (high confidence):**
- Microbe tier + 95%+ error rate + 1000+ requests/week
- Score >= 90 + hotmail/outlook random email + zero spend + microbe tier
- Score >= 70 + IP cluster >= 100 + zero spend

**Safe to demote (spore → microbe):**
- IP cluster >= 10 + error rate >= 90%
- Gibberish suffix username (`-boop`, `-a11y`, `-bit`, `-lang`, `-max`, `-sudo`, `-dot`, `-beep`, `-commits`, `-pixel`, `-cmd`, `-stack`, `-ops`, `-dotcom`) + error >= 90%
- Disposable email (hotmail/outlook/proton/qq/mail.ru/vk.com/anonaddy/anondrop/rambler/gmx/yandex) + error >= 95% + $0 spend
- 100% error rate + $0 spend (zero successful requests ever)
- 99%+ error rate + 1000+ requests/week (hammering)
- Multi-account cluster (same email root, e.g. `reksely`/`notreksely`/`rekselicha`)

**Needs review:**
- Any account with spend > $2 (could be real customer)
- Accounts on Cloudflare IPs (`2a06:98c0:*`)
- Accounts with real-looking Gmail addresses
- Spore users with 90-95% error rate but some successful spend (may be bad integration, not abuse)

---

# Banning Users

## How Banning Works

The ban system uses **Better Auth** fields on the `user` table in Cloudflare D1:

| Field | Type | Description |
|-------|------|-------------|
| `banned` | boolean (integer 0/1) | Set to `1` to ban |
| `ban_reason` | text | Shown in 403 error response |
| `ban_expires` | integer (epoch ms) | `NULL` for permanent, epoch ms for temporary |

**Enforcement** (`src/middleware/auth.ts`):
- `assertNotBanned()` runs on every authenticated request (session + API key)
- If `banned = 1` and not expired → HTTP 403 with ban reason
- If `ban_expires` is set and has passed → ban is automatically lifted

**There is no admin API for banning** — use `wrangler d1 execute` directly.

## Ban Commands

```bash
# Single user ban (from enter.pollinations.ai/ directory)
npx wrangler d1 execute production-pollinations-enter-db --remote \
  --command "UPDATE user SET banned = 1, ban_reason = 'Bot farm abuse' WHERE id = '<USER_ID>'"

# Batch ban (from a file of user IDs, one per line)
IDS=$(cat user_ids_to_ban.txt | sed "s/^/'/;s/$/'/" | paste -sd, -)
npx wrangler d1 execute production-pollinations-enter-db --remote \
  --command "UPDATE user SET banned = 1, ban_reason = 'Automated: bot farm abuse' WHERE id IN ($IDS)"

# Unban a user (if false positive)
npx wrangler d1 execute production-pollinations-enter-db --remote \
  --command "UPDATE user SET banned = 0, ban_reason = NULL WHERE id = '<USER_ID>'"

# Temporary ban (expires after 7 days)
npx wrangler d1 execute production-pollinations-enter-db --remote \
  --command "UPDATE user SET banned = 1, ban_reason = 'Temporary: rate abuse', ban_expires = $(date -v+7d +%s)000 WHERE id = '<USER_ID>'"
```

## Demote Commands (spore → microbe)

Demotion is preferred over banning for spore-tier abuse — it removes their pollen and rate-limits them without a hard block.

```bash
# Batch demote (from a file of user IDs, one per line)
IDS=$(cat user_ids_to_demote.txt | sed "s/^/'/;s/$/'/" | paste -sd, -)
npx wrangler d1 execute production-pollinations-enter-db --remote \
  --command "UPDATE user SET tier = 'microbe', tier_balance = 0 WHERE id IN ($IDS) AND tier = 'spore'"

# Verify (check a sample)
IDS=$(head -5 user_ids_to_demote.txt | sed "s/^/'/;s/$/'/" | paste -sd, -)
npx wrangler d1 execute production-pollinations-enter-db --remote \
  --command "SELECT id, tier, tier_balance FROM user WHERE id IN ($IDS)"
```

> **Important**: Always include `AND tier = 'spore'` as a safety guard — prevents accidentally demoting users who were already upgraded.

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
- **Behavior**: 100% image generation, 100% error rate (microbe tier), 100% NSFW moderation flags
- **Spend**: $0 (microbe) or ~$1.50 (spore free allotment)
- **Account age**: All created within days of each other (Feb 2026)

---

# Data Sources

| Table | Key columns for abuse |
|-------|----------------------|
| `generation_event` | `user_id`, `ip_hash`, `ip_subnet`, `response_status`, `total_price`, `moderation_prompt_*`, `event_type` |
| `d1_user` | `id`, `email`, `github_username`, `tier`, `banned`, `banReason`, `created_at` |

**IP implementation** (`src/middleware/track.ts`):
- `ip_hash`: Salted SHA-256 of full IP (irreversible)
- `ip_subnet`: Truncated to /24 (IPv4) or /48 (IPv6)
- Source: `cf-connecting-ip` header

---

# Action Log

| Date | Action | Count | Details |
|------|--------|-------|---------|
| 2026-03-06 | Banned microbe bot farm | 277 | IP cluster ≥100, 95%+ errors, $0 spend |
| 2026-03-06 | Demoted spore → microbe | 42 | Same bot farm, spore tier with free allotment |
| 2026-03-06 | Demoted spore → microbe | 59 | Multi-signal: IP clusters, gibberish suffixes, disposable emails, hammering |

---

# Notes

- **IP coverage**: Started 2026-03-06, ~19% user coverage initially. Re-run analysis as coverage grows.
- **d1_user sync lag**: The `d1_user` table in Tinybird syncs periodically (not real-time). After banning/demoting on D1, Tinybird data is stale — verify actions on D1 directly.
- **Spore "spend" is misleading**: Spore tier gets ~$0.01/hour (~$0.24/day) free allotment. Filter with `total_spend <= 0.25` to catch free-only users.
- **Gibberish suffix usernames**: Bot farms use GitHub usernames with suffixes like `-boop`, `-a11y`, `-max`, `-sudo`, `-cmd`, `-stack`, `-pixel`, `-dot`, `-beep`, `-commits`, `-ops`, `-dotcom`, `-lang`, `-bit`. These are auto-generated.
- Consider adding: account age signal, GitHub account age, user-agent clustering
