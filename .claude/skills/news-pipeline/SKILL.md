---
name: news-pipeline
description: "Rerun or repair the Pollinations news pipeline by hand: a missing or wrong daily, weekly, monthly, model or community post, a wrong PR note, a missing per-PR Discord post after a deploy, a stuck Buffer or Discord send, or an item missing from Enter's News page."
---

# News Pipeline Repairs

How it works: `operations/social/PIPELINE.md`. Everything generated lives on the `news` branch under `operations/social/news/`.

## Rules

- **Preview first.** A manual `news-posts.yml` run defaults to `run: preview`: it writes into a throwaway checkout, prints the diff and keeps the texts and pictures with the run (artifact `preview`); it sends and saves nothing. Compare with what is on `news`, then run it live.
- **Never send twice.** Read the `delivery.json` before delivering again. Settle a scheduled post with `deliver.py mark`; a deploy post's entry is edited by hand (below).
- **Ask before anything people see:** a live run (`run: all` or `deliver`), a deploy-posts run, `mark` and any edit of a `delivery.json` each need the user's go.

## Find what happened

- Runs: `gh run list --workflow news-posts.yml` (or `news-deploy-posts.yml`, `news-build-index.yml`); `gh run view <id> --log`.
- Nothing retries by itself: a failed model, picture, GitHub or Discord call turns the run red. Rerun it, except after an **empty model answer**: our API keeps each answer under its exact request, so the same run asks the same thing and gets the same empty answer back. Write that post by hand (or rerun once its input changes).
- Failure issues: "Workflow failing: News / Posts — writing", "… — delivery", "… News / Deploy posts". Read every failed run: more than one post can fail in the same run.
- Files: `https://raw.githubusercontent.com/pollinations/pollinations/news/operations/social/news/<daily|weekly|monthly|models|community>/<date>/` — `prs.json` (daily), `summary.json`, the post files, `delivery.json`. Deploy posts: `discord/<YYYY-MM>/delivery.json`.
- Pictures are links, not files: `url` (on `media.pollinations.ai`, kept 30 days) and `recipe` (the keyless request that makes it again).
- `delivery.json` states: `done` (sent, never again), `failed` (nothing sent; the next delivery retries), `attempt` (unknown: the run stays red until a person decides).

## Rerun posts

```bash
gh workflow run news-posts.yml -f job=daily -f date=2026-10-12 -f run=preview
```

| Need | Inputs |
|---|---|
| What a 06:00 run does on day T (T−1's daily, Sunday's week, the 1st's month, their Buffer posts) | `job=morning date=T` |
| What the Sunday 18:00 run does (the week's Discord post) | `job=afternoon date=SUNDAY` |
| What the Wednesday 14:00 run does (the model post, then the community post) | `job=wednesday date=WEDNESDAY` |
| One post | `job=daily date=DAY`, `job=weekly date=SUNDAY`, `job=monthly date=YYYY-MM`, `job=models date=WEDNESDAY`, `job=community date=WEDNESDAY`, `job=catalog date=TODAY` (record `/models` now; another day or a recorded day needs `overwrite=true`) |
| Write and save only | `run="write + save"` (for `models` and `community` this only writes: nothing is saved before Discord has the post) |
| Deliver only | `run=deliver`. With `job=daily` or `weekly` it schedules Buffer only; the week's Discord post goes with `job=afternoon`. Not for `models` or `community` (below) |
| Rewrite a saved date | add `overwrite=true`; its `delivery.json` is kept, so posts already `done` are not sent again, and a saved model or community post is never replaced |

A day is saved once its `prs.json` is; a daily rerun with `overwrite=true` reads that day's PRs from GitHub again and writes new notes. `deliver.py` refuses dates before its `START`; those went out with the previous senders. Download a preview's texts and pictures with `gh run download <id> -n preview`.

## A wrong or missing PR note

- Every PR merged into `main` or `master` on a day (UTC) has a note in `daily/<merge day>/prs.json`, whatever its `publish_tier`. Only `daily` notes reach the daily and weekly posts.
- To rewrite the day's notes and posts, rerun the daily with `overwrite=true` (preview first). The weekly reads the saved notes, so rerun the week after with `overwrite=true` too if it is already written.
- To fix one note's facts only (its tier, Area, a retirement), edit it in `prs.json` on `news` by hand, keeping its shape, then `gh workflow run news-build-index.yml`. Posts already written keep their text.

## A missing deploy post

Each successful `Deploy / Cloudflare production` run posts the PRs merged into `main` since the previous successful deploy, recorded as `pr-<number>` in `discord/<merge month>/delivery.json`.

- A red run: rerun it (`gh run rerun <id>`) or `gh workflow run news-deploy-posts.yml -f sha=<production commit>`. PRs already `done` are skipped.
- `attempt`: look in the Discord channel. Found it: set the entry's `state` to `done`. Not there: remove the entry, then rerun.
- No post at all: a PR merged before `deploy_posts.py`'s `START` was posted at merge; a `master` PR, or a promotion that touched no deployed path (so no deploy ran yet), gets no post until a deploy ships it.

## Settle a stuck send (`attempt`)

1. Look everywhere it could be: in Buffer both the Queue and the Sent tab (a post whose answer was lost may already be published), and the destination itself (X, LinkedIn, Instagram, the Discord channel).
2. Found it: `GITHUB_TOKEN=$(gh auth token) python operations/social/scripts/deliver.py mark weekly 2026-10-18 linkedin.json done`. Certainly not sent anywhere: `… failed`, then deliver again. Still unsure: leave it at `attempt`. A Discord post that went out in part can only be marked `done` after the rest is posted by hand.

## Recover a model or community post

Each is written, sent to Discord and saved in one run; the run saves only if its text is the one recorded as sent. After settling its send, or when the send worked but the save failed, re-run **the original run's failed job** (`gh run rerun <id> --failed`): it keeps that run's `posts` artifact, so the same texts are saved, and a post already sent is not sent again. A new run writes a new text, which the record rejects. Neither post saves snapshots: the 06:00 `catalog` run records `/models`, and a day missed is not recorded later: `/models` can only be captured as it is now.

## Missing from Enter's News page

Check in order:
1. **Changelog, models:** the `/models` record (`models/snapshots/`) shows the change between two recorded days; it is dated the day the record first saw it. A scheduled retirement needs a `RETIRE` row with an `Effective` date in the PR description, read into that PR's note as `announcements`.
2. **Changelog, API:** only the post-deploy docs PR that regenerates `APIDOCS.md` records API changes (its note's `api_changes`).
3. **Updates:** a daily highlight with `kind: product`. `model` and `api` belong to the Changelog; a note with `publish_tier` other than `daily` never reaches a daily.
4. **Window:** `index.json` keeps the last 30 days (at least 10 highlights). It is rebuilt after every `news-posts.yml` run and at 06:30; raw GitHub files are cached for about 5 minutes.

## Check locally

```bash
python3 -m unittest operations/social/scripts/test_news.py
```
