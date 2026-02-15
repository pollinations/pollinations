# Social Media News Pipeline

> **Status:** Implemented — 3-tier architecture is the sole active system.
>
> **Assumption:** GitHub is the single source of truth. "Merge to main" is the authoritative event for shipping news.

## Context

The previous system had 9 workflows and 11 scripts where each platform (Twitter, Instagram, LinkedIn, Discord, Reddit) **independently fetched PRs from GitHub and independently analyzed them with AI**. The same PRs got fetched 4-5 times per day, each platform re-interpreted them from scratch, and 3 separate PRs were created daily for review.

The pipeline uses **event-centric interpretation**: each PR is analyzed once at merge time, and all downstream content aggregates from that single analysis.

---

## Architecture: 3 Tiers

```
TIER 1: PER-PR (real-time)
  PR merged → AI analyzes → gist JSON committed to repo → image generated → Discord post

TIER 2: DAILY (Mon-Sat 06:00 UTC → merge PR → Buffer 15:00 UTC)
  Read day's gists → AI generates daily summary → platform posts (X, IG, Reddit)
  → single PR for review → on merge: Buffer stages X + IG for next 15:00 UTC slot
  LinkedIn is weekly-only. Reddit deployed to VPS via SSH.

TIER 3: WEEKLY (Sunday 06:00 UTC → Sunday 18:00 UTC)
  Read week's gists directly (Sun→Sat) → synthesize weekly themes → platform posts (X, IG, LI, Reddit, Discord)
  Generated Sun 06:00 UTC → PR for review → Sun 18:00 UTC cron publishes all 5 platforms
```

### Data Flow

```
═══════════════════════════════════════════════════════════════════════
 TIER 1: PER-PR (on merge)
═══════════════════════════════════════════════════════════════════════

PR merge ──→ generate_realtime.py
                │
                ├──→ Step 1: AI analysis → gist JSON (incl. image prompt)
                │    (committed to main)
                │
                └──→ Step 2: 🎨 GENERATE 1 image (8-bit pixel art)
                     → stored in gist as image.url

           ──→ publish_realtime.py (separate step)
                └──→ Reads gist → AI announcement → Discord webhook post

             Images generated: 1 per PR
             Images reused:    Discord reuses gist image

═══════════════════════════════════════════════════════════════════════
 TIER 2: DAILY (Mon-Sat 06:00 UTC → merge PR → Buffer 15:00 UTC)
═══════════════════════════════════════════════════════════════════════

             06:00 UTC ──→ generate_daily.py
                            │  (reads gists, clusters into 3-5 arcs)
                            │
                            ├──→ twitter.json   + 🎨 GENERATE 1 image (brand pixel art)
                            ├──→ instagram.json + 🎨 GENERATE 3 images (carousel)
                            ├──→ reddit.json    + 🎨 GENERATE 1 image (brand pixel art)
                            ├──→ highlights.md  (AI curates yesterday's gists)
                            ├──→ README.md      ("Latest News" section update)
                            │
                            └──→ Single PR for review
                                  social/news/daily/YYYY-MM-DD/
                                         │ (on merge)
                                         ├──→ Buffer staging (X, IG) at 15:00 UTC
                                         └──→ Reddit VPS deployment
                                  (LinkedIn = weekly only, no daily posts)

             Images generated: 5 (1 twitter + 3 instagram + 1 reddit)

═══════════════════════════════════════════════════════════════════════
 TIER 3: WEEKLY (Sunday 06:00 UTC → Sunday 18:00 UTC)
═══════════════════════════════════════════════════════════════════════

             Sunday 06:00 UTC ──→ generate_weekly.py
                                      │  (reads gists directly Sun→Sat,
                                      │   synthesizes weekly themes)
                                      │
                                      ├──→ twitter.json   + 🎨 GENERATE 1 image (brand pixel art)
                                      ├──→ linkedin.json  + 🎨 GENERATE 1 image (brand pixel art)
                                      ├──→ instagram.json + 🎨 GENERATE 3 images (carousel)
                                      ├──→ reddit.json    + 🎨 GENERATE 1 image (brand pixel art)
                                      ├──→ discord.json   + 🎨 GENERATE 1 image (brand pixel art)
                                      └──→ Creates PR for review

             Sunday 18:00 UTC ──→ NEWS_publish.yml (cron)
                                    │ (checks if weekly PR was merged)
                                    ├── Not merged → skip
                                    └── Merged → publish all 5 platforms:
                                          ├──→ Buffer staging (X, LI, IG) at 18:00 UTC
                                          ├──→ Reddit API post
                                          └──→ Discord webhook post (with image)

             Images generated: 7 (1 twitter + 1 linkedin + 3 instagram + 1 reddit + 1 discord)
             Images reused:    none
```

