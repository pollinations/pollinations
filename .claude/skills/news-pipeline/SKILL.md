---
name: news-pipeline
description: "Rerun or repair the Pollinations news pipeline by hand: a missing or wrong daily, weekly, monthly, model or community post, a wrong PR summary, a missing per-PR Discord post after a deploy, a stuck Buffer or Discord send, or an item missing from Enter's News page."
---

# News Pipeline Repairs

How it works: `operations/social/PIPELINE.md`. Everything generated lives on the `news` branch under `operations/social/news/`.

## Rules

- **Preview first.** A manual `news-posts.yml` run defaults to `run: preview`: it writes into a throwaway checkout, prints the diff and keeps the texts and pictures with the run (artifact `preview`); it sends and saves nothing. Compare with what is on `news`, then run it live.
- **Never send twice.** Read the `delivery.json` before delivering again. Settle any post, deploy posts included, with `deliver.py mark` (below).
- **Ask before anything people see:** a live run (`run: all` or `deliver`), a deploy-posts run, `mark` and any edit of a `delivery.json` each need the user's go.

## Find what happened

- Runs: `gh run list --workflow news-posts.yml` (or `news-deploy-posts.yml`, `news-build-index.yml`); `gh run view <id> --log`.
- Nothing retries by itself: a failed model, picture, GitHub or Discord call turns the run red. Rerun it, except after an **empty model answer**: our API keeps each answer under its exact request, so the same run asks the same thing and gets the same empty answer back. Write that post by hand (or rerun once its input changes).
- Failure issues: "Workflow failing: News / Posts — writing", "… — delivery", "… News / Deploy posts". Read every failed run: more than one post can fail in the same run.
- Files: `https://raw.githubusercontent.com/pollinations/pollinations/news/operations/social/news/`, in two halves. `data/`: `summaries/<daily|weekly|monthly>/<date>.json`, the `/models` record `models/<date>.json`, `contributors/<month>.json` and `index.json`. `posts/<platform>/<job>/`: one `<date>.json` per post and the folder's `delivery.json`. Deploy posts: `posts/discord/prs/held.json` and `posts/discord/prs/<YYYY-MM>/delivery.json`.
- Pictures are links, not files: `url` on `media.pollinations.ai`, kept 30 days. Once posted, the picture lives on the platform it went to.
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

A day is saved once its summary in `data/summaries/daily/` is; a daily rerun with `overwrite=true` reads that day's PRs from GitHub again. `deliver.py` refuses dates before its `START`; those went out with the previous senders. Download a preview's texts and pictures with `gh run download <id> -n preview`.

## A PR missing or wrong in a daily

- The daily reads every PR merged into `main` or `master` on its day (UTC) and writes about the ones its notes rate `daily`; the notes are not saved. Its summary lists the PRs it covers.
- To rewrite a day, rerun the daily with `overwrite=true` (preview first). The weekly and monthly read the daily summaries, so rerun them after with `overwrite=true` too if they are already written.
- To fix only what Enter shows (an API change, a retirement), edit that day's `changelog` in `data/summaries/daily/<day>.json` on `news` by hand, keeping its shape, then `gh workflow run news-build-index.yml`.

## A missing deploy post

Production pushes discover new main PRs, and every run discovers new master PRs; every completed Cloudflare, website, Applications, E2B, Portkey and legacy cache run checks them again. `posts/discord/prs/held.json` keeps the production and master scan cursors and pending PRs with their remaining deployment jobs. A master PR waits for the hand-run `deploy-legacy-caches.yml` job of each cache Worker it changes, started after its merge. Each PR waits until every affected service/app has a successful deployment job containing its merge commit; another job failing in the same run doesn't hold it back. A PR with no deployment target can post at promotion. There is no age cutoff.

Successful target checks are saved so they do not expire with Actions history. The workflow reads its path rules from the scanned production revision's deployment workflows and reuses application discovery. Every PR merged into `main` or `master` gets one post; production promotions get none. Delivery entries are `pr-<number>` in `posts/discord/prs/<merge month>/delivery.json`.

- Preview readiness first: `gh workflow run news-deploy-posts.yml -f preview=true` (the manual default). It reads live GitHub state but never saves or sends.
- A red run: rerun it (`gh run rerun <id>`) or `gh workflow run news-deploy-posts.yml -f preview=false`. PRs already `done` are skipped.
- `attempt`: look in the Discord channel. Found it: `GITHUB_TOKEN=$(gh auth token) python operations/social/scripts/deliver.py mark prs <merge month> <PR> done`. Certainly not there: `… failed`, then rerun.
- No post at all: check `posts/discord/prs/held.json` and the required deployment jobs, then the delivery record. PRs merged before #17666 were posted at merge. Never advance the scan cursor or delete a held PR to clear a failure.

## Settle a stuck send (`attempt`)

1. Look everywhere it could be: in Buffer both the Queue and the Sent tab (a post whose answer was lost may already be published), and the destination itself (X, LinkedIn, Instagram, the Discord channel).
2. Found it: `GITHUB_TOKEN=$(gh auth token) python operations/social/scripts/deliver.py mark weekly 2026-10-18 linkedin done`. Certainly not sent anywhere: `… failed`, then deliver again. Still unsure: leave it at `attempt`. A Discord post that went out in part can only be marked `done` after the rest is posted by hand.

## Recover a model or community post

Each is written, sent to Discord and saved in one run; the run saves only if its text is the one recorded as sent. After settling its send, or when the send worked but the save failed, re-run **the original run's failed job** (`gh run rerun <id> --failed`): it keeps that run's `posts` artifact, so the same texts are saved, and a post already sent is not sent again. A new run writes a new text, which the record rejects. Neither post saves snapshots: the 06:00 `catalog` run records `/models`, and a day missed is not recorded later: `/models` can only be captured as it is now.

## Missing from Enter's News page

Check in order:
1. **Changelog, models:** the `/models` record (`data/models/`) shows the change between two recorded days; it is dated the day before the morning record that first shows it (the day it went live). A scheduled retirement needs a `RETIRE` row with an `Effective` date in the PR description; the daily of its merge day keeps it in its `changelog`.
2. **Changelog, API:** only the post-deploy docs PR that regenerates `APIDOCS.md` records API changes, kept in the `changelog` of its merge day's daily.
3. **Updates:** a daily item with `kind: product`. `model` and `api` belong to the Changelog; a PR its note rates other than `daily` never reaches a daily.
4. **Window:** `index.json` keeps the last 30 days (at least 10 daily items). It is rebuilt after every `news-posts.yml` run and at 06:30; raw GitHub files are cached for about 5 minutes.
5. **README:** the 07:00 README pull request (`repo-update-readme.yml`) lists the 10 newest daily items except apps; they show once that PR merges.

## Check locally

```bash
python3 -m unittest operations/social/scripts/test_news.py
```
