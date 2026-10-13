# Social Media News Pipeline

> **Assumption:** GitHub is the single source of truth. "Merge to main" (or `master`, for the legacy APIs) is the authoritative event for shipping news.

## Context

Each PR is analyzed once at merge time (its **gist**), and every post is written from those gists. Scheduled posts are written by `posts.py` from one prompt file per post and delivered by `deliver.py`, which keeps a record so nothing is sent twice.

---

## How it runs

```
EACH MERGED PR (news-create-pr-gist.yml)
  gist.py: classification + exact model/API changes → AI gist → pixel-art image → news branch
  discord_pr.py: the gist → Discord post (with the image)

SCHEDULED POSTS (news-posts.yml: a posts job writes and saves, a deliver job sends)
  06:00 daily        yesterday's daily (X); Sunday also the week (X, LinkedIn,
                     Instagram, Discord); the 1st also last month (summary + cover).
                     Then Buffer schedules X, LinkedIn and Instagram at today's slots.
  18:00 Sunday       Discord for the week
  14:00 Wednesday    model post: /models compared with last Wednesday's snapshot,
                     sent to Discord, then saved

AFTER THOSE (news-build-index.yml, news-sync-readme.yml)
  news_index.py → index.json (Enter /news, README)     readme.py → README Latest News PR at 07:00
```

| Time (UTC) | Posts | Delivery |
|---|---|---|
| Each merged PR | gist + image | Discord, right away |
| Daily 06:00 | `daily/<yesterday>/` | X in Buffer for the next Mon–Sat 15:00 |
| Sunday 06:00 | also `weekly/<sunday>/` | X Monday 15:00; LinkedIn and Instagram Sunday 18:00 (Buffer) |
| Sunday 18:00 | — | Discord, the week |
| Wednesday 14:00 | `models/` | Discord with the models role ping, then saved |
| 1st 06:00 | also `monthly/<last month>/` | — |

The Saturday daily is written on Sunday and never delivered: the week replaces it. Reddit posting stopped on 2026-10-13 and will start fresh once we know what to post there and when.

### Branch Strategy

- **`main` branch** — source code only. The README "Latest News" section is updated by a small automated PR.
- **`news` branch** — all generated content: gists, posts, pictures, delivery records, `index.json`. Unprotected (direct commits).

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
Classification and the model and API change lookups must succeed: a failure stops the gist (no gist, no Discord post) until a person reruns it. Older gists may carry an `enrichment` status from when such failures were skipped. Fetching the PR and its complete file list is required. Manual dispatch regenerates text and images and posts Discord again; use local edits for enrichment-only repairs or backfills.
Existing AI categories, text, images, and publish-tier rules remain available to social consumers.

- Committed directly to `news` branch (no PR needed — small auto-generated JSON)
- One file per merged PR per day
- Unique filenames per PR (`PR-{number}.json`) — no git push race conditions
- **Includes pixel art image URL** — generated at PR merge time, reused by Discord posts
- Image generation uses our own API, one attempt: a failed picture stops the gist

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

`gist_context()` passes the same facts to realtime Discord, daily and weekly: summary, selection metadata, Area/Type/Source and app links. Only the per-PR Discord post also receives model `announcements`: price, balance and eligibility changes go to Discord and Enter's model news, never to X, LinkedIn or Instagram. Platform prose is generated downstream. Existing archive summaries remain readable without a backfill. Optional metadata backfills are prepared locally and preserve existing text, images and publishing flags. `gist.category` remains during classification migration.

`news_index.py` (workflow `news-build-index.yml`, after every gist and every `news-posts.yml` run) writes `index.json` on the news branch: model announcements from gists and the daily `highlights`. Enter's `/news` page and the README read only this file.

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

- `summary.json` — the day's summary; its `highlights` (each with a `kind`: `model`, `api`, `app` or `product`) feed `index.json`
- `twitter.json` — simplified platform envelope
- `images/` — all generated images
- `delivery.json` — written only by `deliver.py`: one entry per post sent

### Weekly: `operations/social/news/weekly/YYYY-MM-DD/`

`YYYY-MM-DD` is the Sunday publish date. The content still covers the previous Sun→Sat window.

- `summary.json` — canonical weekly summary used by the website
- `twitter.json` — simplified platform envelope
- `linkedin.json` — simplified platform envelope
- `instagram.json` — simplified platform envelope
- `discord.json` — simplified platform envelope
- `images/` — all generated images
- `delivery.json` — written only by `deliver.py`

### Monthly: `operations/social/news/monthly/YYYY-MM/`

