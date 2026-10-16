# Social Media News Pipeline

> **Assumption:** GitHub is the single source of truth. A PR merged into `main` (or `master`, for the legacy APIs) is the news; the production deploy is when it ships.

## Context

Each day's merged PRs are read from GitHub once, by the daily post: one **note** per PR, written from its diff and used only during that run. The daily saves its summary and post; the weekly and the monthly read the daily summaries. Scheduled posts are written by `posts.py` from one prompt file per post and delivered by `deliver.py`; each PR a production deploy ships gets its own Discord post from `deploy_posts.py`. Both keep a record so nothing is sent twice.

---

## How it runs

```
EACH PRODUCTION DEPLOY (news-deploy-posts.yml, after "Deploy / Cloudflare production" succeeds)
  deploy_posts.py: the PRs merged into main since the previous deploy → one Discord post
                   each, with a picture

SCHEDULED POSTS (news-posts.yml: a posts job writes and saves, a deliver job sends)
  06:00 daily        /models recorded when it changed; yesterday's merged PRs → notes
                     → the daily (X); Sunday also the week from its dailies (X,
                     LinkedIn, Instagram, Discord); the 1st also last month (summary
                     + cover). Then Buffer schedules X, LinkedIn and Instagram at
                     today's slots.
  18:00 Sunday       Discord for the week
  14:00 Wednesday    model post: official models in the recorded catalog against a
                     week earlier, sent to Discord, then saved
                     then the community post: the same for community models

AFTER THOSE (news-build-index.yml)
  news_index.py → index.json (Enter /news)
```

| Time (UTC) | Posts | Delivery |
|---|---|---|
| Each production deploy | — | Discord, one post per shipped PR |
| Daily 06:00 | `daily/<yesterday>/` | X in Buffer for the next Mon–Sat 15:00 |
| Sunday 06:00 | also `weekly/<sunday>/` | X Monday 15:00; LinkedIn and Instagram Sunday 18:00 (Buffer) |
| Sunday 18:00 | — | Discord, the week |
| Daily 06:00 | `models/snapshots/<today>.json` when `/models` changed | — |
| Wednesday 14:00 | `models/`, then `community/` | Discord: the model post with the models role ping, then the community post without one; each saved once sent |
| 1st 06:00 | also `monthly/<last month>/` | — |

The Saturday daily is written on Sunday and never delivered: the week replaces it. Reddit posting stopped on 2026-10-13 and will start fresh once we know what to post there and when. PRs merged into `master` reach the daily and weekly but get no deploy post: the legacy APIs are not deployed by the Cloudflare workflow.

### Branch Strategy

- **`main` branch** — source code only.
- **`news` branch** — all generated content: summaries, posts, picture links, delivery records, the `/models` record, `index.json`. Unprotected (direct commits).

---

## Storage

