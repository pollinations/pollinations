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
  PR merged → AI analyzes → gist JSON committed to news branch → image generated → Discord post

TIER 2: DAILY (Mon-Sat 06:00 UTC)
  Read day's gists → AI generates daily summary → platform posts (X, IG, Reddit)
  → commit to news branch → Buffer stages X + IG immediately → README-only PR to main
  LinkedIn is weekly-only. Reddit publishes via cron at 15:00 UTC.

TIER 3: WEEKLY (Sunday 06:00 UTC)
  Read week's gists directly (Sun→Sat) → synthesize weekly themes → platform posts (X, IG, LI, Reddit, Discord)
  → commit to news branch under the Sunday publish date → Buffer stages X + LI + IG immediately
  Reddit + Discord publish via cron at 18:00 UTC Sunday.
```

### Branch Strategy

- **`main` branch** — source code only. No generated content. README "Latest News" section updated via small automated PRs.
- **`news` branch** — all generated content: gists, daily posts, weekly posts, highlights, images. Unprotected (direct commits). Content is reviewed here before cron publishes it.

### Data Flow

```
═══════════════════════════════════════════════════════════════════════
 TIER 1: PER-PR (on merge)
═══════════════════════════════════════════════════════════════════════

PR merge ──→ generate_realtime.py
                │
                ├──→ Step 1: AI analysis → gist JSON (incl. image prompt)
                │    (committed to news branch)
                │
                └──→ Step 2: 🎨 GENERATE 1 image (8-bit pixel art)
                     → stored in gist as image.url

           ──→ publish_realtime.py (separate step)
                └──→ Reads gist → AI announcement → Discord webhook post

             Images generated: 1 per PR
             Images reused:    Discord reuses gist image

═══════════════════════════════════════════════════════════════════════
 TIER 2: DAILY (Mon-Sat 06:00 UTC → Buffer immediate → Reddit 15:00 UTC)
