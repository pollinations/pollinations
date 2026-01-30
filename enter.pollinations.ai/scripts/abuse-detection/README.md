# Abuse Detection System

Unified pipeline for detecting abuse patterns through identity signals and behavioral analysis.

## Quick Start

```bash
cd enter.pollinations.ai

# Run the unified pipeline (identity + behavioral analysis)
TINYBIRD_INGEST_TOKEN=$(grep '^TINYBIRD_INGEST_TOKEN=' .dev.vars | cut -d'=' -f2) \
  npx tsx scripts/abuse-detection/analyze-abuse.ts export-csv --env production

# Without Tinybird (identity signals only)
npx tsx scripts/abuse-detection/analyze-abuse.ts export-csv --env production
```

**Output**: `flagged-users.csv` + `flagged-users-summary.md`

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     UNIFIED PIPELINE                            │
│              (analyze-abuse.ts export-csv)                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Step 1: Fetch D1 Users                                         │
│  ├─ email, github_username, github_id                           │
│  └─ tier, created_at                                            │
│                           │                                     │
│                           ▼                                     │
│  Step 2: Fetch Tinybird Behavioral Data                         │
│  ├─ requests, consumption (7d/30d)                              │
│  ├─ error rates, rate limits                                    │
│  └─ moderation flags, cache hits                                │
│                           │                                     │
│                           ▼                                     │
│  Step 3: Compute Combined Scores                                │
│  ├─ Identity score (registration signals)                       │
│  ├─ Behavior score (usage patterns)                             │
│  └─ Combined score → risk band                                  │
│                           │                                     │
│                           ▼                                     │
│  Step 4: Output                                                 │
│  ├─ flagged-users.csv (all data)                                │
│  └─ flagged-users-summary.md                                    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Scoring System

### Combined Score = Identity + Behavior (0-100)

The final score combines two components:

**Identity Score** (registration signals):
| Signal | Weight |
|--------|--------|
| `disposable_email` | 50 |
| `burst_registration` | 50 |
| `github_id_cluster` | 40 |
| `email_duplicate` | 25 |
| `username_pattern` | 15 |
| `cross_domain` | 15 |
| `github_noreply` | 5 |

**Behavior Score** (usage patterns):
| Pattern | Points |
|---------|--------|
| High client error rate (≥50%) | +30 |
| Rate-limit pressure (≥30%) | +10 |
| Single model, high volume | +10 |
| Very high cache hits (≥90%) | +20 |
| Moderation flag rate (≥5%) | +20 |
| Many moderation flags (≥25) | +10 |
| Human exploration (diverse models, low errors) | -20 |

### Risk Bands

| Band | Criteria | Action |
|------|----------|--------|
| `enforce` | Hard signals OR combined ≥70 + 2+ signals | Auto-downgrade |
| `review` | Combined ≥40 OR 2+ signals | Manual review |
| `watch` | Low score, single weak signal | Monitor |

---

## Identity Signals

### 1. Disposable Email
~3000 known throwaway domains (tempmail.com, guerrillamail.com, etc.)

### 2. Burst Registration
15+ accounts created within 5 minutes → scripted OAuth attack

### 3. GitHub ID Cluster
Sequential GitHub IDs + registered within 60 min on our platform.
- Density factor: `users / id_range` (clamped 0-1)

### 4. Email Duplicate
Same normalized email after dot/plus removal and domain aliasing.

### 5. Username Pattern
Similar GitHub usernames (e.g., `user1`, `user2` → base `user`)

### 6. Cross-Domain
Same high-entropy email prefix across providers (john123@gmail.com + john123@yahoo.com)

---

## CSV Output Columns

### User Info
`user_id`, `email`, `github_username`, `github_id`, `tier`, `registered_at`

### Signal Flags
`flag_reasons`, `burst_cluster_id`, `ghid_cluster_id`, `sig_disposable`, `sig_github_noreply`, `sig_email_dup`, `email_dup_count`, `sig_username_pattern`, `username_base`, `username_match_count`, `sig_cross_domain`, `email_local_base`, `cross_domain_count`, `sig_burst_reg`, `burst_cluster_size`, `sig_github_id_cluster`, `github_id_cluster_size`

### Scoring
`identity_score`, `behavior_score`, `combined_score`, `confidence_level`, `risk_band`, `confidence_breakdown`

### Usage (when TINYBIRD_READ_TOKEN set)
`requests_30d`, `tier_consumed_30d`, `tier_usage_pct_30d`, `pack_consumed_30d`

### Behavioral Metrics
`error_rate_30d`, `client_error_rate_30d`, `rate_limited_rate_30d`, `unique_models_30d`, `cache_hit_rate_30d`, `moderation_flags_30d`

---

## Tinybird Pipe

### `user_behavior_summary`

**Location**: `observability/endpoints/user_behavior_summary.pipe`  
**Endpoint**: `https://api.europe-west2.gcp.tinybird.co/v0/pipes/user_behavior_summary.json`

Provides usage and behavioral metrics for forensic analysis:

| Column | Description |
|--------|-------------|
| `requests_total_30d` | All requests (billed + unbilled) |
| `requests_billed_30d` | Billed requests only |
| `tier_consumed_30d` | Pollen from tier allowance |
| `pack_consumed_30d` | Pollen from pack balance |
| `error_rate_30d` | Server error rate (5xx) |
| `client_error_rate_30d` | Client error rate (4xx) |
| `rate_limited_rate_30d` | Rate-limited request ratio |
| `unique_models_requested_30d` | Model diversity |
| `cache_hit_rate_30d` | Cache hit ratio |
| `moderation_flags_count_30d` | Total moderation triggers |
| `moderation_flag_rate_30d` | Moderation flag ratio |

---

## Environment Variables

| Variable | Source | Purpose |
|----------|--------|---------|
| `CLOUDFLARE_API_TOKEN` | Cloudflare Dashboard | D1 database access |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare Dashboard | Account identifier |
| `TINYBIRD_INGEST_TOKEN` | `.dev.vars` | Behavioral data (optional) |

---

## Future Improvements

- [ ] IP/ASN clustering
- [ ] GitHub account age verification
- [ ] Pre-indexed lookup maps for O(1) duplicate detection
