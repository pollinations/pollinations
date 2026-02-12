# Social Media News Pipeline Redesign

> **Status:** Implemented — old scripts/workflows removed, data migrated to 3-tier structure.
>
> **Assumption:** GitHub is the single source of truth. "Merge to main" is the authoritative event for shipping news.

## Context

The current system has 9 workflows and 11 scripts where each platform (Twitter, Instagram, LinkedIn, Discord, Reddit) **independently fetches PRs from GitHub and independently analyzes them with AI**. The same PRs get fetched 4-5 times per day, each platform re-interprets them from scratch, and 3 separate PRs are created daily for review.

The redesign moves from **platform-centric AI interpretation** to **event-centric interpretation**: each PR is analyzed once, and all downstream content aggregates from that single analysis.

---

## Architecture: 3 Tiers

```
TIER 1: PER-PR (real-time)
  PR merged → AI analyzes → gist JSON committed to repo → image generated → Discord post

TIER 2: DAILY (Mon-Sat 06:00 UTC → merge PR → Buffer 15:00 UTC)
  Read day's gists → AI generates daily summary → platform posts (X, IG, Reddit) + website diary
  → single PR for review → on merge: Buffer stages X + IG for next 15:00 UTC slot + highlights + README
  LinkedIn is weekly-only. Reddit daily handled by TypeScript app.

TIER 3: WEEKLY (Sunday 06:00 UTC → Sunday 18:00 UTC)
  Read week's gists directly (Mon→Sun) → synthesize weekly themes → platform posts (X, IG, LI, Reddit, Discord)
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
                            ├──→ diary.json     + 🔗 REUSE per-PR pixel art from gists
                            │                     (collects image.url from each gist —
                            │                      zero extra generation)
                            │
                            └──→ Single PR for review
                                  social/news/daily/YYYY-MM-DD/
                                         │ (on merge)
                                         ├──→ Buffer staging (X, IG) at 15:00 UTC
                                         ├──→ Highlights update
                                         └──→ README update
                                  (Reddit daily = TypeScript app, not this pipeline)
                                  (LinkedIn = weekly only, no daily posts)

             Images generated: 5 (1 twitter + 3 instagram + 1 reddit)
             Images reused:    N (one per PR, from Tier 1 gists → diary only)

═══════════════════════════════════════════════════════════════════════
 TIER 3: WEEKLY (Sunday 06:00 UTC → Sunday 18:00 UTC)
═══════════════════════════════════════════════════════════════════════

             Sunday 06:00 UTC ──→ generate_weekly.py
                                      │  (reads gists directly Mon→Sun,
                                      │   synthesizes weekly themes)
                                      │
                                      ├──→ summary.md
                                      ├──→ twitter.json   + 🎨 GENERATE 1 image (brand pixel art)
                                      ├──→ linkedin.json  + 🎨 GENERATE 1 image (brand pixel art)
                                      ├──→ instagram.json + 🎨 GENERATE 3 images (carousel)
                                      ├──→ reddit.json    + 🎨 GENERATE 1 image (brand pixel art)
                                      ├──→ discord.json   + 🎨 GENERATE 1 image (brand pixel art)
                                      └──→ Creates PR for review

             Sunday 18:00 UTC ──→ NEWS_weekly_publish.yml (cron)
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
- **Includes pixel art image URL** — generated at PR merge time, reused by website diary
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
    "summary": "Fixed balance deduction to use a single bucket instead of splitting across multiple.",
    "impact": "Users no longer see incorrect balance after API calls.",
    "keywords": ["billing", "balance", "api"],
    "image_prompt": "Cozy pixel art scene of a tiny bee fixing a cracked piggy bank with a wrench. Soft lime green (#ecf874) glow. Chunky 8-bit sprites, warm lighting, lo-fi vibes."
  },

  "image": {
    "url": "https://raw.githubusercontent.com/.../PR-8117.jpg",
    "prompt": "pixel art of a piggy bank being repaired..."
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

- `summary.json` — aggregated narrative + highlights (3-5 story arcs, clustered)
- `twitter.json` — platform post JSON
- `instagram.json` — same schema
- `reddit.json` — same schema (LinkedIn is weekly-only, no daily file)
- `diary.json` — website diary entry (8-bit pixel art diary page) **(Phase 5 — see Diary section)**
- `images/` — all generated images

### Website Diary: `diary.json` — **Deferred to Phase 5**

The diary is a cute 8-bit pixel art "dev diary" page for the website. It requires frontend work (routing, page component, design) that is out of scope for the pipeline redesign. The pipeline will **generate `diary.json` from Phase 2 onwards** so the data accumulates, but the frontend to display it ships separately.

When the frontend is ready, it reads from `social/news/daily/YYYY-MM-DD/diary.json`:

```json
{
  "date": "2026-02-09",
  "title": "Day 412 of Building pollinations.ai",
  "entries": [
    {
      "pr_number": 8117,
      "headline": "Fixed the balance bug",
      "blurb": "Squashed a sneaky billing edge case...",
      "image_url": "https://raw.githubusercontent.com/.../PR-8117.jpg",
      "category": "bug_fix",
      "importance": "major"
    }
  ],
  "mood": "productive",
  "pixel_art_header": "https://..."
}
```

**Diary `mood` field:** AI-inferred from the day's PR mix. Examples: 5 bug fixes → "debugging marathon", 2 features launched → "shipping day", quiet day → "recharging". It's a whimsical field for the pixel art aesthetic — the frontend can use it to tint colors or pick a header sprite.

**Scope for diary frontend (separate task):**
- Route: `pollinations.ai/diary/YYYY-MM-DD`
- Component: reads `diary.json` from GitHub raw or fetched at build time
- Design: 8-bit pixel art aesthetic, scrollable entries
- Index page: `pollinations.ai/diary/` showing recent days

### Weekly: `social/news/weekly/YYYY-MM-DD/`

- `summary.md` — weekly changelog
- `twitter.json` — weekly recap tweet (1 image)
- `linkedin.json` — weekly recap post (1 image)
- `instagram.json` — weekly recap carousel (3 images)
- `reddit.json` — weekly Reddit post (1 image)
- `discord.json` — weekly Discord digest
- `images/` — all generated images
- Generated **Sunday 06:00 UTC**, published **Sunday 18:00 UTC** via cron: Buffer (X, LI, IG) + Reddit API + Discord webhook — all 5 platforms. Sunday evening = week wrap-up energy.

---

## Workflows: 9 → 6

| New Workflow | Trigger | Replaces |
|---|---|---|
| `NEWS_pr_gist.yml` | `pull_request_target: closed+merged` | `NEWS_Discord_post_merged_pr.yml` |
| `NEWS_daily_summary.yml` | `cron: 0 6 * * 1-6` (Mon-Sat) | `NEWS_Twitter_generate_posts.yml` + `NEWS_Instagram_generate_posts.yml` + `NEWS_LinkedIn_generate_posts.yml` |
| `NEWS_daily_publish.yml` | PR closed on `social/news/daily/*/` paths | `NEWS_Buffer_stage_posts.yml` + `NEWS_GitHub_update_highlights.yml` + `NEWS_GitHub_update_readme.yml` |
| `NEWS_weekly_summary.yml` | `cron: 0 6 * * 0` (Sunday 06:00 UTC) | `NEWS_GitHub_generate_weekly_news.yml` |
| `NEWS_weekly_publish.yml` | `cron: 0 18 * * 0` (Sunday 18:00 UTC) — checks if weekly PR merged, publishes all 5 platforms | `NEWS_Discord_post_weekly_news.yml` + `NEWS_Buffer_stage_posts.yml` (weekly) |
| `NEWS_readme_update.yml` | PR closed on `social/news/highlights.md` with `NEWS` label | `NEWS_GitHub_update_readme.yml` |

## Scripts: 11 → 11

| Script | Purpose | Replaces |
|---|---|---|
| `generate_realtime.py` | Per-PR: AI analysis → gist JSON → image gen (source of truth) | `discord_post_merged_pr.py` |
| `publish_realtime.py` | Per-PR: reads gist → AI announcement → Discord webhook post | (new — decoupled from gist generator) |
| `generate_daily.py` | Daily: read gists → summary + all platform posts + diary + images | `twitter_generate_post.py`, `instagram_generate_post.py`, `linkedin_generate_post.py` |
| `generate_weekly.py` | Weekly: read gists directly (Mon→Sun) → synthesize themes → changelog + all platform posts + images | `github_generate_weekly_news.py` |
| `publish_daily.py` | On daily PR merge: Buffer stage (X, IG) + highlights + README. LinkedIn = weekly only, Reddit = TypeScript app. | (new — consolidates publish steps) |
| `publish_weekly.py` | Sunday 18:00 UTC cron: check if weekly PR merged, then Buffer (X, LI, IG) + Reddit API + Discord webhook | `discord_post_weekly_news.py` |
| `update_highlights.py` | AI extracts highlights from daily summary for website + README | `github_update_highlights.py` |
| `update_readme.py` | Updates README "Latest News" section from highlights | `github_update_readme.py` |
| `common.py` | Shared utils: prompt loading, API calls, gist I/O, retry logic | Same (extended) |
| `buffer_publish.py` | Buffer API staging with scheduled delivery | `buffer_stage_post.py` |
| `buffer_utils.py` | Buffer GraphQL API helpers | Same (unchanged) |

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
            (Discord posts text-only; diary entry has no image)
```

Discord posting (`publish_realtime.py`) runs as a **separate workflow step** after the gist generator. If Discord posting fails, the gist is already committed (source of truth preserved). Discord is best-effort notification.

### Tier 2: `generate_daily.py`

- If gist directory is **empty** (no PRs merged that day): skip. No PR created, no posts generated. Quiet days are quiet days.
- If gist directory is **missing** (workflow bug): fall back to `get_merged_prs()` from GitHub GraphQL directly. Log a warning.
### Tier 3: `generate_weekly.py`

- Reads gists directly for the week (Mon→Sun). No dependency on daily summaries.
- If gist directory is **empty** for all days (no PRs merged that week): skip. No PR created.

### Re-triggering

All workflows support `workflow_dispatch` for manual re-triggering:
- `NEWS_pr_gist.yml`: accepts `pr_number` input to regenerate a specific gist
- `NEWS_daily_summary.yml`: accepts `date` input to regenerate a specific day
- `NEWS_weekly_summary.yml`: accepts `target_date` input

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

7. **Single daily PR instead of 3** — one PR contains twitter.json + instagram.json + reddit.json + diary.json + images. LinkedIn is weekly-only. Humans review narrative, not fragments.

8. **Daily summary clusters related PRs into 3-5 story arcs** — 5 PRs about the same subsystem become one narrative beat. Editorial quality, not a changelog.

9. **Three independent image families** — see Image Generation Strategy section below.

10. **Highlights + README updated daily** — not just weekly. Every daily PR merge triggers highlights extraction and README update.

11. **Weekly delivery at Sunday 18:00 UTC** — Sunday evening "week wrap-up" energy. All 5 platforms at once.

12. **No fallback content for zero-PR days** — if no PRs merged, the daily workflow skips entirely. No PR created, no posts. Quiet days are quiet days.

13. **Diary frontend deferred** — pipeline generates `diary.json` from Phase 2 so data accumulates, but the website page (`pollinations.ai/diary/*`) ships as a separate frontend task in Phase 5.

14. **Weekly reads gists directly, independent of dailies** — the weekly summary reads the week's gists (Mon→Sun) and synthesizes themes into a bigger narrative ("this week we shipped X, fixed Y, started Z"). This eliminates the dependency on daily summaries being generated first, ensuring no PRs are missed.

---

## Image Generation Strategy

There are **3 independent families of images**. Each tier generates its own images with its own prompts and style. They do not share images across tiers (except the diary).

| Family | Generated by | When | Style | Count | Used by |
|---|---|---|---|---|---|
| **Per-PR pixel art** | `generate_realtime.py` | Tier 1 (on PR merge) | 8-bit pixel art | 1 per PR | Discord post, website diary |
| **Daily platform images** | `generate_daily.py` | Tier 2 (06:00 UTC) | Brand pixel art (from `brand_visual.md`) | 1 Twitter + 3 Instagram + 1 Reddit = **5 per day** | Twitter, Instagram, Reddit daily posts (LinkedIn = weekly only) |
| **Weekly platform images** | `generate_weekly.py` | Tier 3 (Sunday 06:00 UTC) | Brand pixel art (from `brand_visual.md`) | 1 Twitter + 1 LinkedIn + 3 Instagram + 1 Reddit + 1 Discord = **7 per week** | Twitter, LinkedIn, Instagram, Reddit, Discord weekly posts |

**Key points:**

- **Daily and weekly images are freshly generated** from the daily narrative / weekly summary. They are NOT the per-PR pixel art images. The AI creates images that illustrate the aggregated story, not individual PRs.
- **The diary is the only thing that reuses Tier 1 images.** It collects the per-PR pixel art image URLs from gist JSONs — zero extra image generation cost.

---

## Cost Estimate

### Current system (per day, assuming 5 PRs merged)

| Step | AI calls | Image gens |
|---|---|---|
| Discord per-PR (5x) | 10 | 5 |
| Twitter daily | 2 | 1 |
| Instagram daily | 2 | 3-5 |
| LinkedIn (on posting days) | 2 | 1 |
| **Total** | **14-16** | **10-12** |

### New system (same day, 5 PRs merged)

| Step | AI calls | Image gens |
|---|---|---|
| PR gists (5x) | 5 | 5 |
| Daily summary (1x) | 2 | 5 (1 twitter + 3 instagram + 1 reddit) |
| **Total** | **7** | **11** |

**AI calls reduced ~50%.** Image generation stays similar (same number of images needed). The real savings grow with PR volume — current system scales as N×platforms, new system scales as N+1.

Weekly adds ~3 AI calls + ~7 image gens on Sundays. Net weekly savings: ~35-45 fewer AI calls.

---

## Migration (Phased, Non-Breaking)

### Phase 1: Add gist generation
- Create `generate_realtime.py` + `NEWS_pr_gist.yml`
- Run alongside existing Discord workflow (both fire on PR merge)
- Verify gists accumulate for a few days
- Validate schema, `publish_tier` defaults, `importance` classification

### Phase 2: Add daily summary
- Create `generate_daily.py` + `NEWS_daily_summary.yml`
- Create `publish_daily.py` + `NEWS_daily_publish.yml`
- Run alongside existing platform generators (both create PRs)
- Compare output quality side-by-side
- Verify highlights + README update daily
- Verify zero-PR days exit cleanly (no PR created)

### Phase 3: Cutover
- **Disable** (don't delete) old platform-specific generate workflows (Twitter, IG, LinkedIn)
- **Disable** (don't delete) old Discord merged PR workflow
- Update Buffer staging paths
- **Keep old workflows disabled for 2 weeks minimum** — if new system degrades, re-enable old workflows as instant rollback

### Phase 4: Weekly migration
- Create `generate_weekly.py` + `NEWS_weekly_summary.yml` (Sunday 06:00 UTC)
- Create `publish_weekly.py` + `NEWS_weekly_publish.yml` (Sunday 18:00 UTC cron)
- Weekly reads gists directly (Mon→Sun) and synthesizes themes
- Weekly generates posts for all 5 platforms (X, IG, LI, Reddit, Discord) + changelog
- Sunday 18:00 UTC cron checks if weekly PR was merged, publishes all 5 platforms simultaneously
- **Disable** (don't delete) old weekly workflows for 2 weeks

### Phase 5: Diary frontend + cleanup
- Build website diary page (separate frontend task, see Diary section above)
- Remove disabled old scripts and workflows after 2+ weeks of stable new system
- Update social/README.md and platform READMEs
- ~~Archive `social/news/transformed/` (keep for history)~~ Done — data migrated to `daily/` + `weekly/`, `transformed/` deleted

### Rollback plan

~~At any phase, rollback = re-enable the old disabled workflows.~~ Old scripts and workflows have been removed. The 3-tier pipeline is the sole active system.

---

## Verification

1. **Tier 1 — happy path**: Merge a test PR → verify gist JSON committed to `social/news/gists/` + image generated + Discord post sent (separate step)
2. **Tier 1 — AI failure**: Mock AI to fail → verify minimal gist (metadata only) committed + GitHub issue opened
3. **Tier 2 — happy path**: Manually trigger daily workflow → verify single PR with all platform posts + diary + images
4. **Tier 2 — zero PRs**: Run daily workflow on a day with 0 gists → verify workflow exits cleanly with no PR created
5. **Tier 3 — happy path**: Manually trigger weekly workflow → verify PR with changelog + all 4 platform posts
6. **Daily publish**: Merge daily PR → verify Buffer stages X/IG + highlights + README updated (no LinkedIn — weekly only)
7. **Weekly publish**: Merge weekly PR before Sunday 18:00 UTC → verify Sunday 18:00 cron publishes all 5 platforms (Buffer X/LI/IG + Reddit API + Discord webhook)
7b. **Weekly publish — PR not merged**: Don't merge weekly PR → verify Sunday 18:00 cron skips cleanly
8. **Publish tier gating**: Merge a non-user-facing PR → verify `publish_tier: discord_only` → verify absent from daily summary
9. **Clustering**: Day with 5+ related PRs → verify daily summary groups them into narrative arcs (not a flat list)
10. **Concurrent merges**: Merge 3 PRs within 30 seconds → verify all 3 gists committed without conflicts
11. **Late gist commit**: Merge a PR on day N, delay gist commit to day N+1 → verify the day N daily summary (if already run) misses it, and the day N+1 summary picks it up via `merged_at` timestamp
12. **Rollback**: Disable new workflows, re-enable old → verify old system picks up immediately

---

## Critical Files

| File | Role |
|---|---|
| `social/scripts/common.py` | Shared utilities: prompt loading, API calls, gist I/O, retry logic, constants |
| `social/scripts/buffer_publish.py` | Buffer API staging with scheduled delivery |
| `social/buffer-schedule.yml` | Delivery schedule for all platforms |

## Prompts

All prompts live in `social/prompts/` (flat structure, one file per platform):

```
social/prompts/
  _shared/
    brand_about.md           # Company description, injected as {about}
    brand_visual.md          # Pixel art style guide, injected as {visual_style}
    pr_gist.md               # Tier 1: Analyze PR → gist JSON + image prompt
    realtime_summary.md      # Tier 1: Format real-time announcement from gist
    daily_summary.md         # Tier 2: Cluster gists into 3-5 narrative arcs
    weekly_summary.md        # Tier 3: Synthesize weekly recap from gists
  twitter.md                 # Platform voice: Twitter/X
  linkedin.md                # Platform voice: LinkedIn
  instagram.md               # Platform voice: Instagram
  reddit.md                  # Platform voice: Reddit
  discord.md                 # Platform voice: Discord
  diary.md                   # Platform voice: Website dev diary
  highlights.md              # Platform voice: GitHub highlights
```

### Prompt Composition Pattern

Every post is generated from **two dimensions** combined:

1. **Shared format** (`_shared/*.md`) — defines what content to extract and how to structure it (platform-neutral)
2. **Platform voice** (`<platform>.md`) — defines tone, length, formatting rules for a specific destination

The system prompt for each AI call is: `shared_format + platform_voice`. This allows reusing the same format across platforms and the same voice across cadences (realtime, daily, weekly).
