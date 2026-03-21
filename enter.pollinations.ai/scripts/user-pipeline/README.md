# User Pipeline

This document is the intended contract for the implemented user pipeline on this branch.

One-time backfills are separate operational jobs and are not part of the steady-state pipeline.

Manual emergency tools are also separate and live outside the steady-state flow under `scripts/user-pipeline/manual/`.

The one-time `trust_score = 0/100` bootstrap remains migration-only in `drizzle/0017_add_score_and_trust_score.sql`; it is not part of steady-state code.

`trust_score` is the single trust field for the implemented pipeline:

- it is first written by the hourly onboarding trust gate

See also:

- [`PRODUCTION_ROLLOUT.md`](./PRODUCTION_ROLLOUT.md) for the final pre-merge productionization checklist and the initial dry-run rollout plan.

## Implemented Jobs

1. Hourly new-user trust gate and tier pipeline
2. Daily spore recheck

## Layout

Current checked-in layout on this branch:

```text
scripts/user-pipeline/
├── hourly-new-users.ts
├── daily-spore-recheck.ts
├── scoring/
│   ├── trust-score.ts
│   ├── trust-score-prompt.md
│   ├── github-score.ts
│   └── github-risk.ts
├── shared/
│   ├── d1.ts
│   ├── email-cohort.ts
│   ├── github-identity.ts
│   ├── github.ts
│   └── llm.ts
├── audit-github-accounts.ts
├── backfills/
│   ├── backfill-spore-scores.ts
│   └── backfill-trust-scores.ts
└── test/
    ├── TESTING.md
    ├── STAGING.md
    ├── cohort-setup.ts
    ├── reset-cohort.ts
    ├── verify-results.ts
    ├── user-pipeline.test.ts
    ├── github-risk.test.ts
    └── github-score.test.ts
```

## Hourly New-User Pipeline

- Targets users where `trust_score IS NULL` and `banned = 0`
- Builds one reverse-chronological pending queue ordered by `created_at DESC`
- Holds back the newest `30` pending users so they become newer-side context on the next run
- Scores every remaining pending user in consecutive `30`-user target groups
- For each target group, fetches up to `30` newer neighbors and `30` older neighbors by registration date
- Context neighbors may already have a `trust_score`; they are prompt-only and are never rewritten
- Users waiting at least `90` minutes bypass the holdback buffer and get scored immediately
- Bans missing/invalid `github_id` rows before calling GitHub
- Validates that the GitHub account still exists by `github_id` before any other checks
- Uses `github_id` as the identity key for validation and writes
- Uses the stored `github_username` from D1 only as LLM context
- Sends `30/30/30` trust batches to the LLM:
  `newer context + target users + older context`
- The LLM returns scores only for the middle target users; only those target rows get `trust_score` written
- Scores developer activity immediately for trusted users
- Applies a separate GitHub risk check before allowing `seed`
- Allows a direct `microbe -> seed` upgrade for users who already qualify

```mermaid
%%{init: {'theme': 'dark', 'themeVariables': {'lineColor': '#ffffff', 'edgeLabelBackground': 'transparent'}}}%%
flowchart TD
    A["User Signs Up"] --> B["Initialize user
tier = microbe
tier_balance = 0
trust_score = NULL
score = NULL
score_checked_at = NULL"]

    B --> C["Hourly New-User Pipeline
Target users:
trust_score IS NULL
AND banned = 0"]

    C --> D["Fetch pending queue
    ORDER BY created_at DESC"]
    D --> E["Hold back newest 30 pending users
    unless they waited >= 90 minutes"]
    E --> F{"Any target users?"}
    F -->|No| G["Exit
    Wait for more context"]
    F -->|Yes| H["For each 30-user target group:
    fetch up to 30 newer neighbors
    and 30 older neighbors"]

    H --> I["GitHub Account Validation
    Validate by github_id"]

    I --> J{"GitHub account valid?"}
    J -->|No| K["Ban user
banned = 1
ban_reason = github_id_invalid
or github_account_deleted"]
    J -->|Yes| L["LLM Trust Evaluation
Send 30 newer context +
30 targets + 30 older context
Write trust_score only for targets"]

    L --> M{"trust_score >= 60?"}
    M -->|No| N["Stay Microbe
No automatic re-check"]
    M -->|Yes| O["GitHub Developer Scoring
Write score
Write score_checked_at"]

    O --> P["GitHub Risk Check
Block suspicious seed upgrades"]

    P --> Q{"score >= 8
AND risk is ok?"}
    Q -->|Yes| R["Promote directly to Seed
tier = seed"]
    Q -->|No| S["Promote to Spore
tier = spore"]

    style K fill:#833,color:#fff
    style N fill:#c44,color:#fff
    style S fill:#47a,color:#fff
    style R fill:#4a4,color:#fff
```

## Daily Spore Recheck Pipeline

- Runs only on unbanned `spore` users
- Rechecks the users who have waited the longest since their last GitHub score check
- Daily slice size is `ceil(current_spore_count / 7)`
- Bans missing/invalid `github_id` rows before calling GitHub
- Validates GitHub account existence by `github_id` before scoring
- Uses `github_id` as the only GitHub identity key in the active pipeline
- Applies the same GitHub risk check before allowing `seed`
- This keeps the full `spore` pool rotating over roughly one week, even as the pool grows

## Backfill And Replay Tools

- `backfills/backfill-trust-scores.ts` (staging only) sets `trust_score = 100` for all non-microbe users with no trust score — run once to bootstrap staging before testing
- `backfills/backfill-spore-scores.ts` backfills `score` and `score_checked_at` for existing `spore` users
- `audit-github-accounts.ts` audits GitHub account validity for D1 users
- `test/replay-hourly-new-users.ts` resets a staging cohort and reruns the hourly trust + tier pipeline
- `test/replay-daily-spore-recheck.ts` resets a staging cohort and reruns the daily `spore -> seed` pipeline

```mermaid
%%{init: {'theme': 'dark', 'themeVariables': {'lineColor': '#ffffff', 'edgeLabelBackground': 'transparent'}}}%%
flowchart TD
    A["Daily Spore Recheck Pipeline"] --> B["Select users where:
tier = spore
AND banned = 0
Order by score_checked_at ASC
Take oldest ceil(total_spores / 7) users"]

    B --> C{"Any spore users to check?"}
    C -->|No| D["Exit"]
    C -->|Yes| E["GitHub Account Validation
Validate by github_id"]

    E --> F{"GitHub account valid?"}
    F -->|No| G["Ban user
banned = 1
ban_reason = github_id_invalid
or github_account_deleted"]
    F -->|Yes| H["GitHub Developer Scoring
Write score
Write score_checked_at"]

    H --> I["GitHub Risk Check
Block suspicious seed upgrades"]

    I --> J{"score >= 8
AND risk is ok?"}
    J -->|Yes| K["Promote to Seed
tier = seed"]
    J -->|No| L["Stay Spore
Checked again later"]

    style G fill:#833,color:#fff
    style L fill:#47a,color:#fff
    style K fill:#4a4,color:#fff
```