---

## Storage

### PR Gists: `social/news/gists/YYYY-MM-DD/PR-{number}.json`

- Committed directly to main (no PR needed — small auto-generated JSON)
- One file per merged PR per day
- Unique filenames per PR (`PR-{number}.json`) — no git push race conditions
- **Includes pixel art image URL** — generated at PR merge time, reused by Discord posts
- Image generation uses our own API — retries 3x with exponential backoff + different seed on 5xx errors

```json
{
  "pr_number": 8117,
  "title": "fix(enter): single-bucket balance deduction",
  "author": "username",
  "url": "https://github.com/pollinations/pollinations/pull/8117",
  "merged_at": "2026-02-09T15:30:00Z",
  "labels": ["bug", "enter"],

  "gist": {
    "category": "bug_fix",
    "user_facing": true,
    "publish_tier": "daily",
    "importance": "major",
    "headline": "One bucket to rule them all",
    "blurb": "The bees fixed a leaky honey jar — balance deductions now flow through a single bucket instead of spilling across many.",
    "summary": "Fixed balance deduction to use a single bucket instead of splitting across multiple.",
    "impact": "Users no longer see incorrect balance after API calls.",
    "keywords": ["billing", "balance", "api"],
    "visual_concept": "A bee repairing a cracked piggy bank. The piggy bank represents the single-bucket billing system. Wrench = fix.",
    "image_prompt": "Cozy pixel art scene of a tiny bee fixing a cracked piggy bank with a wrench. Soft lime green glow, chunky 8-bit sprites, warm lighting."
  },

  "image": {
    "url": "https://raw.githubusercontent.com/.../PR-8117.jpg",
    "prompt": "Cozy pixel art scene of a tiny bee fixing a cracked piggy bank..."
  },

  "generated_at": "2026-02-09T15:31:00Z"
}
```

**Key fields:**

| Field | Purpose |
|---|---|
| `publish_tier` | `"none"` / `"discord_only"` / `"daily"` — controls which tiers pick up this PR. See `publish_tier` decision logic below. |
| `importance` | `"major"` / `"minor"` — AI picks. Binary: headline-worthy or not. |
| `user_facing` | Boolean — AI determines if end users would notice this change |
| `headline` | Short creative name for the change (3-8 words). Used in daily/weekly narrative arcs. |
| `blurb` | Whimsical 1-2 sentence description for the website diary. Bee/nature metaphors welcome. |
| `visual_concept` | AI reasoning space — identifies project mascots, symbols, and scene concept before writing `image_prompt`. |

**Importance is binary:**

- `"major"` — headline-worthy. Users would notice or care. Features, significant bug fixes, new models, pricing changes.
- `"minor"` — everything else. Chore, deps, infra, small fixes, internal tooling.

The AI picks based on PR content. The daily summary uses `major` PRs as headline arcs; `minor` PRs get mentioned briefly or grouped. No numeric scores, no formula — prominence is implicit in the narrative structure, not serialized as extra fields.

**`publish_tier` decision logic:**

The AI chooses `publish_tier` as part of gist analysis, but hard rules act as guardrails:

```
# Hard rules (override AI choice):
if labels include "deps" or "chore" AND user_facing == false:
    publish_tier = "discord_only"       # forced
if labels include "feature":
    publish_tier = min("daily", AI_choice)  # at least "daily"

# AI decides (with default):
if no labels:
    publish_tier = AI_choice            # default: "daily"
else:
    publish_tier = AI_choice            # default: "daily"

# Valid values: "none", "discord_only", "daily"
# ("weekly" is not a valid tier — weekly summary reads gists directly with the same "daily" filter)
```

This means: deps/chore PRs can't sneak into daily summaries, features always make it, and everything else the AI decides with a bias toward inclusion.

### Daily Posts: `social/news/daily/YYYY-MM-DD/`

- `twitter.json` — platform post JSON
- `instagram.json` — same schema
- `reddit.json` — same schema (LinkedIn is weekly-only, no daily file)
- `images/` — all generated images

### Weekly: `social/news/weekly/YYYY-MM-DD/`

