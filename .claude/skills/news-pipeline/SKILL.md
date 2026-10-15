---
name: news-pipeline
description: "Rerun or repair the Pollinations news pipeline by hand: a missing or wrong daily, weekly, monthly, model or community post, a missing PR gist, a stuck Buffer or Discord send, or an item missing from Enter's News page or the README."
---

# News Pipeline Repairs

How it works: `operations/social/PIPELINE.md`. Everything generated lives on the `news` branch under `operations/social/news/`.

## Rules

- **Preview first.** A manual `news-posts.yml` run defaults to `run: preview`: it writes into a throwaway checkout, prints the diff and keeps the texts and pictures with the run (artifact `preview`); it sends and saves nothing. Compare with what is on `news`, then run it live.
- **Never send twice.** Read the date's `delivery.json` before delivering again. Never edit it by hand: settle a post with `deliver.py mark`.
- **Ask before anything people see:** a live run (`run: all` or `deliver`), a gist regeneration (it rewrites the saved Discord post) and `mark` each need the user's go.

## Find what happened

- Runs: `gh run list --workflow news-posts.yml` (or `news-create-pr-gist.yml`, `news-deploy-posts.yml`, `news-build-index.yml`, `news-sync-readme.yml`); `gh run view <id> --log`.
- Nothing retries by itself: a failed model, picture, GitHub or Discord call turns the run red. Rerun it, except after an **empty model answer**: our API keeps each answer under its exact request, so the same run asks the same thing and gets the same empty answer back. Write that post by hand (or rerun once its input changes).
- Failure issues: "Workflow failing: News / Posts — writing", "… — delivery", "… News / Create PR gist". Read every failed run: more than one post can fail in the same run.
- Files: `https://raw.githubusercontent.com/pollinations/pollinations/news/operations/social/news/<daily|weekly|monthly|models|community>/<date>/` — `summary.json`, the post files, `images/`, `delivery.json`.
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

`deliver.py` refuses dates before its `START`; those went out with the previous senders. Download a preview's texts and pictures with `gh run download <id> -n preview`.

## Settle a stuck send (`attempt`)

1. Look everywhere it could be: in Buffer both the Queue and the Sent tab (a post whose answer was lost may already be published), and the destination itself (X, LinkedIn, Instagram, the Discord channel).
2. Found it: `GITHUB_TOKEN=$(gh auth token) python operations/social/scripts/deliver.py mark weekly 2026-10-18 linkedin.json done`. Certainly not sent anywhere: `… failed`, then deliver again. Still unsure: leave it at `attempt`. A Discord post that went out in part can only be marked `done` after the rest is posted by hand.

## Recover a model or community post

Each is written, sent to Discord and saved in one run; the run saves only if its text is the one recorded as sent. After settling its send, or when the send worked but the save failed, re-run **the original run's failed job** (`gh run rerun <id> --failed`): it keeps that run's `posts` artifact, so the same texts are saved, and a post already sent is not sent again. A new run writes a new text, which the record rejects. Neither post saves snapshots: the 06:00 `catalog` run records `/models`, and a day missed is not recorded later: `/models` can only be captured as it is now.

## A missing or wrong gist

- `gh workflow run news-create-pr-gist.yml -f pr_number=N` regenerates the gist and its picture and rewrites the saved Discord post: ask first. Which step of a failed run went red decides the repair:
  - **Generate PR gist** (classification, model or API changes, analysis, picture): nothing was saved, so rerunning is safe.
  - **Save the Discord post**: the gist is saved; `pr-posts/PR-N.json` may exist already. A record whose `delivery.state` is `done` is never rewritten, so a rerun is safe; otherwise rerunning rewrites the saved message (nothing has been sent yet, so no duplicate reaches Discord).
- To fix only the gist's facts (classification, model or API changes), edit `gists/<merge date>/PR-N.json` on `news` by hand, keeping its shape.
- Then `gh workflow run news-build-index.yml`. A daily already written from the old gist keeps its text unless rewritten with `overwrite=true` (preview first).

## A per-PR Discord post: not sent, sent twice, stuck

The post is saved at merge time and sent when its production deploy gate passes (`news-deploy-posts.yml`, after each deploy workflow and every 30 minutes). Its record is `pr-posts/PR-N.json` on `news`; the gate's cursor is `deploy-posts/state.json`.

- **Not sent long after merge:** read the latest `news-deploy-posts.yml` run. The gate holds a post back when a deploy workflow for the production commit is still running or failed, or the 15-minute discovery barrier hasn't passed. A failed deploy is not a pipeline bug: the post goes out with the next commit whose gate passes.
- **`delivery.state: attempt`:** the send's result is unknown. Look in the Discord channel first. Found it: `GITHUB_TOKEN=$(gh auth token) python operations/social/scripts/deploy_posts.py mark PR-N done`. Certainly not sent: `… failed`, and the next run retries. Still unsure: leave it at `attempt` (the run stays red on purpose). A record with a Discord message id can only be marked `done`.
- **Duplicate in the channel:** settle the record `done` so nothing more is sent, then report it: the claim-before-send write is the one guard against this.

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