All generated content lives on the **`news` branch** under `operations/social/news/`. No picture file is stored: see [Pictures](#pictures).

### Daily: `daily/YYYY-MM-DD/`

- `summary.json` — the day's summary from the `daily`-tier notes, with the numbers of the PRs it covers; its `highlights` (each with a `kind`: `model`, `api`, `app` or `product`) and its `changelog` feed `index.json`
- `twitter.json` — platform envelope
- `delivery.json` — written only by `deliver.py`: one entry per post sent

`changelog` lists every PR of the day, posted or not, that changed the API (`api_changes`) or scheduled a model retirement (`announcements`): what Enter's Changelog reads. A day without `daily`-tier notes writes no post and saves a `summary.json` holding only its `date` and `changelog`, or nothing when that is empty.

### PR notes (not saved)

`prs.py` finds the day's merged PRs into `main` or `master` (UTC day) with one GitHub search, reads each PR's Area, Work type and Source from the Dev project, and asks `prompts/pr.md` for the note from the PR's title, description and diff. The diff decides: a claim from the description stays only when the diff supports it. A day can have 80 PRs, too many diffs for one call, so each PR is read on its own; the daily summary is written from the notes, and only the `changelog` is saved.

```json
{
  "pr_number": 8117,
  "title": "fix(enter): single-bucket balance deduction",
  "author": "username",
  "url": "https://github.com/pollinations/pollinations/pull/8117",
  "merged_at": "2026-02-09T15:30:00Z",
  "base": "main",
  "labels": [],
  "area": "Billing & payments",
  "type": "Bug",
  "source": "Team",
  "summary": "Fixed balance deduction to use a single bucket instead of splitting across multiple. Users no longer see incorrect balances after API calls.",
  "category": "bug_fix",
  "importance": "major",
  "user_facing": true,
  "keywords": ["billing", "balance", "api"],
  "publish_tier": "daily"
}
```

| Field | Purpose |
|---|---|
| `summary` | One neutral account of the PR's meaningful changes and their practical effect, from the diff. Provider costs stay out. |
| `publish_tier` | `"none"` / `"discord_only"` / `"daily"`: only `daily` notes reach the daily, and through it the weekly and monthly. |
| `importance` | `"major"` (headline-worthy) or `"minor"` (everything else). The daily uses `major` PRs as headline arcs. |
| `user_facing` | Whether people using the tools would notice. |
| `area`, `type`, `source` | The Dev project's classification; null when unknown. |
| `app_name`, `app_url` | An app-submission PR (branch `auto/app-<issue>-…`): the app it adds. |
| `api_changes` | Only on the post-deploy docs PR that regenerates `APIDOCS.md`: the endpoint changes between its parent and its merge. |
| `announcements` | Model retirements the PR description schedules (below). |

`publish_tier` is the writer's choice with two label rules on top: `deps` or `chore` with `user_facing: false` → `discord_only`; `feature` → `daily`.

### Weekly: `weekly/YYYY-MM-DD/`

`YYYY-MM-DD` is the Sunday publish date; the content covers the previous Sun→Sat window, read from those days' daily summaries and highlights. Saturday's daily is written just before it, in the same run.

- `summary.json` — the week's summary
- `twitter.json`, `linkedin.json`, `instagram.json`, `discord.json` — platform envelopes
- `delivery.json` — written only by `deliver.py`

### Monthly: `monthly/YYYY-MM/`

- `summary.json` — the month's summary, from its daily summaries
- `monthly-cover.json` — the month's cover: its link and prompt
- `contributors.json` — every PR merged into `main` or `master` that month, counted per GitHub account (authors and noreply co-authors, by account id); the website's community section reads it

### Model post: `models/`

- `snapshots/YYYY-MM-DD.json` — the record: the whole `/models?reliability=all` catalog (community models the reliability filter hides included), saved by the 06:00 run on each day it changed. Live health stats are no change. A day is recorded only that day and then kept; a rerun on a later day skips it, and `overwrite` replaces a recorded day. An answer in which a category lost more than half its models is refused, so a half-empty `/models` is never announced as mass retirements; `overwrite` records it once a person has checked. Each Wednesday post compares the latest snapshot on its day with the latest one a week earlier
- `diffs/YYYY-MM-DD.json`, `YYYY-MM-DD/discord.json` — the comparison and the post, saved only after Discord confirms the send; a week without changes saves nothing
- `YYYY-MM-DD/delivery.json` — written only by `deliver.py`
- `models.md` — every model post, newest first

### Community post: `community/`

`diffs/`, `YYYY-MM-DD/discord.json` and `delivery.json` as the model post, for the community models in the same record. Its writer reads catalog facts only (id, category, price and its per-image or per-token unit, modalities, capabilities, paid-only), never owner-written text. Models and agents are two groups; an agent shows its base model instead of a price or access change, which follow that model.

### Deploy posts: `discord/YYYY-MM/delivery.json`

One entry per PR (`pr-<number>`), in the month it merged: its state and the Discord message id. The post and its picture are only in Discord.

### Platform envelope

```json
{
  "platform": "twitter|linkedin|instagram|discord",
  "scope": "daily|weekly",
  "date": "YYYY-MM-DD",
  "period_start": "YYYY-MM-DD",
  "period_end": "YYYY-MM-DD",
  "generated_at": "ISO-8601 timestamp",
  "text": "final publish-ready text",
  "images": [{"url": "https://media.pollinations.ai/…"}],
  "metadata": {"post_type": "post|carousel"}
}
```

### Enter `/news`: `index.json`

`news_index.py` (workflow `news-build-index.yml`, after every `news-posts.yml` run and at 06:30) writes `index.json` from the files above; Enter's `/news` page reads only this file. It keeps the last 30 days (at least 10 highlights):

| Section | Source | Dated |
|---|---|---|
| `models` | The `/models` record: a model added, removed, or its price, Quest/Paid access or capabilities changed between two recorded days. Official models only | the day the record first saw it |
| `models` (retiring) | A `RETIRE` row in a PR description (below), from the dailies' `changelog` | its `Effective` date |
| `api` | The dailies' `changelog` (the docs PR's `api_changes`) | the docs PR's merge day |
| `highlights` | Each daily summary's `highlights` | the day |