- `twitter.json` — weekly recap tweet (1 image)
- `linkedin.json` — weekly recap post (1 image)
- `instagram.json` — weekly recap carousel (3 images)
- `reddit.json` — weekly Reddit post (1 image)
- `discord.json` — weekly Discord digest
- `images/` — all generated images
- Generated **Sunday 06:00 UTC**, published **Sunday 18:00 UTC** via cron: Buffer (X, LI, IG) + Reddit API + Discord webhook — all 5 platforms. Sunday evening = week wrap-up energy.

---

## Workflows

| Workflow | Trigger |
|---|---|
| `NEWS_pr_gist.yml` | `pull_request_target: closed+merged` — per-PR gist + Discord |
| `NEWS_summary.yml` | `cron: 0 6 * * *` — Mon-Sat: `generate_daily.py`, Sunday: `generate_weekly.py` |
| `NEWS_publish.yml` | Daily PR merge → `publish_daily.py`; Sunday 18:00 UTC cron → `publish_weekly.py` |

## Scripts

| Script | Purpose |
|---|---|
| `generate_realtime.py` | Per-PR: AI analysis → gist JSON → image gen (source of truth) |
| `publish_realtime.py` | Per-PR: reads gist → AI announcement → Discord webhook post |
| `generate_daily.py` | Daily: read gists → summary + platform posts (X, IG, Reddit) + images |
| `generate_weekly.py` | Weekly: read gists directly (Sun→Sat) → synthesize themes → all 5 platform posts + images |
| `publish_daily.py` | On daily PR merge: Buffer stage (X, IG) + Reddit VPS deployment. LinkedIn = weekly only. |
| `publish_weekly.py` | Sunday 18:00 UTC cron: check if weekly PR merged, then Buffer (X, LI, IG) + Reddit API + Discord webhook |
| `update_highlights.py` | Daily: reads yesterday's gists, AI curates highlights, updates highlights.md + README in single PR |
| `update_readme.py` | Utility functions: `get_top_highlights()`, `update_readme_news_section()` (used by update_highlights.py) |
| `common.py` | Shared utils: prompt loading, brand injection, API calls, gist I/O, retry logic, constants |
| `buffer_publish.py` | Buffer API staging with scheduled delivery |
| `buffer_utils.py` | Buffer GraphQL API helpers |

---

## Error Handling

### Tier 1: `generate_realtime.py` — the critical path

The gist is the anchor for everything downstream. The 2 steps run sequentially:

```
Step 1: AI analysis → gist JSON → validate schema → commit to main
  ├── Success: proceed to Step 2
  ├── Schema validation failure: log warning, commit MINIMAL gist (PR metadata only)
  │   (prevents malformed JSON from reaching downstream tiers)
  └── AI failure: RETRY up to 3x with exponential backoff
        └── Still fails: commit a MINIMAL gist (PR metadata only, no AI fields)
            + log error + open GitHub issue tagged "news-pipeline-failure"
            (daily summary sees the PR exists but skips it for narrative)

Step 2: Image generation → update gist with image URL
  ├── Success: done (gist fully committed)
  └── Failure (5xx): RETRY up to 3x with exponential backoff + different seed each attempt
        └── Still fails: gist.image.url = null, continue without image
            (Discord posts text-only)
```

Discord posting (`publish_realtime.py`) runs as a **separate workflow step** after the gist generator. If Discord posting fails, the gist is already committed (source of truth preserved). Discord is best-effort notification.

### Tier 2: `generate_daily.py`

- If gist directory is **empty** (no PRs merged that day): skip. No PR created, no posts generated. Quiet days are quiet days.
- If gist directory is **missing** (workflow bug): fall back to `get_merged_prs()` from GitHub GraphQL directly. Log a warning.

### Tier 3: `generate_weekly.py`

- Reads gists directly for the week (Sun→Sat). No dependency on daily summaries.
- If gist directory is **empty** for all days (no PRs merged that week): skip. No PR created.

### Re-triggering

All workflows support `workflow_dispatch` for manual re-triggering:
- `NEWS_pr_gist.yml`: accepts `pr_number` input to regenerate a specific gist
- `NEWS_summary.yml`: accepts `date` input (Mon-Sat runs daily, Sunday runs weekly)

---

## Concurrency & Race Conditions

### Simultaneous PR merges

Multiple PRs merging within seconds is the main risk for Tier 1.

