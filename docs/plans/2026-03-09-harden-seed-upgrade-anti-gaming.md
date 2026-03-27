# Harden Spore→Seed Auto-Upgrade: Anti-Gaming

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add fraud detection layer to the seed upgrade scoring script so gamers with empty repos and fake stars get rejected, while legit users pass through unchanged.

**Architecture:** Keep base scoring formula identical (same weights, threshold, UX). Add quality filtering on GraphQL data (skip empty repos) and a fraud detection layer that catches burst creation, star uniformity, and empty-repo dominance. Only gamers trigger these — legit devs never will.

**Tech Stack:** Python 3.11, GitHub GraphQL API, existing workflow infrastructure

---

### Task 1: Enhance GraphQL query with repo quality fields

**Files:**
- Modify: `.github/scripts/user_validate_github_profile.py:37-53`

**Step 1: Update `build_query()` to fetch quality signals**

Add `diskUsage`, `createdAt`, `forkCount` to repo nodes. Increase from `first: 5` to `first: 10` for better pattern sampling.

```python
def build_query(usernames: list[str]) -> str:
    """Build GraphQL query for multiple users."""
    from_date = (datetime.now(timezone.utc) - timedelta(days=90)).strftime("%Y-%m-%dT00:00:00Z")
    fragments = []
    for i, username in enumerate(usernames):
        safe_username = username.replace('"', '\\"').replace("\\", "\\\\")
        fragments.append(f'''
    u{i}: user(login: "{safe_username}") {{
        login
        createdAt
        followers {{ totalCount }}
        repositories(privacy: PUBLIC, isFork: false, first: 10, orderBy: {{field: STARGAZERS, direction: DESC}}) {{
            totalCount
            nodes {{
                stargazerCount
                diskUsage
                createdAt
                forkCount
            }}
        }}
        contributionsCollection(from: "{from_date}") {{ totalCommitContributions }}
    }}''')
    return f"query {{ {''.join(fragments)} }}"
```

Changes from current:
- `first: 5` → `first: 10` (better sampling, negligible API cost increase)
- Added `diskUsage` (KB on disk, 0 = empty repo)
- Added `createdAt` on repo nodes (for burst detection)
- Added `forkCount` on repo nodes (engagement signal)
- Added `followers { totalCount }` on user (for star/follower ratio check)

**Step 2: Verify no API cost increase**

The GraphQL complexity cost is based on node count, not scalar fields. Going from `first: 5` to `first: 10` doubles repo nodes per user (from 250 to 500 per batch of 50 users). At ~3→6 points per batch, max batches go from 333 to 166. With MAX_USERS_PER_RUN=8000 and BATCH_SIZE=50, that's 160 batches — still well under limit.

---

### Task 2: Add quality filtering to `score_user()`

**Files:**
- Modify: `.github/scripts/user_validate_github_profile.py:56-98`

**Step 1: Replace raw counts with quality-filtered counts**

Only count repos with actual content (`diskUsage > 0`). Only count stars from those repos.

```python
def score_user(data: dict | None, username: str, verbose: bool = False) -> dict:
    """Calculate score for a single user. Returns dict with username, approved, reason."""
    if not data:
        return {"username": username, "approved": False, "reason": "User not found", "details": None}

    created = datetime.fromisoformat(data["createdAt"].replace("Z", "+00:00"))
    age_days = (datetime.now(timezone.utc) - created).days

    # Quality filtering: only count repos with actual content
    all_nodes = [n for n in (data["repositories"].get("nodes") or []) if n]
    quality_nodes = [n for n in all_nodes if n.get("diskUsage", 0) > 0]

    metrics = {
        "age_days": age_days,
        "repos": len(quality_nodes),
        "commits": data["contributionsCollection"]["totalCommitContributions"],
        "stars": sum(n["stargazerCount"] for n in quality_nodes),
    }

    # Calculate individual scores (unchanged formula)
    scores = {}
    for config in SCORING:
        field = config["field"]
        raw = metrics[field] * config["multiplier"]
        capped = min(raw, config["max"])
        scores[field] = capped

    total_score = sum(scores.values())

    details = {
        "age_days": age_days,
        "age_pts": scores["age_days"],
        "repos": metrics["repos"],
        "repos_pts": scores["repos"],
        "commits": metrics["commits"],
        "commits_pts": scores["commits"],
        "stars": metrics["stars"],
        "stars_pts": scores["stars"],
        "total": total_score,
        "quality_repos": len(quality_nodes),
        "total_repos": data["repositories"]["totalCount"],
        "total_fetched": len(all_nodes),
    }

    # Fraud detection layer (Task 3)
    fraud_signals = detect_fraud(data, all_nodes, quality_nodes)
    if fraud_signals:
        details["fraud_signals"] = fraud_signals
        return {
            "username": username,
            "approved": False,
            "reason": f"fraud: {'; '.join(fraud_signals)}",
            "details": details,
        }

    return {
        "username": username,
        "approved": total_score >= THRESHOLD,
        "reason": f"{total_score:.1f} pts",
        "details": details,
    }
```

