# Social Media News Pipeline

> **Status:** Implemented — 4-tier architecture is the sole active system.
>
> **Assumption:** GitHub is the single source of truth. "Merge to main" is the authoritative event for shipping news.

## Context

The previous system had 9 workflows and 11 scripts where each platform (Twitter, Instagram, LinkedIn, Discord, Reddit) **independently fetched PRs from GitHub and independently analyzed them with AI**. The same PRs got fetched 4-5 times per day, each platform re-interpreted them from scratch, and 3 separate PRs were created daily for review.

The pipeline uses **event-centric interpretation**: each PR is analyzed once at merge time, and all downstream content aggregates from that single analysis.

---

## Architecture: 4 Tiers

```
TIER 1: PER-PR (real-time)
  PR merged → classification/model enrichment → AI analyzes remaining facts → image generated → gist JSON committed to news branch → Discord post

TIER 2: DAILY (every day 06:00 UTC; social delivery Mon-Sat)
  Read day's gists → AI generates daily summary → platform posts (X, Reddit)
  → commit to news branch → Buffer stages X immediately → README-only PR to main
  LinkedIn and Instagram are weekly-only. Reddit publishes via cron at 15:00 UTC.

TIER 3: WEEKLY (Sunday 06:00 UTC)
  Read week's gists directly (Sun→Sat) → synthesize weekly themes → platform posts (X, IG, LI, Reddit, Discord)
  → commit to news branch under the Sunday publish date → Buffer stages X + LI + IG immediately
  Reddit + Discord publish via cron at 18:00 UTC Sunday.

TIER 4: MONTHLY (1st of the month 06:00 UTC)
  Read month's gists directly → count merged PRs + contributors on GitHub → synthesize monthly themes
  → website post (title, summary, story) + one cover drawn from last month's story
  → commit to news branch under the month → index.json feeds the website's build diary
```

### Branch Strategy

- **`main` branch** — source code only. No generated content. README "Latest News" section updated via small automated PRs.
- **`news` branch** — all generated content: gists, daily posts, weekly posts, monthly pages, `index.json`, images. Unprotected (direct commits). Content is reviewed here before cron publishes it.

### Data Flow

```
═══════════════════════════════════════════════════════════════════════
 TIER 1: PER-PR (on merge)
═══════════════════════════════════════════════════════════════════════

PR merge ──→ generate_realtime.py
                │
                ├──→ Step 1: classification/model enrichment → AI factual summary
                │
                └──→ Step 2: 🎨 GENERATE 1 image (8-bit pixel art)
                     → stored once as image.prompt + image.url
                     → complete gist committed to news branch

           ──→ publish_realtime.py (separate step)
                └──→ Reads gist → AI announcement → Discord webhook post

             Images generated: 1 per PR
             Images reused:    Discord reuses gist image

═══════════════════════════════════════════════════════════════════════
 TIER 2: DAILY (Mon-Sat 06:00 UTC → Buffer immediate → Reddit 15:00 UTC)
═══════════════════════════════════════════════════════════════════════

             06:00 UTC ──→ generate_daily.py
                            │  (reads gists, clusters into 3-5 arcs, picks 0-5 highlights)
                            │
                            ├──→ summary.json   (story + highlights for Enter News and README)
                            ├──→ twitter.json   + 🎨 GENERATE 1 image (brand pixel art)
                            ├──→ reddit.json    + 🎨 GENERATE 1 image (brand pixel art)
                            │
                            ├──→ Commit all to news branch
                            ├──→ Buffer stages X immediately (PUBLISH_MODE=buffer)
                            └──→ README-only PR to main (Latest News section)
                                  (LinkedIn + Instagram = weekly only, no daily posts)

             15:00 UTC ──→ news-publish-social.yml (cron, PUBLISH_MODE=direct)
                            └──→ Reddit VPS deployment

             Images generated: 2 (1 twitter + 1 reddit)

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

             Sunday 18:00 UTC ──→ news-publish-social.yml (cron, PUBLISH_MODE=direct)
                                    ├──→ Reddit VPS deployment
                                    └──→ Discord webhook post (with image)

             Images generated: 7 (1 twitter + 1 linkedin + 3 instagram + 1 reddit + 1 discord)
             Images reused:    none

═══════════════════════════════════════════════════════════════════════
 TIER 4: MONTHLY (1st of the month 06:00 UTC → website build diary)
═══════════════════════════════════════════════════════════════════════

             1st 06:00 UTC ──→ generate_monthly.py
                                   │  (reads the month's gists directly)
                                   │
                                   ├──→ GitHub search: merged PRs + contributors
                                   ├──→ contributors.json  (merged_prs + contributors, committed first)
                                   ├──→ summary.json  (themes)
                                   ├──→ website.json  + 🎨 GENERATE 1 cover (16:9)
                                   │      references: character sheet + creatures who live there
                                   │
                                   └──→ Commit all to news branch
                                         → news-build-index.yml → index.json months/contributors

             Images generated: 1 cover (redrawn up to 3× if a character repeats)
```

