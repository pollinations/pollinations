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
tb --cloud sql "SELECT ... FROM generation_event ..."
```

> **Workspace**: This skill is **prod-only**. The `.tinyb` in `observability/` points to the `pollinations_enter` workspace for prod traffic. Staging traffic lives in `pollinations_enter_staging` and has no real abuse signal.

> **Quoting**: Use double quotes for the SQL string. Use single quotes inside SQL. Avoid `!=` with `$'...'` shell quoting; prefer `NOT IN ('undefined', '')`.

---

# Composite Abuse Score

Use independent signals and review the actual account before taking destructive action:

| Signal | Max Points | What it catches |
|--------|-----------:|-----------------|
| IP cluster size | 30 | Multiple users sharing same IP hash |
| Zero pack spend | 15 | No paid usage |
| Error rate | 15 | Bots hammering failing endpoints |
| Moderation flags | 15 | Repeated blocked generations |
| Disposable email | 15 | Random-string throwaway emails |
| IP rotation | 10 | Many exit IPs per account |

**Score interpretation:**

| Score | Action | False positive risk |
|-------|--------|-------------------|
| 90-100 | Ban after quick verification | Very low |
| 70-89 | Manual review, then likely ban | Low |
| 40-69 | Manual review needed | Medium |
| 10-39 | Monitor only | High |
| 0-9 | Clean | N/A |

---

# Key Queries

## 1. Full Abuse Scoring Query

Returns users with abuse score, sorted by score descending. The spend signal uses `meter_source` to distinguish paid pack consumption from the other active balance bucket.

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
        round(sumIf(g.total_price, g.meter_source IN ('v1:meter:pack', 'local:pack')), 4) as pack_spend,
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
    GROUP BY g.user_id, u.github_username, u.email
    HAVING total_reqs >= 5
)
WHERE abuse_score >= 40
ORDER BY abuse_score DESC, total_reqs DESC
LIMIT 100
```

## 2. IP Cluster Analysis

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
    g.user_id, u.github_username, u.email,
    sumIf(g.total_price, g.meter_source IN ('v1:meter:pack', 'local:pack')) as pack_spend,
    sum(g.total_price) as total_spend
FROM generation_event g
LEFT JOIN d1_user u ON g.user_id = u.id
    AND u.synced_at = (SELECT max(synced_at) FROM d1_user)
WHERE g.start_time >= now() - INTERVAL 7 DAY
    AND g.ip_hash = '<IP_HASH_HERE>'
    AND g.user_id NOT IN ('undefined', '')
GROUP BY g.user_id, u.github_username, u.email
ORDER BY pack_spend DESC
```

## 4. Extract User IDs for Banning

```sql
SELECT user_id
FROM ( /* full scoring subquery from #1 */ )
WHERE abuse_score >= 90
```

---

# Known False Positive Patterns

Always check before banning:

| Pattern | Why it can be false positive | How to detect |
|---------|------------------------------|---------------|
| Cloudflare WARP/Workers | Legit users behind shared Cloudflare networks | Check `ip_subnet` starts with `2a06:98c0` |
| VPN/proxy clusters | Multiple real users behind same VPN exit | Check if cluster has paid pack spend and real emails |
| Carrier NAT | Mobile carriers share IPs via NAT | Cross-reference with email pattern and spend |
| High errors, real customer | Bad integration rather than abuse | Check pack spend, API key volume, issue reports |
| High moderation flags, real customer | Some legitimate users generate sensitive content | Check pack spend and request diversity |

High-confidence ban candidates:

- Score >= 90 with disposable email, zero pack spend, and repeated failing traffic.
- Score >= 70 with IP cluster >= 100 and zero pack spend.
- 99%+ error rate with 1000+ requests/week and no successful traffic.

---

# Banning Users

The ban system uses Better Auth fields on the `user` table in Cloudflare D1:

| Field | Type | Description |
|-------|------|-------------|
| `banned` | boolean (integer 0/1) | Set to `1` to ban |
| `ban_reason` | text | Shown in 403 error response |
| `ban_expires` | integer (epoch ms) | `NULL` for permanent, epoch ms for temporary |

**Enforcement** (`src/middleware/auth.ts`):

- `assertNotBanned()` runs on every authenticated request (session + API key).
- If `banned = 1` and not expired, the request returns HTTP 403 with the ban reason.
- If `ban_expires` is set and has passed, the ban is automatically lifted.

**There is no admin API for banning**: use `wrangler d1 execute` directly.

## Ban Commands

```bash
# Single user ban (from enter.pollinations.ai/)
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

**D1 database names:**

- Production: `production-pollinations-enter-db`
- Staging: `staging-pollinations-enter-db`
- Development: `development-pollinations-enter-db`

---

# Data Sources

| Table | Key columns for abuse |
|-------|----------------------|
| `generation_event` | `user_id`, `ip_hash`, `ip_subnet`, `response_status`, `total_price`, `meter_source`, `moderation_prompt_*`, `event_type` |
| `d1_user` | `id`, `email`, `github_username`, `banned`, `banReason`, `created_at` |

**IP implementation** (`src/middleware/track.ts`):

- `ip_hash`: Salted SHA-256 of full IP (irreversible)
- `ip_subnet`: Truncated to /24 (IPv4) or /48 (IPv6)
- Source: `cf-connecting-ip` header

---

# Notes

- **IP coverage** started 2026-03-06; re-run analysis as coverage grows.
- **d1_user sync lag**: the `d1_user` table in Tinybird syncs periodically. After banning in D1, Tinybird data is stale; verify actions on D1 directly.
- **Pack spend is the strongest payment signal** for abuse review. Total generation spend can include non-pack balance-bucket usage.
- Consider adding: account age signal, GitHub account age, user-agent clustering.