**Impact on legit users:** Zero. A legit user with 2+ repos containing actual code still gets max 1.0 pts for repos. Their stars on real repos still count. Scoring weights and threshold unchanged.

**Impact on gamers:** Empty repos → filtered out → 0 quality repos → 0 pts for repos + 0 pts for stars. Old dormant account gets 6 pts from age but can't reach 8 without real repos/commits.

---

### Task 3: Add fraud detection function

**Files:**
- Modify: `.github/scripts/user_validate_github_profile.py` (add new function before `score_user`)

**Step 1: Implement `detect_fraud()`**

Three checks that only trigger on clearly artificial patterns:

```python
def detect_fraud(data: dict, all_nodes: list[dict], quality_nodes: list[dict]) -> list[str]:
    """Detect gaming patterns. Returns list of fraud signals (empty = clean)."""
    signals = []

    if len(all_nodes) < 3:
        return signals  # Not enough data to detect patterns

    total_repos = data["repositories"]["totalCount"]

    # 1. Burst creation of empty repos
    #    Flag: 5+ empty repos created in the last 7 days
    #    Why: Legit devs don't create many empty repos in a week
    now = datetime.now(timezone.utc)
    week_ago = now - timedelta(days=7)
    recent_empty = 0
    for node in all_nodes:
        repo_created = datetime.fromisoformat(node["createdAt"].replace("Z", "+00:00"))
        is_empty = node.get("diskUsage", 0) == 0
        if repo_created > week_ago and is_empty:
            recent_empty += 1
    if recent_empty >= 5:
        signals.append(f"burst_empty_repos: {recent_empty} empty repos created in last 7 days")

    # 2. Star uniformity on non-quality repos
    #    Flag: 5+ repos all have the exact same non-zero star count
    #    Why: Sockpuppets give uniform stars; organic stars vary wildly
    star_counts = [n["stargazerCount"] for n in all_nodes if n["stargazerCount"] > 0]
    if len(star_counts) >= 5:
        from collections import Counter
        most_common_count, most_common_freq = Counter(star_counts).most_common(1)[0]
        if most_common_freq >= 5 and most_common_freq / len(star_counts) > 0.6:
            signals.append(
                f"star_uniformity: {most_common_freq}/{len(star_counts)} starred repos "
                f"have exactly {most_common_count} stars"
            )

    # 3. Empty repo dominance
    #    Flag: >80% of fetched repos are empty AND user has 20+ total repos
    #    Why: Real developers don't have dozens of empty repos
    empty_count = len(all_nodes) - len(quality_nodes)
    if len(all_nodes) >= 5 and empty_count / len(all_nodes) > 0.8 and total_repos > 20:
        signals.append(
            f"empty_repo_dominance: {empty_count}/{len(all_nodes)} fetched repos empty, "
            f"{total_repos} total repos"
        )

    return signals
```

**Why each check is safe for legit users:**

| Check | Gamer trigger | Legit user reality |
|-------|--------------|-------------------|
| Burst empty repos | 80 empty repos in 2 hours | Devs create repos with code, not empty ones |
| Star uniformity | Sockpuppets give exactly 2-3 stars each | Natural stars vary: 0, 1, 5, 50, 200... |
| Empty repo dominance | 90% of repos are 0 bytes | Even small projects have >0 diskUsage |

