---
name: news-pipeline
description: "Rerun or repair the Pollinations news pipeline by hand: a missing or wrong daily, weekly, monthly or model post, a missing PR gist, a stuck Buffer, Discord or Reddit send, or an item missing from Enter's News page or the README."
---

# News Pipeline Repairs

How it works: `operations/social/PIPELINE.md`. Everything generated lives on the `news` branch under `operations/social/news/`.

## Rules

- **Preview first.** A manual `news-posts.yml` run defaults to `run: preview`: it writes into a throwaway checkout, prints the diff and keeps the texts and pictures with the run (artifact `preview`); it sends and saves nothing. Compare with what is on `news`, then run it live.
- **Never send twice.** Read the date's `delivery.json` before delivering again. Never edit it by hand: settle a post with `deliver.py mark`.
- **Ask before anything people see:** a live run (`run: all` or `deliver`), a gist regeneration (it posts Discord again) and `mark` each need the user's go.

## Find what happened

- Runs: `gh run list --workflow news-posts.yml` (or `news-create-pr-gist.yml`, `news-build-index.yml`, `news-sync-readme.yml`); `gh run view <id> --log`.
- Failure issues: "Workflow failing: News / Posts — writing", "… — delivery", "… News / Create PR gist". Reddit has failed every day since July 2026, so the delivery run is red at 15:00 / Sunday 18:00 for that alone.
- Files: `https://raw.githubusercontent.com/pollinations/pollinations/news/operations/social/news/<daily|weekly|monthly|models>/<date>/` — `summary.json`, the post files, `images/`, `delivery.json`.
- `delivery.json` states: `done` (sent, never again), `failed` (nothing sent; the next delivery retries), `attempt` (unknown: the run stays red until a person decides), `started` (Reddit: handed to the server, never retried).

## Rerun posts

```bash
gh workflow run news-posts.yml -f job=daily -f date=2026-10-12 -f run=preview
```

| Need | Inputs |
|---|---|
| What a 06:00 run does on day T (T−1's daily, Sunday's week, the 1st's month, their Buffer posts) | `job=morning date=T` |
| What a 15:00 / Sunday 18:00 run does on day T (Reddit, the week's Discord) | `job=afternoon date=T` |
| One post | `job=daily date=DAY`, `job=weekly date=SUNDAY`, `job=monthly date=YYYY-MM`, `job=models date=WEDNESDAY` |
| Write and save only | `run="write + save"` |
| Deliver only | `run=deliver` (not for `models`: the model post is written, sent and saved in one run) |
| Rewrite a saved date | add `overwrite=true`; its `delivery.json` is kept, so posts already `done` are not sent again, and a saved model post is never replaced |

`deliver.py` refuses dates before its `START`; those went out with the previous senders. Download a preview's texts and pictures with `gh run download <id> -n preview`.

## Settle a stuck send (`attempt`)

1. Look in the channel itself: Buffer's queue, the Discord channel, Reddit.
2. Found it: `GITHUB_TOKEN=$(gh auth token) python operations/social/scripts/deliver.py mark weekly 2026-10-18 linkedin.json done`. Not there: `… failed`, then deliver again. A Discord post that went out in part can only be marked `done` after the rest is posted by hand.

## A missing or wrong gist

- `gh workflow run news-create-pr-gist.yml -f pr_number=N` regenerates the gist and its picture and posts Discord **again**: ask first.
- To fix only the gist's facts (classification, model or API changes), edit `gists/<merge date>/PR-N.json` on `news` by hand, keeping its shape.
- Then `gh workflow run news-build-index.yml`. A daily already written from the old gist keeps its text unless rewritten with `overwrite=true` (preview first).

## Missing from Enter's News page or the README

Check in order:
1. The PR has a gist: `gists/<merge date>/PR-N.json`.
2. **Changelog, models:** the gist's `announcements` (official models only, from the registry diff). A scheduled retirement needs a `RETIRE` row with an `Effective` date in the PR description.
3. **Changelog, API:** only the post-deploy docs PR that regenerates `APIDOCS.md` records API changes.
4. **Updates:** a daily highlight with `kind: product`. `model` and `api` belong to the Changelog, `app` to the README; a gist with `publish_tier: discord_only` never reaches a daily.
5. **Window:** `index.json` keeps the last 30 days (at least 10 highlights). It is rebuilt after every gist and `news-posts.yml` run and at 06:30; raw GitHub files are cached for about 5 minutes.
6. **README:** `news-sync-readme.yml` opens a pull request at 07:00 with the 10 newest highlights; it shows only after that PR merges.

## Check locally

```bash
python3 -m unittest operations/social/scripts/test_news.py
```