Announce a decided retirement with a row in the PR description. Registry comments are never read: a provider's deadline (`// Provider retires this route on …`) is an internal reminder, and most end in a reroute.

```
| Model | Action | Change | Before | After | Effective |
| --- | --- | --- | --- | --- | --- |
| `qwen/qwen3-tts-instruct-flash` | RETIRE | Availability | Available | Retired | 2026-10-09 16:00 UTC |
```

`Effective` takes `YYYY-MM-DD`, an optional `HH:MM` and a timezone (`UTC`, `Z` or `±HH:MM`; none means UTC); `Cancelled` withdraws a date. Rows for models not in the record, past dates or no date are skipped. The latest announcement per model wins and keeps the earlier date as `previous_date`; the removal seen in the record settles it, and a date that passes without a removal is hidden.

---

## Workflows

| Workflow | Trigger | What it does |
|---|---|---|
| `news-posts.yml` | 06:00 daily, 18:00 Sunday, 14:00 Wednesday | posts job: `posts.py write` + `save` + push, one post at a time; deliver job: `deliver.py` (only it holds the Buffer and Discord keys) |
| `news-deploy-posts.yml` | after a successful `Deploy / Cloudflare production` run; by hand with the deploy's `sha` | `deploy_posts.py` |
| `news-build-index.yml` | after `news-posts.yml`, and 06:30 daily | `news_index.py` → `index.json` |

### Manual runs of `news-posts.yml`

| Input | Values |
|---|---|
| `job` | `morning` (what the 06:00 run does on that day), `afternoon` (its Sunday 18:00 run), `wednesday` (the 14:00 model and community posts), `daily`, `weekly`, `monthly`, `models`, `community`, `catalog` (record `/models`) |
| `date` | the day, the Sunday, the month (`YYYY-MM`) or the Wednesday |
| `run` | `preview` (default): writes and saves into a throwaway checkout, shows the diff and keeps the texts and pictures with the run; sends nothing. `all`, `write + save`, `deliver` |
| `overwrite` | write and save a date that is already saved again; `delivery.json` is kept, and a saved model or community post is never replaced |

A preview is the before/after check for any change to a prompt or a script: run it for a date already on `news` and compare. A daily preview reads that day's PRs from GitHub again.

## Scripts

| Script | Purpose |
|---|---|
| `prs.py` | The day's merged PRs from GitHub → one note each (`prompts/pr.md`), with API changes and announced retirements; the daily keeps only those two in its `changelog` |
| `posts.py` | `write JOB DATE` makes the post files' model calls and pictures into a work folder; `save JOB DATE` turns it into today's files in a `news` checkout. Neither commits |
| `deliver.py` | `schedule` (Buffer), `send` (Discord; the model and community posts from their work folder), `mark` (a person settles a stuck send) |
| `deploy_posts.py` | `SHA`: the PRs a production deploy shipped → `prompts/posts/discord-pr.md` → Discord webhook, recorded with `deliver.py`'s record |
| `contributors.py` | The month's merged PRs per GitHub account, for `monthly/<month>/contributors.json` |
| `news_index.py` | `index.json`: model news, API changes and daily highlights for Enter `/news` |
| `common.py` | Shared: prompt loading and brand injection, the model and picture calls, file builders, note helpers |
| `test_news.py` | Tests (`python3 -m unittest operations/social/scripts/test_news.py`) |

---

## Delivery rules