---

## Storage

All generated content lives on the **`news` branch**.

### PR Gists: `operations/social/news/gists/YYYY-MM-DD/PR-{number}.json`

New gists also carry `area`, `type` (Dev Work type), `source`, and `merge_commit_sha`.
The project manager rechecks classification at merge using its existing brief and updates Dev before returning these values.
`announcements[]` stores exact official-model deltas from the merged registry trees, with `model_id`, `action` (`NEW`, `UPDATE`, `RETIRE`), `changes` (each field's `before` and `after`), pricing units, and effective timing.
`announcement_evidence` records the compared commit references. Merge time never proves production availability: changes have `effective_at: null` and `effective_status: unconfirmed`. A model shows as retired when the PR that removes it merges.

#### Model changes on Enter `/news`

A merged PR is the only source. The gist job reads two things from it:

| PR content | Gist announcement | Shown as |
|---|---|---|
| Registry diff: a model added, removed, or its price, Quest/Paid access or capabilities changed | `NEW` / `UPDATE` / `RETIRE`, `effective_status: unconfirmed` | New / Updated / Retired on the merge date |
| A `RETIRE` row in the PR description's model-change table with a future `Effective` date | `RETIRE`, `effective_status: scheduled`, `source: pr_description` | Retiring on that date |
| The same row with `Cancelled` as `Effective` | `effective_status: cancelled` | No longer retiring |

Registry comments are never read. A provider's deadline (`// Provider retires this route on …`) is an internal reminder: most deadlines end in a reroute, not a retirement. Announce only a decided retirement, with a row such as:

```
| Model | Action | Change | Before | After | Effective |
| --- | --- | --- | --- | --- | --- |
| `qwen/qwen3-tts-instruct-flash` | RETIRE | Availability | Available | Retired | 2026-10-09 16:00 UTC |
```

`Effective` takes `YYYY-MM-DD`, an optional `HH:MM` and a timezone (`UTC`, `Z` or `±HH:MM`; none means UTC). Rows for unknown model IDs, past dates or no date (the removal PR itself) are skipped. In `index.json` the latest announcement per model wins and keeps the earlier date as `previous_date`; the removal PR settles it, and a date that passes without a removal is hidden.
`enrichment.classification` and `enrichment.models` report `complete` or `failed`. Classification/catalog enrichment failures leave unknown values while social publication continues. Fetching the PR and its complete file list is required. Manual dispatch regenerates text and images and posts Discord again; use local edits for enrichment-only repairs or backfills.
Existing AI categories, text, images, and publish-tier rules remain available to social consumers.

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
  "labels": [],
  "area": "Billing & payments",
  "type": "Bug",
  "source": "Team",
  "merge_commit_sha": "abc123",
  "announcements": [],
  "enrichment": {"classification": "complete", "models": "complete"},

  "gist": {
    "category": "bug_fix",
    "user_facing": true,
    "publish_tier": "daily",
    "importance": "major",
    "summary": "Fixed balance deduction to use a single bucket instead of splitting across multiple. Users no longer see incorrect balances after API calls.",
    "keywords": ["billing", "balance", "api"]
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
| `gist.summary` | One neutral account of meaningful PR changes and practical effects. Model values already in `announcements` are not repeated. |
| `area`, `type`, `source` | Shared project-manager classification; null when unknown. |
| `announcements` | Exact official-model changes computed once from the registry before/after merge. Scheduled/unconfirmed status is retained. |
| `image.prompt`, `image.url` | The image prompt stored once and the generated image used by realtime Discord. |

`gist_context()` passes the same facts to realtime Discord, daily, weekly and monthly: summary, selection metadata, Area/Type/Source and app links. Only the per-PR Discord post also receives model `announcements`: price, balance and eligibility changes go to Discord and Enter's model news, never to X, Reddit, LinkedIn or Instagram. Platform prose is generated downstream. Existing archive summaries remain readable without a backfill. Optional metadata backfills are prepared locally and preserve existing text, images and publishing flags. `gist.category` remains during classification migration.

`build_news_index.py` (workflow `news-build-index.yml`, after every gist and summary run) writes `index.json` on the news branch: model announcements from gists, the daily `highlights`, the monthly `months` (merged PRs with each month's website page) and `contributors` (top 20 accounts by merged PRs over the last 12 recorded months). Enter's `/news` page, the README and the website's Community page read only this file.

Unconfirmed deployment stays in metadata; public copy describes merged changes without routine deployment disclaimers and includes known effective dates when relevant. Public gists and posts omit unresolved vulnerability details, user complaints and churn narratives; factual descriptions of product fixes remain appropriate.

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

### Daily Posts: `operations/social/news/daily/YYYY-MM-DD/`

- `summary.json` — canonical daily summary used by the website
- `twitter.json` — simplified platform envelope
- `instagram.json` — simplified platform envelope
- `reddit.json` — simplified platform envelope (LinkedIn is weekly-only, no daily file)
- `images/` — all generated images

### Weekly: `operations/social/news/weekly/YYYY-MM-DD/`

`YYYY-MM-DD` is the Sunday publish date. The content still covers the previous Sun→Sat window.

- `summary.json` — canonical weekly summary used by the website
- `twitter.json` — simplified platform envelope
- `linkedin.json` — simplified platform envelope
- `instagram.json` — simplified platform envelope
- `reddit.json` — simplified platform envelope
- `discord.json` — simplified platform envelope
- `images/` — all generated images

### Monthly: `operations/social/news/monthly/YYYY-MM/`

- `contributors.json` — `month`, `merged_prs` and `contributors` (every account with its GitHub `id`, `login`, `avatar_url`, `url` and `prs`), committed first and on its own so a failed page or cover never loses the counts. They count every PR merged into `main` in the month, by anyone: people, agents and bots. An account gets credit as the PR author or through a `Co-authored-by` trailer with a GitHub noreply address in the merge commit message; bot co-authors are skipped. Accounts are keyed by their numeric GitHub `id`, which survives renames. Every account is stored; readers pick the top N.
- `summary.json` — canonical monthly summary of the month's themes
- `website.json` — simplified platform envelope; `metadata.story` lists every landmark built so far and one open thread, for next month's cover
- `images/website.jpg` — the 16:9 cover

Each cover is the next page of one picture book: Lantern Hill, growing month by month. Covers are written and drawn like the news posts (the visual guide and the same style), from the character sheet and the latest earlier page's story; no earlier cover is attached, because the image model then copied it and the growth never added up. A fixed set of landmarks (`LANTERN_HILL`) keeps each fresh view in the same place, the story carries what was built, and a missed month never restarts it. Each later page gets its calendar month's light and weather (`MOMENTS`). Polli founds the village alone on page one; the monitor robot, Nomnom and three creatures move in one at a time as the number of people and agents who have merged a pull request since page one passes 25, 50, 200, 400 and 600 (`RESIDENTS`, kept in `metadata.residents`). Everyone is unique and there are no people: after drawing, `google/gemini-3.8-flash` lists the characters in the cover, and any repeat, person or character who has not moved in yet means a redraw, up to 3 tries.

### Platform Envelope

Daily, weekly and monthly platform JSON share one persisted shape:

```json
{
  "platform": "twitter|linkedin|instagram|reddit|discord|website",
  "scope": "daily|weekly|monthly",
  "date": "YYYY-MM-DD",
  "period_start": "YYYY-MM-DD",
  "period_end": "YYYY-MM-DD",
  "generated_at": "ISO-8601 timestamp",
  "title": "optional, used by Reddit and the website",
  "text": "optional, final publish-ready text",
  "images": [{"url": "https://..."}],
  "metadata": {"post_type": "post|carousel", "story": "website only"}
}
```

---

## Workflows

| Workflow | Trigger | What it does |
|---|---|---|
| `news-create-pr-gist.yml` | `pull_request_target: closed+merged` | Per-PR gist + Discord |
| `news-generate-summary.yml` | `cron: 0 6 * * *` | Generate content → commit to news → Buffer staging (`PUBLISH_MODE=buffer`) |
| `news-publish-social.yml` | Mon-Sat 15:00 UTC, Sun 18:00 UTC | Direct channels only (`PUBLISH_MODE=direct`): Reddit daily, Reddit+Discord weekly |

### PUBLISH_MODE

The `PUBLISH_MODE` env var controls which channels fire:

| Mode | Channels | Used by |
|---|---|---|
| `buffer` | Twitter daily, + LinkedIn and Instagram weekly → Buffer queue | `news-generate-summary.yml` (immediately after generation) |
| `direct` | Reddit → VPS, Discord → webhook | `news-publish-social.yml` (cron) |
| `all` | Both (default) | Manual / testing |

### Workflow overlay

Both `news-generate-summary.yml` and `news-publish-social.yml` overlay the `news` branch data onto the checkout:

```bash
git fetch origin news && git checkout origin/news -- operations/social/news/
```

This makes all generated content available locally for scripts that read files (e.g. `read_news_file()` in common.py).

## Scripts

| Script | Purpose |
|---|---|
| `generate_realtime.py` | Per-PR: AI analysis → gist JSON → image gen (source of truth) |
| `publish_realtime.py` | Per-PR: reads gist → AI announcement → Discord webhook post |
| `generate_daily.py` | Daily: read gists → summary with highlights + platform posts (X, Reddit) + images → commit to news |
| `build_news_index.py` | Rebuilds `index.json` (model announcements, highlights, months, contributors) for Enter `/news`, the README and the website |
| `generate_weekly.py` | Weekly: read gists directly (Sun→Sat) → synthesize themes → all 5 platform posts + images → commit to news |
| `generate_monthly.py` | Monthly: read gists directly → GitHub merged PRs + contributors → themes → website post + cover drawn from last month's story → commit to news |
| `publish_daily.py` | PUBLISH_MODE=buffer: stage X to Buffer. PUBLISH_MODE=direct: Reddit VPS deployment. |
| `publish_weekly.py` | PUBLISH_MODE=buffer: stage X + LI + IG to Buffer. PUBLISH_MODE=direct: Reddit VPS + Discord webhook. |
| `update_readme.py` | README Latest News from `index.json`: `get_top_highlights()`, `update_readme_news_section()` (called by `docs-update-readme-news.yml`) |
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

### Tier 4: `generate_monthly.py`

- Reads gists directly for the month; if there is nothing to read: skip.
- A GitHub search window over the 1,000-result cap, a failed search, digest, post or commit fails the run, and so does a cover that still repeats a character after 3 tries. The cover is committed before the JSON, so a page never points at a missing image.

### Re-triggering

All workflows support `workflow_dispatch` for manual re-triggering:
- `news-create-pr-gist.yml`: accepts `pr_number` input to regenerate a specific gist
- `news-generate-summary.yml`: accepts `date` input (Mon-Sat runs daily, Sunday runs weekly); `mode: monthly` with `target_month` regenerates one month.
- `news-publish-social.yml`: accepts `mode` + `target_date` for manual publish of direct channels

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

7. **Buffer staging immediately after generation** — `news-generate-summary.yml` generates content and immediately stages to Buffer (`PUBLISH_MODE=buffer`). Buffer handles delivery scheduling. Direct channels (Reddit, Discord) use separate cron.

   Instagram is weekly-only and is staged with the Sunday digest for delivery at 18:00 UTC.

8. **Daily summary clusters related PRs into 3-5 story arcs** — 5 PRs about the same subsystem become one narrative beat. Editorial quality, not a changelog.

9. **Four independent image families** — see Image Generation Strategy section below.

10. **Highlights come from the daily summary** — the daily call also picks 0-5 highlights into `summary.json`; a quiet day adds none. `index.json` collects them for Enter and the README "Latest News" section (small PR to main).

11. **Weekly delivery at Sunday 18:00 UTC** — Sunday evening "week wrap-up" energy. Reddit + Discord via cron. Buffer-staged platforms deliver on Buffer's schedule.

12. **No fallback content for zero-PR days** — if no PRs merged, the daily workflow skips entirely. No posts generated. Quiet days are quiet days.

13. **Gists hold facts; summaries and posts hold presentation** — creative headlines and platform wording are generated downstream. README, dashboard news and the website read `index.json`.

14. **Weekly and monthly read gists directly, independent of dailies** — the weekly summary reads the week's gists (Sun→Sat) and synthesizes themes into a bigger narrative ("this week we shipped X, fixed Y, started Z"); the monthly does the same for the month. This eliminates the dependency on daily summaries being generated first, ensuring no PRs are missed.

15. **Monthly counts come from GitHub, not gists** — gists cover `main` only and miss PRs whose gist run failed, so `merged_prs` and `contributors` (in `contributors.json`) come from a GitHub search of every PR merged into `main`.

---

## Image Generation Strategy

There are **4 independent families of images**. Each tier generates its own images with its own prompts and style.

| Family | Generated by | When | Style | Count | Used by |
|---|---|---|---|---|---|
| **Per-PR pixel art** | `generate_realtime.py` | Tier 1 (on PR merge) | 8-bit pixel art | 1 per PR | Discord post |
| **Daily platform images** | `generate_daily.py` | Tier 2 (06:00 UTC) | Brand pixel art (from `brand/visual.md`) | 1 Twitter + 1 Reddit = **2 per day** | Twitter and Reddit daily posts (LinkedIn and Instagram = weekly only) |
| **Weekly platform images** | `generate_weekly.py` | Tier 3 (Sunday 06:00 UTC) | Brand pixel art (from `brand/visual.md`) | 1 Twitter + 1 LinkedIn + 3 Instagram + 1 Reddit + 1 Discord = **7 per week** | Twitter, LinkedIn, Instagram, Reddit, Discord weekly posts |
| **Monthly cover** | `generate_monthly.py` | Tier 4 (1st of the month 06:00 UTC) | Brand pixel art, 16:9, one picture book | **1 per month** | Website build diary |

**Key points:**

- **Daily, weekly and monthly images are freshly generated** from the daily narrative / weekly / monthly summary. They are NOT the per-PR pixel art images. The AI creates images that illustrate the aggregated story, not individual PRs.
- **Monthly covers are one picture book** — each cover takes last month's story as its brief and Lantern Hill's landmarks, so the same place grows from page to page; the cast joins one by one.

---

## Cost Estimate (per day, assuming 5 PRs merged)

| Step | AI calls | Image gens |
|---|---|---|
| PR gists (5x) | 5 | 5 |
| Daily summary (with highlights) + posts | 3 | 2 (1 twitter + 1 reddit) |
| **Total** | **8** | **7** |

Weekly adds ~6 AI calls + ~7 image gens on Sundays. Monthly adds 2 AI calls + 1 image gen on the 1st.

AI calls scale as N+3 (N per-PR gists + summary with highlights + two platform posts), not N×platforms. Daily image generation is limited to the two platforms that publish daily.

---

## Verification

1. **Tier 1 — happy path**: Merge a test PR → verify gist JSON committed to `news` branch `operations/social/news/gists/` + image generated + Discord post sent (separate step)
2. **Tier 1 — AI failure**: Mock AI to fail → verify workflow fails, no gist is committed, and Discord does not post
3. **Tier 2 — happy path**: Manually trigger daily workflow → verify platform posts + images committed to `news` branch + README PR to main
4. **Tier 2 — zero PRs**: Run daily workflow on a day with 0 gists → verify workflow exits cleanly with no content generated
5. **Tier 3 — happy path**: Manually trigger weekly workflow → verify all 5 platform posts + images committed to `news` branch
6. **Daily publish — Buffer**: Verify `news-generate-summary.yml` stages X/IG to Buffer immediately after generation
7. **Daily publish — Reddit**: Verify `news-publish-social.yml` cron at 15:00 UTC deploys Reddit to VPS
8. **Weekly publish — Buffer**: Verify `news-generate-summary.yml` stages X/LI/IG to Buffer immediately after generation
9. **Weekly publish — Reddit+Discord**: Verify `news-publish-social.yml` Sunday 18:00 UTC cron publishes Reddit + Discord
10. **Publish tier gating**: Merge a non-user-facing PR → verify `publish_tier: discord_only` → verify absent from daily summary
11. **Clustering**: Day with 5+ related PRs → verify daily summary groups them into narrative arcs (not a flat list)
12. **Concurrent merges**: Merge 3 PRs within 30 seconds → verify all 3 gists committed without conflicts
13. **Tier 4 — happy path**: Trigger `mode: monthly` for two consecutive months, oldest first → verify `contributors.json`, `summary.json`, `website.json` and `images/website.jpg` for each, the second cover keeps Lantern Hill's landmarks and last month's story, and `index.json` lists both months

---

## Critical Files

| File | Role |
|---|---|
| `operations/social/scripts/common.py` | Shared utilities: prompt loading, brand injection, API calls, gist I/O, `read_news_file()`, retry logic, constants |
| `operations/social/scripts/buffer_publish.py` | Buffer API staging with scheduled delivery |
| `operations/social/buffer-schedule.yml` | Delivery schedule for all platforms |

## Prompts

All prompts live in `operations/social/prompts/`:

```
operations/social/prompts/
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
    website.md                 # Website build diary voice + image adaptation

  gist.md                      # Tier 1: Analyze PR → gist JSON + image prompt
  daily.md                     # Tier 2: Cluster gists into 3-5 narrative arcs + highlights
  weekly.md                    # Tier 3: Synthesize weekly recap from gists
  monthly.md                   # Tier 4: Synthesize monthly recap from gists + the picture-book story rules
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