- `summary.json` — the month's summary, from its daily summaries
- `images/cover.jpg` — the month's cover
- `contributors.json` — every PR merged into `main` or `master` that month, counted per GitHub account (authors and noreply co-authors, by account id); the website's community section reads it

### Model post: `operations/social/news/models/`

- `snapshots/YYYY-MM-DD.json` — `/models` on that Wednesday; the next Wednesday compares with the latest one
- `diffs/YYYY-MM-DD.json`, `YYYY-MM-DD/discord.json` — the comparison and the post, saved only after Discord confirms the send
- `YYYY-MM-DD/delivery.json` — written only by `deliver.py`
- `models.md` — every model post, newest first

### Platform Envelope

Daily and weekly platform JSON now share one persisted shape:

```json
{
  "platform": "twitter|linkedin|instagram|discord",
  "scope": "daily|weekly",
  "date": "YYYY-MM-DD",
  "period_start": "YYYY-MM-DD",
  "period_end": "YYYY-MM-DD",
  "generated_at": "ISO-8601 timestamp",
  "text": "optional, final publish-ready text",
  "images": [{"url": "https://..."}],
  "metadata": {"post_type": "post|carousel"}
}
```

---

## Workflows

| Workflow | Trigger | What it does |
|---|---|---|
| `news-create-pr-gist.yml` | `pull_request_target` closed + merged, into `main` or `master` | `gist.py`, then `discord_pr.py` |
| `news-posts.yml` | 06:00 daily, 18:00 Sunday, 14:00 Wednesday | posts job: `posts.py write` + `save` + push, one post at a time; deliver job: `deliver.py` (only it holds the Buffer and Discord keys) |
| `news-build-index.yml` | after the two above, and 06:30 daily | `news_index.py` → `index.json` |
| `news-sync-readme.yml` | 07:00 daily | `readme.py` → README Latest News PR to `main` |

### Manual runs of `news-posts.yml`

| Input | Values |
|---|---|
| `job` | `morning` (what the 06:00 run does on that day), `afternoon` (its 15:00 or Sunday 18:00 run), `daily`, `weekly`, `monthly`, `models` |
| `date` | the day, the Sunday, the month (`YYYY-MM`) or the Wednesday |
| `run` | `preview` (default): writes and saves into a throwaway checkout, shows the diff and keeps the texts and pictures with the run; sends nothing. `all`, `write + save`, `deliver` |
| `overwrite` | write and save a date that is already saved again; `delivery.json` is kept, and a saved model post is never replaced |

A preview is the before/after check for any change to a prompt or a script: run it for a date already on `news` and compare.

## Scripts