═══════════════════════════════════════════════════════════════════════

             06:00 UTC ──→ generate_daily.py
                            │  (reads gists, clusters into 3-5 arcs)
                            │
                            ├──→ twitter.json   + 🎨 GENERATE 1 image (brand pixel art)
                            ├──→ instagram.json + 🎨 GENERATE 3 images (carousel)
                            ├──→ reddit.json    + 🎨 GENERATE 1 image (brand pixel art)
                            ├──→ highlights.md  (AI curates yesterday's gists)
                            │
                            ├──→ Commit all to news branch
                            ├──→ Buffer stages X + IG immediately (PUBLISH_MODE=buffer)
                            └──→ README-only PR to main (Latest News section)
                                  (LinkedIn = weekly only, no daily posts)

             15:00 UTC ──→ NEWS_publish.yml (cron, PUBLISH_MODE=direct)
                            └──→ Reddit VPS deployment

             Images generated: 5 (1 twitter + 3 instagram + 1 reddit)

═══════════════════════════════════════════════════════════════════════
 TIER 3: WEEKLY (Sunday 06:00 UTC → Buffer immediate → Reddit+Discord 18:00 UTC)
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
                                      │
                                      ├──→ Commit all to news branch
                                      └──→ Buffer stages X + LI + IG immediately (PUBLISH_MODE=buffer)

             Sunday 18:00 UTC ──→ NEWS_publish.yml (cron, PUBLISH_MODE=direct)
                                    ├──→ Reddit VPS deployment
                                    └──→ Discord webhook post (with image)

             Images generated: 7 (1 twitter + 1 linkedin + 3 instagram + 1 reddit + 1 discord)
             Images reused:    none
```

---

## Storage

All generated content lives on the **`news` branch**.

### PR Gists: `social/news/gists/YYYY-MM-DD/PR-{number}.json`

- Committed directly to `news` branch (no PR needed — small auto-generated JSON)
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

- `summary.json` — canonical daily summary used by the website
- `twitter.json` — simplified platform envelope
- `instagram.json` — simplified platform envelope
- `reddit.json` — simplified platform envelope (LinkedIn is weekly-only, no daily file)
- `images/` — all generated images

### Weekly: `social/news/weekly/YYYY-MM-DD/`

`YYYY-MM-DD` is the Sunday publish date. The content still covers the previous Sun→Sat window.

- `summary.json` — canonical weekly summary used by the website
- `twitter.json` — simplified platform envelope
- `linkedin.json` — simplified platform envelope
- `instagram.json` — simplified platform envelope
- `reddit.json` — simplified platform envelope
- `discord.json` — simplified platform envelope
- `images/` — all generated images

### Platform Envelope

Daily and weekly platform JSON now share one persisted shape:

```json
{
  "platform": "twitter|linkedin|instagram|reddit|discord",
  "scope": "daily|weekly",
  "date": "YYYY-MM-DD",
  "period_start": "YYYY-MM-DD",
  "period_end": "YYYY-MM-DD",
  "generated_at": "ISO-8601 timestamp",
  "title": "optional, used by Reddit",
  "text": "optional, final publish-ready text",
  "images": [{"url": "https://..."}],
  "metadata": {"post_type": "post|carousel"}
}
```

---

## Workflows

| Workflow | Trigger | What it does |
|---|---|---|
| `NEWS_pr_gist.yml` | `pull_request_target: closed+merged` | Per-PR gist + Discord |
| `NEWS_summary.yml` | `cron: 0 6 * * *` | Generate content → commit to news → Buffer staging (`PUBLISH_MODE=buffer`) |
| `NEWS_publish.yml` | Mon-Sat 15:00 UTC, Sun 18:00 UTC | Direct channels only (`PUBLISH_MODE=direct`): Reddit daily, Reddit+Discord weekly |

### PUBLISH_MODE

The `PUBLISH_MODE` env var controls which channels fire:

| Mode | Channels | Used by |
|---|---|---|
| `buffer` | Twitter, Instagram (daily), + LinkedIn (weekly) → Buffer queue | `NEWS_summary.yml` (immediately after generation) |
| `direct` | Reddit → VPS, Discord → webhook | `NEWS_publish.yml` (cron) |
| `all` | Both (default) | Manual / testing |

### Workflow overlay

Both `NEWS_summary.yml` and `NEWS_publish.yml` overlay the `news` branch data onto the checkout:

```bash
git fetch origin news && git checkout origin/news -- social/news/
```

This makes all generated content available locally for scripts that read files (e.g. `read_news_file()` in common.py).

## Scripts

| Script | Purpose |
|---|---|
| `generate_realtime.py` | Per-PR: AI analysis → gist JSON → image gen (source of truth) |
| `publish_realtime.py` | Per-PR: reads gist → AI announcement → Discord webhook post |
| `generate_daily.py` | Daily: read gists → summary + platform posts (X, IG, Reddit) + images + highlights → commit to news |
| `generate_weekly.py` | Weekly: read gists directly (Sun→Sat) → synthesize themes → all 5 platform posts + images → commit to news |
| `publish_daily.py` | PUBLISH_MODE=buffer: stage X + IG to Buffer. PUBLISH_MODE=direct: Reddit VPS deployment. |
| `publish_weekly.py` | PUBLISH_MODE=buffer: stage X + LI + IG to Buffer. PUBLISH_MODE=direct: Reddit VPS + Discord webhook. |
| `update_readme.py` | Utility functions: `get_top_highlights()`, `update_readme_news_section()` (called by `readme-daily-update.yml`) |
| `common.py` | Shared utils: prompt loading, brand injection, API calls, gist I/O, retry logic, `read_news_file()`, constants |
| `buffer_publish.py` | Buffer API staging with scheduled delivery |
| `buffer_utils.py` | Buffer GraphQL API helpers |

---

## Error Handling

### Tier 1: `generate_realtime.py` — the critical path

The gist is the anchor for everything downstream. The 2 steps run sequentially:

```
Step 1: AI analysis → validate schema
  ├── Success: proceed to Step 2
  └── Any failure: fail the workflow run
      (no minimal gist is committed, no Discord post is attempted)

Step 2: Image generation → commit image → commit gist to news branch
  ├── Success: done (gist fully committed)
  └── Any failure: fail the workflow run
      (prevents partial gists or text-only realtime posts)
```

Discord posting (`publish_realtime.py`) runs as a **separate workflow step** after the gist generator. It is fail-fast: if message generation, image fetch, or webhook delivery fails, the workflow run fails and the post is not degraded.

### Tier 2: `generate_daily.py`

- If gist directory is **empty** (no PRs merged that day): skip. No posts generated. Quiet days are quiet days.
- If gist directory is **missing** locally: falls back to GitHub API (`?ref=news`) to read gists.

### Tier 3: `generate_weekly.py`

- Reads gists directly for the week (Sun→Sat). No dependency on daily summaries.
- If no daily-tier gists found for the week: skip.

### Re-triggering

All workflows support `workflow_dispatch` for manual re-triggering:
- `NEWS_pr_gist.yml`: accepts `pr_number` input to regenerate a specific gist
- `NEWS_summary.yml`: accepts `date` input (Mon-Sat runs daily, Sunday runs weekly)
- `NEWS_publish.yml`: accepts `mode` + `target_date` for manual publish of direct channels

---

## Concurrency & Race Conditions

### Simultaneous PR merges

Multiple PRs merging within seconds is the main risk for Tier 1.

**Mitigation:** Each gist writes to a **unique filename** (`PR-{number}.json`). There are no file collisions. The GitHub Contents API commit uses the `sha` parameter for conditional writes — if two workflows try to create files in the same directory simultaneously, both succeed because they're writing different files. (Unlike editing the same file, creating new files in a directory doesn't conflict.)

### Daily/weekly generators reading while gists are being written

The daily summary runs at 06:00 UTC. A PR merged at 05:59 UTC might have its gist committed at 06:01.

**Mitigation:** The daily summary selects gists by **`merged_at` timestamp**, not by file commit time. It reads all gists where `merged_at` falls on the target date, regardless of when the file appeared. If a gist is committed *after* the daily summary already ran (e.g., slow image gen), it gets picked up by the next day's summary or by the weekly fallback.

---

## Key Design Decisions

1. **PR-time analysis is the anchor** — intent is frozen while context is freshest. Eliminates platform drift ("same PR, different story"). Reduces AI cost and variance.

2. **Gists stored as repo files, not GitHub Gist API** — auditable, diffable, reviewable. No extra auth surface. Fits existing repo-as-CMS pattern.

3. **All generated content on `news` branch** — `main` stays source-code only. Content is reviewable on `news` before publishing. Only the README "Latest News" section touches `main` via automated PR.

4. **`publish_tier` field gates what reaches each tier** — non-user-facing PRs default to `discord_only`, preventing "busy weeks" from reading like spam. Daily/weekly layers only consume PRs tagged `daily` or higher.

5. **Importance is binary** — `major/minor` chosen by AI. Headline-worthy or not. Prominence is implicit in narrative structure, not serialized as extra fields.

6. **Tier 1 fails loud instead of degrading** — if PR analysis, validation, image generation, or Discord delivery breaks, the realtime workflow goes red. That keeps problems visible and makes manual re-triggering explicit.

7. **Buffer staging immediately after generation** — `NEWS_summary.yml` generates content and immediately stages to Buffer (`PUBLISH_MODE=buffer`). Buffer handles delivery scheduling. Direct channels (Reddit, Discord) use separate cron.

8. **Daily summary clusters related PRs into 3-5 story arcs** — 5 PRs about the same subsystem become one narrative beat. Editorial quality, not a changelog.

9. **Three independent image families** — see Image Generation Strategy section below.

10. **Highlights + README in the daily flow** — `generate_daily.py` curates yesterday's gists into `highlights.md` (committed to news) and updates the README "Latest News" section via a small PR to main.

11. **Weekly delivery at Sunday 18:00 UTC** — Sunday evening "week wrap-up" energy. Reddit + Discord via cron. Buffer-staged platforms deliver on Buffer's schedule.

12. **No fallback content for zero-PR days** — if no PRs merged, the daily workflow skips entirely. No posts generated. Quiet days are quiet days.

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

1. **Tier 1 — happy path**: Merge a test PR → verify gist JSON committed to `news` branch `social/news/gists/` + image generated + Discord post sent (separate step)
2. **Tier 1 — AI failure**: Mock AI to fail → verify workflow fails, no gist is committed, and Discord does not post
3. **Tier 2 — happy path**: Manually trigger daily workflow → verify platform posts + images committed to `news` branch + README PR to main
4. **Tier 2 — zero PRs**: Run daily workflow on a day with 0 gists → verify workflow exits cleanly with no content generated
5. **Tier 3 — happy path**: Manually trigger weekly workflow → verify all 5 platform posts + images committed to `news` branch
6. **Daily publish — Buffer**: Verify `NEWS_summary.yml` stages X/IG to Buffer immediately after generation
7. **Daily publish — Reddit**: Verify `NEWS_publish.yml` cron at 15:00 UTC deploys Reddit to VPS
8. **Weekly publish — Buffer**: Verify `NEWS_summary.yml` stages X/LI/IG to Buffer immediately after generation
9. **Weekly publish — Reddit+Discord**: Verify `NEWS_publish.yml` Sunday 18:00 UTC cron publishes Reddit + Discord
10. **Publish tier gating**: Merge a non-user-facing PR → verify `publish_tier: discord_only` → verify absent from daily summary
11. **Clustering**: Day with 5+ related PRs → verify daily summary groups them into narrative arcs (not a flat list)
12. **Concurrent merges**: Merge 3 PRs within 30 seconds → verify all 3 gists committed without conflicts

---

## Critical Files

| File | Role |
|---|---|
| `social/scripts/common.py` | Shared utilities: prompt loading, brand injection, API calls, gist I/O, `read_news_file()`, retry logic, constants |
| `social/scripts/buffer_publish.py` | Buffer API staging with scheduled delivery |
| `social/buffer-schedule.yml` | Delivery schedule for all platforms |

## Prompts

All prompts live in `social/prompts/`:

```
social/prompts/
  brand/                       # Brand components (auto-injected via placeholders)
    about.md                   # Company description       → {about}
    visual.md                  # Pixel art style guide     → {visual_style}
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
| `{links}` | `brand/links.md` |

### Prompt Composition Pattern

Every platform post is generated from **three layers** combined:

1. **Brand identity** (`brand/*.md`) — injected automatically via placeholders. Defines who we are, visual style, bee mascot.
2. **Platform voice** (`tone/<platform>.md`) — system prompt. Defines tone, length, formatting rules, image adaptation for a specific destination.
3. **Output format** (`format.md`) — user prompt. Defines the JSON schema and content constraints for each platform.

The AI call structure: `system_prompt = load_prompt("tone/{platform}")` (with brand auto-injected) + `user_prompt = summary_data + load_format("{platform}")`.

This allows reusing the same voice across cadences (daily, weekly) and the same format across content types.