1. **One run at a time.** `news-posts.yml` and `news-deploy-posts.yml` runs queue; none is cancelled.
2. **Writing and delivering are separate jobs.** Rerunning a delivery never writes new posts; a failed post never stops the others' delivery.
3. **Save once.** Each post is one commit to `news`; a saved date (its `summary.json`) is skipped unless `overwrite` is set.
4. **Never twice.** `delivery.json` is written before each send, with the file's sha, so two runs can't both claim a post. Buffer and Discord confirm a send. An unclear result (`attempt`) fails the run until a person checks the channel and runs `deliver.py mark JOB DATE POST done|failed` (for a deploy post, sets its entry to `done` or removes it).
5. **Buffer only gets posts scheduled at today's slots;** nothing is posted right away.
6. **The posts only read the model record:** the 06:00 run saves it, so a failed or repeated post never moves what the next one compares.
7. **Start dates.** `deliver.py` refuses dates before its `START` (daily 2026-10-12, weekly 2026-10-18, models 2026-10-14, community 2026-10-21); `deploy_posts.py` skips PRs merged before the PR that introduced it (#17666), which were posted when they merged. Older posts went out with the previous senders.
8. **A deploy post is written and pictured before it is claimed,** so a failed model or picture call leaves nothing behind: rerunning the run tries that PR again, and the PRs already posted are skipped.

## Error handling

- **No automatic retries.** Model, picture, GitHub and Discord calls are tried once; a failure (an empty model answer included) turns the run red and a person reruns it with the repair skill (`.claude/skills/news-pipeline/SKILL.md`). The one exception is the push to `news`, which fetches, rebases and pushes again up to three times because other writers land on `news` every few minutes.
- **A note fails loud.** If the search, the Dev project, a PR's files, the API change lookup or the note's summary fails, the daily stops before anything is saved.
- **Scheduled posts:** a post whose reply misses a required field, or whose picture fails, stops before anything is saved. Each job's failure opens its own issue ("Workflow failing: News / Posts — writing" or "— delivery"), so a delivery failure can't hide a writing failure.
- **Deploy posts:** every shipped PR is tried; the run fails if one failed or is stuck, and opens "Workflow failing: News / Deploy posts".

## Concurrency

- **`news` moves often:** the posts job fetches, rebases and pushes again, up to three times. Its paths never overlap another writer's.
- **The day is read once:** the daily reads its PRs at 06:00 the next day, so every PR merged that day (UTC) is read. Rewriting a day (`overwrite`) reads GitHub again; the full list of merged PRs stays on GitHub.

---

## Key Design Decisions

1. **The daily reads GitHub, everything else reads the daily.** The weekly and monthly read its summaries, Enter `/news` its highlights and `changelog`.
2. **The diff decides.** Notes are written from the diff; titles and descriptions only add what the diff supports.
3. **Notes hold facts; summaries and posts hold presentation** — notes are read once and not kept; headlines and platform wording are written from them.
4. **`publish_tier` gates what reaches the daily and weekly posts** — non-user-facing PRs stay out.
5. **Model news comes from the live catalog.** The `/models` record dates a change when it is seen in production, not when its PR merged.
6. **A PR is announced on Discord when it ships,** after the production deploy, not at merge.
7. **One prompt file per post** — brand → tone → the post file. Each post is a fixed prompt and one model call; no agent, so content stays predictable.
8. **No content for quiet days** — no `daily`-tier notes, no posts.

---

## Pictures

| Family | Written by | Count | Used by |
|---|---|---|---|
| Per-PR | `deploy_posts.py` | 1 per shipped PR | its Discord post |
| Daily | `posts.py` | 1 (X) | the daily post |
| Weekly | `posts.py` | 6 (X, LinkedIn, 3 Instagram, Discord) | the weekly posts |
| Monthly cover | `posts.py` | 1 | the monthly page |

Every picture uses `nanobanana-2-lite` with the character reference `prompts/brand/characters-ref.jpg` (one Polli, one monitor robot, one Nomnom) and the shared style text in `common.IMAGE_STYLE_SUFFIX`, which also says each character appears at most once. The model and community posts have no picture.

No picture file is committed. Each post keeps its picture's `url`: the `media.pollinations.ai` copy the image API returns in its `Link` header, kept 30 days (refreshed by reads after day 15), long enough to be posted. Once posted, the picture lives on the platform it went to: Discord, X, LinkedIn or Instagram.

## Cost (a day with 5 merged PRs, all deployed)

| Step | AI calls | Pictures |
|---|---|---|
| PR notes (5×) | 5 | — |
| Daily summary + X | 2 | 1 |
| Deploy posts (5×) | 5 | 5 |
| **Total** | **12** | **6** |

Sunday adds 5 calls and 6 pictures, the 1st 2 calls and 1 picture, Wednesday 2 calls.

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
  pr.md                     each merged PR: its note
  posts/                    one file per post: settings between --- lines, then the task
    discord-pr.md  daily-summary.md  daily-x.md
    weekly-summary.md  weekly-x.md  weekly-linkedin.md  weekly-instagram.md  weekly-discord.md
    monthly-summary.md  monthly-cover.md  model-post.md  community-post.md
```

A post file's settings say its `job`, its `tone` (the system prompt; a summary has none and is its own system prompt), its `temperature`, the `file` it is saved as, its `pictures` and the fields its reply must have. A platform post's task is its text with the summary's recap filled in; the deploy post's task is its text with the PR filled in.