| Script | Purpose |
|---|---|
| `gist.py` | Per PR: classification, exact model changes (registry revisions, `model_catalog.ts`) and API changes (the docs PR's `APIDOCS.md`) → AI gist → image → news branch |
| `discord_pr.py` | Per PR: the gist → `prompts/posts/discord-pr.md` → Discord webhook |
| `posts.py` | `write JOB DATE` makes the post files' model calls and pictures into a work folder; `save JOB DATE` turns it into today's files in a `news` checkout. Neither commits |
| `contributors.py` | The month's merged PRs per GitHub account, for `monthly/<month>/contributors.json` |
| `deliver.py` | `schedule` (Buffer), `send` (Discord; the model post from its work folder), `mark` (a person settles a stuck send) |
| `news_index.py` | `index.json`: model announcements, API changes and daily highlights for Enter `/news` and the README |
| `readme.py` | README Latest News from `index.json` |
| `model_catalog.ts` | The model list at a commit, for the gist's model changes |
| `common.py` | Shared: prompt loading and brand injection, the model and picture calls, file builders, gist helpers |
| `test_news.py` | Tests (`python3 -m unittest operations/social/scripts/test_news.py`) |

---

## Delivery rules

1. **One run at a time.** `news-posts.yml` runs queue; none is cancelled.
2. **Writing and delivering are separate jobs.** Rerunning a delivery never writes new posts; a failed post never stops the others' delivery.
3. **Save once.** Each post is one commit to `news`; a saved date is skipped unless `overwrite` is set.
4. **Never twice.** `delivery.json` is written before each send, with the file's sha, so two runs can't both claim a post. Buffer and Discord confirm a send. An unclear result (`attempt`) fails the run until a person checks the channel and runs `deliver.py mark JOB DATE POST done|failed`.
5. **Buffer only gets posts scheduled at today's slots;** nothing is posted right away.
6. **The model baseline moves only after a confirmed send:** the snapshot is saved after Discord has the post; a week without changes saves only the snapshot.
7. **Start dates.** `deliver.py` refuses dates before its `START` (daily 2026-10-12, weekly 2026-10-18, models 2026-10-14); older folders went out with the previous senders.

## Error handling

- **No automatic retries.** Model, picture, GitHub and Discord calls are tried once; a failure (an empty model answer included) turns the run red and a person reruns it with the repair skill (`.claude/skills/news-pipeline/SKILL.md`). The one exception is the push to `news`, which fetches, rebases and pushes again up to three times because other writers land on `news` every few minutes.
- **Gist (`gist.py`) fails loud.** If classification, the model or API change lookup, the AI analysis, validation or the image fails, the run fails: no partial gist, no Discord post.
- **Per-PR Discord (`discord_pr.py`)** fails the run if the message, the image or the webhook fails; the post is never degraded.
- **Scheduled posts:** a post whose reply misses a required field, or whose picture fails, stops before anything is saved. A day or week without daily-tier gists writes nothing. Each job's failure opens its own issue ("Workflow failing: News / Posts — writing" or "— delivery"), so a delivery failure can't hide a writing failure.

## Concurrency

- **Simultaneous PR merges:** each gist is its own file (`PR-{number}.json`), so writes never collide.
- **`news` moves often** (about 78 commits a day): the posts job fetches, rebases and pushes again, up to three times. Its paths never overlap another writer's.
- **Late gists:** posts select gists by `merged_at`, not commit time. A gist committed after its day's 06:00 run misses that daily, but the week still reads it if it lands before Sunday 06:00.

---

## Key Design Decisions

1. **PR-time analysis is the anchor** — intent is frozen while context is freshest; every platform reads the same gist.
2. **Gists hold facts; summaries and posts hold presentation** — headlines and platform wording are written downstream.
3. **`publish_tier` gates what reaches the daily and weekly posts** — non-user-facing PRs stay `discord_only`.
4. **Importance is binary** — `major`/`minor`, chosen by the AI.
5. **One prompt file per post** — brand → tone → the post file. Each scheduled post is a fixed prompt and one model call; no agent, so content stays predictable.
6. **The daily summary clusters related PRs into 3-5 arcs** and picks 0-5 highlights, each with a `kind`; Enter's Updates tab shows `product` only, the Changelog lists models and API changes, the README shows them all.
7. **The weekly reads the week's gists directly** (Sunday to Saturday), independent of the dailies.
8. **No content for quiet days** — no daily-tier gists, no posts.

---

## Image Generation

| Family | Written by | Count | Used by |
|---|---|---|---|
| Per-PR pixel art | `gist.py` | 1 per PR | Discord per PR |
| Daily | `posts.py` | 1 (X) | the daily post |
| Weekly | `posts.py` | 6 (X, LinkedIn, 3 Instagram, Discord) | the weekly posts |
| Monthly cover | `posts.py` | 1 | the monthly page |

Every picture uses `nanobanana-2-lite` with the character reference `prompts/brand/characters-ref.jpg` (one Polli, one monitor robot, one Nomnom) and the shared style text in `common.IMAGE_STYLE_SUFFIX`, which also says each character appears at most once. The model post has no picture.

## Cost (a day with 5 merged PRs)

| Step | AI calls | Pictures |
|---|---|---|
| PR gists (5×) | 5 | 5 |
| Daily summary + X | 2 | 1 |
| **Total** | **7** | **6** |

Sunday adds 5 calls and 6 pictures, the 1st 2 calls and 1 picture, Wednesday 1 call.

---

## Prompts

```
operations/social/prompts/
  brand/                    injected into any prompt by placeholder
    about.md                {about}          who we are
    visual.md               {visual_style}   the look of every picture, the cast
    bee.md                  {bee_character}  Polli
    links.md                {links}          links posts may use
    characters-ref.jpg      the character sheet sent with every picture
  tone/                     one voice per platform: twitter, linkedin, instagram, discord
  gist.md                   each merged PR: the gist
  posts/                    one file per post: settings between --- lines, then the task
    discord-pr.md  daily-summary.md  daily-x.md
    weekly-summary.md  weekly-x.md  weekly-linkedin.md  weekly-instagram.md  weekly-discord.md
    monthly-summary.md  monthly-cover.md  model-post.md
```

A post file's settings say its `job`, its `tone` (the system prompt; a summary has none and is its own system prompt), its `temperature`, the `file` it is saved as, its `pictures` and the fields its reply must have. A platform post's task is its text with the summary's recap filled in.