**Mitigation:** Each gist writes to a **unique filename** (`PR-{number}.json`). There are no file collisions. The GitHub Contents API commit uses the `sha` parameter for conditional writes — if two workflows try to create files in the same directory simultaneously, both succeed because they're writing different files. (Unlike editing the same file, creating new files in a directory doesn't conflict.)

### Daily/weekly generators reading while gists are being written

The daily summary runs at 06:00 UTC. A PR merged at 05:59 UTC might have its gist committed at 06:01.

**Mitigation:** The daily summary selects gists by **`merged_at` timestamp**, not by file commit time. It reads all gists where `merged_at` falls on the target date, regardless of when the file appeared on main. No sleep needed. If a gist is committed *after* the daily summary already ran (e.g., slow image gen), it gets picked up by the next day's summary or by the weekly fallback.

---

## Key Design Decisions

1. **PR-time analysis is the anchor** — intent is frozen while context is freshest. Eliminates platform drift ("same PR, different story"). Reduces AI cost and variance.

2. **Gists stored as repo files, not GitHub Gist API** — auditable, diffable, reviewable. No extra auth surface. Fits existing repo-as-CMS pattern.

3. **Gists committed directly to main (no PR)** — small auto-generated metadata. Unique filenames prevent collisions. The daily summary PR is where human review happens.

4. **`publish_tier` field gates what reaches each tier** — non-user-facing PRs default to `discord_only`, preventing "busy weeks" from reading like spam. Daily/weekly layers only consume PRs tagged `daily` or higher.

5. **Importance is binary** — `major/minor` chosen by AI. Headline-worthy or not. Prominence is implicit in narrative structure, not serialized as extra fields.

6. **2 sequential steps in Tier 1** — gist commit, then image gen. Gist (the anchor) commits first; image gen retries 3x on 5xx (different seed each time). Discord posting is a separate workflow step (`publish_realtime.py`) — best-effort, decoupled from the source of truth.

7. **Single daily PR instead of 3** — one PR contains twitter.json + instagram.json + reddit.json + images. LinkedIn is weekly-only. Humans review narrative, not fragments.

8. **Daily summary clusters related PRs into 3-5 story arcs** — 5 PRs about the same subsystem become one narrative beat. Editorial quality, not a changelog.

9. **Three independent image families** — see Image Generation Strategy section below.

10. **Highlights + README in the daily PR** — `generate_daily.py` curates yesterday's gists into `highlights.md` and updates the README "Latest News" section, all within the same daily PR. No separate workflow.

11. **Weekly delivery at Sunday 18:00 UTC** — Sunday evening "week wrap-up" energy. All 5 platforms at once.

12. **No fallback content for zero-PR days** — if no PRs merged, the daily workflow skips entirely. No PR created, no posts. Quiet days are quiet days.

13. **Website diary reads from gists + summary** — no separate diary generation step. Gists include `headline` and `blurb` fields; daily/weekly summaries include `mood`. The website can render a diary view directly from these sources.

14. **Weekly reads gists directly, independent of dailies** — the weekly summary reads the week's gists (Sun→Sat) and synthesizes themes into a bigger narrative ("this week we shipped X, fixed Y, started Z"). This eliminates the dependency on daily summaries being generated first, ensuring no PRs are missed.

---

## Image Generation Strategy

There are **3 independent families of images**. Each tier generates its own images with its own prompts and style.

| Family | Generated by | When | Style | Count | Used by |
|---|---|---|---|---|---|
| **Per-PR pixel art** | `generate_realtime.py` | Tier 1 (on PR merge) | 8-bit pixel art | 1 per PR | Discord post, website diary |
| **Daily platform images** | `generate_daily.py` | Tier 2 (06:00 UTC) | Brand pixel art (from `brand/visual.md`) | 1 Twitter + 3 Instagram + 1 Reddit = **5 per day** | Twitter, Instagram, Reddit daily posts (LinkedIn = weekly only) |
| **Weekly platform images** | `generate_weekly.py` | Tier 3 (Sunday 06:00 UTC) | Brand pixel art (from `brand/visual.md`) | 1 Twitter + 1 LinkedIn + 3 Instagram + 1 Reddit + 1 Discord = **7 per week** | Twitter, LinkedIn, Instagram, Reddit, Discord weekly posts |

**Key points:**

- **Daily and weekly images are freshly generated** from the daily narrative / weekly summary. They are NOT the per-PR pixel art images. The AI creates images that illustrate the aggregated story, not individual PRs.

---

## Cost Estimate (per day, assuming 5 PRs merged)

