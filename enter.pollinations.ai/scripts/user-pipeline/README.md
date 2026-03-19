# User Pipeline

Two steady-state jobs that manage user tier progression:

1. **Hourly** — trust-score new users, promote from `microbe` to `spore` or `seed`
2. **Daily** — recheck `spore` users for promotion to `seed`

See [`PRODUCTION_ROLLOUT.md`](./PRODUCTION_ROLLOUT.md) for the rollout plan.

## Layout

```text
scripts/user-pipeline/
├── hourly-new-users.ts
├── daily-spore-recheck.ts
├── scoring/
│   ├── trust-score.ts
│   ├── trust-score-helpers.ts
│   ├── github_score.py
│   └── test_github_risk.py
├── shared/
│   ├── d1.ts
│   ├── email-cohort.ts
│   ├── github-identity.ts
│   ├── python.ts
│   └── scoring-pipeline.ts
├── manual/
│   ├── cleanup-github-users.ts
│   └── replay.ts
└── backfills/
    └── backfill-spore-scores.ts
```

## Local Python

Python scoring module (`github_score.py`) is called via `shared/python.ts`. Set `PYTHON_BIN` to override the interpreter (defaults to `python3.11`, then `python3`).

## Hourly New-User Pipeline

- Targets users where `trust_score IS NULL` and `banned = 0`
- Uses unbanned users from the last 24h as reference context for trust scoring
- Validates GitHub account by `github_id`, syncs `github_username` if renamed
- LLM trust scoring decides whether the user can leave `microbe`
- Scores developer activity for trusted users; applies GitHub risk check before `seed`
- Allows direct `microbe -> seed` for users who already qualify

```mermaid
%%{init: {'theme': 'dark', 'themeVariables': {'lineColor': '#ffffff', 'edgeLabelBackground': 'transparent'}}}%%
flowchart TD
    A["User Signs Up"] --> B["Initialize user
tier = microbe, trust_score = NULL"]

    B --> C["Hourly Pipeline
trust_score IS NULL AND banned = 0"]

    C --> D{"Any target users?"}
    D -->|No| E["Exit"]
    D -->|Yes| F["Build 24h reference window"]

    F --> G["Validate GitHub account
by github_id"]

    G --> H{"Account valid?"}
    H -->|No| I["Ban user"]
    H -->|Yes| J["LLM trust evaluation
Write trust_score"]

    J --> K{"trust_score >= 60?"}
    K -->|No| L["Stay Microbe"]
    K -->|Yes| M["GitHub developer scoring
Write score"]

    M --> N["GitHub risk check"]

    N --> O{"score >= 8 AND risk ok?"}
    O -->|Yes| P["Promote to Seed"]
    O -->|No| Q["Promote to Spore"]

    style I fill:#833,color:#fff
    style L fill:#c44,color:#fff
    style Q fill:#47a,color:#fff
    style P fill:#4a4,color:#fff
```

## Daily Spore Recheck Pipeline

- Targets unbanned `spore` users, ordered by oldest `score_checked_at`
- Daily slice: `ceil(spore_count / 7)` — rotates full pool in ~1 week
- Validates GitHub account, syncs username, applies risk check before `seed`

```mermaid
%%{init: {'theme': 'dark', 'themeVariables': {'lineColor': '#ffffff', 'edgeLabelBackground': 'transparent'}}}%%
flowchart TD
    A["Daily Spore Recheck"] --> B["Select oldest-checked spores
ceil(total / 7) users"]

    B --> C{"Any to check?"}
    C -->|No| D["Exit"]
    C -->|Yes| E["Validate GitHub account"]

    E --> F{"Account valid?"}
    F -->|No| G["Ban user"]
    F -->|Yes| H["GitHub developer scoring"]

    H --> I["GitHub risk check"]

    I --> J{"score >= 8 AND risk ok?"}
    J -->|Yes| K["Promote to Seed"]
    J -->|No| L["Stay Spore"]

    style G fill:#833,color:#fff
    style L fill:#47a,color:#fff
    style K fill:#4a4,color:#fff
```