---

### Task 4: Update frontend tooltip (minor)

**Files:**
- Modify: `enter.pollinations.ai/src/client/components/balance/tier-explanation.tsx:38-41`

**Step 1: Update "Public repos" label to hint at quality filter**

Change the tooltip row from "Public repos" to "Public repos (with code)" so users know empty repos don't count:

```tsx
<tr className="border-b border-gray-100">
    <td className="py-1 text-gray-600">Public repos (with code)</td>
    <td className="py-1 text-right text-gray-800">
        0.5pt each (max 1)
    </td>
</tr>
```

And similarly for stars:

```tsx
<tr>
    <td className="py-1 text-gray-600">Stars (on repos with code)</td>
    <td className="py-1 text-right text-gray-800">
        0.1pt each (max 5)
    </td>
</tr>
```

---

### Task 5: Update scoring config comment

**Files:**
- Modify: `.github/scripts/user_validate_github_profile.py:28-33`

**Step 1: Update docstring and comments to reflect quality filtering**

```python
# Scoring config: each metric has a multiplier and max points
# NOTE: If you update these values, also update enter.pollinations.ai/src/client/components/balance/tier-explanation.tsx
# repos and stars are quality-filtered: only repos with diskUsage > 0 count
SCORING = [
    {"field": "age_days", "multiplier": 0.5/30, "max": 6.0},  # 0.5pt/month, max 6 (12 months)
    {"field": "commits",  "multiplier": 0.1,    "max": 2.0},  # 0.1pt each, max 2
    {"field": "repos",    "multiplier": 0.5,    "max": 1.0},  # 0.5pt each, max 1 (quality repos only)
    {"field": "stars",    "multiplier": 0.1,    "max": 5.0},  # 0.1pt each, max 5 (from quality repos only)
]
```

---

### Task 6: Add verbose fraud logging to upgrade script

**Files:**
- Modify: `.github/scripts/user_upgrade_spore_to_seed.py:229-246`

**Step 1: Show fraud rejections in verbose output**

Update the verbose breakdown to show fraud signals when present:

```python
if args.verbose:
    print("\n📊 Score breakdown samples (first 20):")
    print(f"   {'Username':<25} {'Age':<12} {'Repos':<12} {'Commits':<12} {'Stars':<12} {'Total':<8}")
    print(f"   {'-'*25} {'-'*12} {'-'*12} {'-'*12} {'-'*12} {'-'*8}")
    for r in results[:20]:
        d = r.get("details")
        if d:
            status = "✅" if r["approved"] else "❌"
            fraud = " 🚨FRAUD" if d.get("fraud_signals") else ""
            print(f"   {r['username']:<25} {d['age_days']:>4}d={d['age_pts']:.1f}pt  {d['repos']:>3}={d['repos_pts']:.1f}pt    {d['commits']:>4}={d['commits_pts']:.1f}pt   {d['stars']:>4}={d['stars_pts']:.1f}pt   {status}{d['total']:.1f}{fraud}")
            if d.get("fraud_signals"):
                for sig in d["fraud_signals"]:
                    print(f"     🚨 {sig}")
        else:
            print(f"   {r['username']:<25} (not found)")
```

Also show fraud count in the summary (after line 227):

```python
fraud_rejected = [r for r in results if r.get("details", {}).get("fraud_signals")]
if fraud_rejected:
    print(f"   🚨 Fraud-flagged: {len(fraud_rejected)}")
```

---

### Verification

After all tasks, verify:

1. **sunqingquan scenario**: Old account (2012), 89 repos mostly empty, 2-3 stars each
   - Quality repos: ~0-2 → score drops to ~6-7 pts (age only) → REJECTED
   - Fraud: burst_empty_repos + star_uniformity + empty_repo_dominance → REJECTED

2. **Legit old developer**: Account from 2020, 15 repos with code, varied stars
   - Quality repos: 10+ pass filter → scoring unchanged
   - No fraud signals → passes normally

3. **Legit new developer**: Account from 2025, 3 repos with code, few commits
   - Quality repos: 3 pass → 1 pt repos
   - No fraud signals → passes/fails on actual merits
