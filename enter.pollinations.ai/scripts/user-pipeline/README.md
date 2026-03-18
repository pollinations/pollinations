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
├── daily-spore-recheck.py
├── scoring/
│   ├── trust-score.ts
│   ├── trust-score-helpers.ts
│   ├── github_score.py
│   ├── github_risk.py
│   └── test_github_risk.py
├── shared/
│   ├── d1.ts
│   ├── d1.py
│   ├── email-cohort.ts
│   ├── github-identity.ts
│   ├── github_account_state.py
│   ├── python.ts
│   └── python_runtime.py
├── manual/
│   ├── cleanup-github-users.ts
│   ├── replay-hourly-new-users.py
│   └── replay-daily-spore-recheck.py
└── backfills/
    └── backfill-spore-scores.py
```

## Local Python

- Python package scripts honor `PYTHON_BIN` if it is set.
- If `PYTHON_BIN` is not set, the launcher prefers `python3.11`, then falls back to `python3`.
- This keeps local replay and backfill commands stable even when the machine default `python3` is not the interpreter that has the required SSL certificates or Python packages.

## Hourly New-User Pipeline

- Targets users where `trust_score IS NULL` and `banned = 0`
- Uses all recent unbanned users from the last 24 hours as the reference context for trust scoring
- Validates that the GitHub account still exists by `github_id` before any other checks
- Syncs `github_username` from GitHub when the user has renamed their account
- Uses LLM trust scoring to decide whether the user can leave `microbe`
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

    C --> D{"Any target users?"}
    D -->|No| E["Exit"]
    D -->|Yes| F["Build 24h Reference Window
All recent unbanned users
from the last 24 hours"]

    F --> G["GitHub Account Validation
Validate by github_id
Sync current github_username"]

    G --> H{"GitHub account valid?"}
    H -->|No| I["Ban user
banned = 1
ban_reason = github_account_deleted"]
    H -->|Yes| J["LLM Trust Evaluation
Score target users using the
24h reference context
Write trust_score"]

    J --> K{"trust_score >= 60?"}
    K -->|No| L["Stay Microbe
No automatic re-check"]
    K -->|Yes| M["GitHub Developer Scoring
Write score
Write score_checked_at"]

    M --> N["GitHub Risk Check
Block suspicious seed upgrades"]

    N --> O{"score >= 8
AND risk is ok?"}
    O -->|Yes| P["Promote directly to Seed
tier = seed"]
    O -->|No| Q["Promote to Spore
tier = spore"]

    style I fill:#833,color:#fff
    style L fill:#c44,color:#fff
    style Q fill:#47a,color:#fff
    style P fill:#4a4,color:#fff
```

## Daily Spore Recheck Pipeline

- Runs only on unbanned `spore` users
- Rechecks the users who have waited the longest since their last GitHub score check
- Daily slice size is `ceil(current_spore_count / 7)`
- Validates GitHub account existence by `github_id` before scoring
- Syncs `github_username` from GitHub when needed
- Applies the same GitHub risk check before allowing `seed`
- This keeps the full `spore` pool rotating over roughly one week, even as the pool grows

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
Validate by github_id
Sync current github_username"]

    E --> F{"GitHub account valid?"}
    F -->|No| G["Ban user
banned = 1
ban_reason = github_account_deleted"]
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