| Step | AI calls | Image gens |
|---|---|---|
| PR gists (5x) | 5 | 5 |
| Daily summary (1x) | 2 | 5 (1 twitter + 3 instagram + 1 reddit) |
| **Total** | **7** | **10** |

Weekly adds ~6 AI calls + ~7 image gens on Sundays.

AI calls scale as N+1 (N per-PR gists + 1 daily summary), not N×platforms. Image count stays similar across any architecture (same images needed).

---

## Verification

1. **Tier 1 — happy path**: Merge a test PR → verify gist JSON committed to `social/news/gists/` + image generated + Discord post sent (separate step)
2. **Tier 1 — AI failure**: Mock AI to fail → verify minimal gist (metadata only) committed + GitHub issue opened
3. **Tier 2 — happy path**: Manually trigger daily workflow → verify single PR with all platform posts + images
4. **Tier 2 — zero PRs**: Run daily workflow on a day with 0 gists → verify workflow exits cleanly with no PR created
5. **Tier 3 — happy path**: Manually trigger weekly workflow → verify PR with all 5 platform posts + images
6. **Daily publish**: Merge daily PR → verify Buffer stages X/IG (no LinkedIn — weekly only)
7. **Weekly publish**: Merge weekly PR before Sunday 18:00 UTC → verify Sunday 18:00 cron publishes all 5 platforms (Buffer X/LI/IG + Reddit API + Discord webhook)
7b. **Weekly publish — PR not merged**: Don't merge weekly PR → verify Sunday 18:00 cron skips cleanly
8. **Publish tier gating**: Merge a non-user-facing PR → verify `publish_tier: discord_only` → verify absent from daily summary
9. **Clustering**: Day with 5+ related PRs → verify daily summary groups them into narrative arcs (not a flat list)
10. **Concurrent merges**: Merge 3 PRs within 30 seconds → verify all 3 gists committed without conflicts
11. **Late gist commit**: Merge a PR on day N, delay gist commit to day N+1 → verify the day N daily summary (if already run) misses it, and the day N+1 summary picks it up via `merged_at` timestamp

---

## Critical Files

| File | Role |
|---|---|
| `social/scripts/common.py` | Shared utilities: prompt loading, brand injection, API calls, gist I/O, retry logic, constants |
| `social/scripts/buffer_publish.py` | Buffer API staging with scheduled delivery |
| `social/buffer-schedule.yml` | Delivery schedule for all platforms |

## Prompts

All prompts live in `social/prompts/`:

```
social/prompts/
  brand/                       # Brand components (auto-injected via placeholders)
    about.md                   # Company description       → {about}
    visual.md                  # Pixel art style guide     → {visual_style}
    bee.md                     # Bee mascot description    → {bee_character}
    links.md                   # Official links            → {links}

  tone/                        # Platform voices (system prompts)
    twitter.md                 # Twitter/X voice + image adaptation
    linkedin.md                # LinkedIn voice + image adaptation
    instagram.md               # Instagram voice + image adaptation
    reddit.md                  # Reddit voice + image adaptation
    discord.md                 # Discord voice + image adaptation

  gist.md                      # Tier 1: Analyze PR → gist JSON + image prompt
  daily.md                     # Tier 2: Cluster gists into 3-5 narrative arcs
  weekly.md                    # Tier 3: Synthesize weekly recap from gists
  highlights.md                # Highlights curation for GitHub + README
  format.md                    # Output format specs (JSON schemas per platform)
```

### Brand Injection

`common.py` automatically replaces placeholders in any loaded prompt:

| Placeholder | Source |
|---|---|
| `{about}` | `brand/about.md` |
| `{visual_style}` | `brand/visual.md` |
| `{bee_character}` | `brand/bee.md` |
| `{links}` | `brand/links.md` |

### Prompt Composition Pattern

Every platform post is generated from **three layers** combined:

1. **Brand identity** (`brand/*.md`) — injected automatically via placeholders. Defines who we are, visual style, bee mascot.
2. **Platform voice** (`tone/<platform>.md`) — system prompt. Defines tone, length, formatting rules, image adaptation for a specific destination.
3. **Output format** (`format.md`) — user prompt. Defines the JSON schema and content constraints for each platform.

The AI call structure: `system_prompt = load_prompt("tone/{platform}")` (with brand auto-injected) + `user_prompt = summary_data + load_format("{platform}")`.

This allows reusing the same voice across cadences (daily, weekly) and the same format across content types.
