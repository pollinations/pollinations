---
name: community-leaderboard
description: Preview, rerun, or redesign the daily community-model leaderboard images posted to Discord. Use when asked to build, regenerate, redesign, or post the community model leaderboard, or when extending its design (e.g. new stat panels, palette changes).
allowed-tools: Bash
---

# Community model leaderboards

Two pixel-art boards posted daily at 12:00 UTC to #dev-community-models by
the GitHub Action `Monitor / community leaderboards`
(`.github/workflows/monitor-community-leaderboards.yml`): the text board
ranks community text models by tokens served in the last 24h, with a speed
panel and per-model success badges; the image board ranks community image
models by images generated. Only public community models appear: rows are
checked against gen's public catalog, so private models never show.

| File | Role |
|------|------|
| `operations/infra-watch/leaderboard/text-board.js` | Text board HTML and post text |
| `operations/infra-watch/leaderboard/image-board.js` | Image board HTML and post text |
| `operations/infra-watch/leaderboard/post.mjs` | Reads the pipes, screenshots each board, posts both |
| `operations/infra-watch/leaderboard/boards.test.js` | Board tests, run by `npm test` in `operations/infra-watch` |
| `operations/infra-watch/leaderboard/fonts-embedded.css` | Embedded fonts (see Brand system) |
| `enter.pollinations.ai/observability/endpoints/infra_watch_text_leaderboard.pipe` | Text board rows (last 24h) |
| `enter.pollinations.ai/observability/endpoints/infra_watch_image_leaderboard.pipe` | Image board rows (last 24h) |

## Previewing and rerunning

Preview without posting, from `operations/infra-watch` (the SOPS file holds
the Tinybird read token and the webhook):

```bash
CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  sops exec-env secrets.vars.json 'node leaderboard/post.mjs --dry-run /tmp/boards'
```

It writes each board's PNG and the post text (`message.md`) to `/tmp/boards`.
Add `text` or `image` to build one board only.

Posting for real goes through the workflow and needs a maintainer's OK, since
it posts to Discord:

```bash
gh workflow run monitor-community-leaderboards.yml -f boards=text
```

The workflow runs the script from the `production` branch, so a board change
shows in the post only after it is promoted.

## Design decisions (read before changing anything)

These came out of several rounds of live feedback — don't relitigate them
without a reason:

- **Ranked by tokens served, not request count.** Request count rewards
  chatty small-completion models over models doing real work. A model with
  4× the requests but 1/3 the tokens should NOT outrank the token leader —
  this was the single most important correction during design.
- **Tokens are the headline number**, both as a hero counter at the top
  (`57,468,899 TOKENS · 24H`) and as the leading column on every row —
  deliberately placed *before* the model name, not after, so the eye reads
  magnitude first.
- **Stability is a per-row badge, not its own leaderboard.** An early
  version had a separate "most stable" panel; killed because most models sit
  at or near 100% and ties make the ranking meaningless. Now it's a status
  indicator only: a lime `PERFECT` badge at exactly 100%, pixel hearts (♥♥♥
  ≥99%, ♥♥ ≥95%, ♥ ≥80%) below that, a skull below 80%. The PERFECT badge
  matters — celebrate the models that never failed, don't just lump them
  into a heart tier.
- **Speed gets its own small panel below the main board** (median
  tokens/sec, not mean — outliers from cold starts/timeouts skew the mean
  badly), not mixed into the main ranking. Top 3 by speed, gold card for
  #1.
- **Minimal text, maximal graphic.** No paragraph explaining the board —
  headline number, column headers, bars. If you're tempted to add
  explanatory prose, add a stat instead.
- **No avatars/rank badges in the main leaderboard board** (kept for the
  companion "Arena" scatter concept, not the primary board) — a crown on
  the #1 row is enough ceremony.

## Brand system

- **Fonts**: Press Start 2P (headings/scores, pixel/arcade feel) + IBM Plex
  Mono (body/labels). Both embedded as base64 data-URI `@font-face` in
  `fonts-embedded.css` — **required**, not optional. The board renders from
  a local HTML string with scripts off, so it must not depend on reaching
  Google Fonts; without embedding, text silently falls back to a generic
  mono and looks broken. If you ever see a render with non-blocky headings,
  check the font embed first.
  - Regenerating `fonts-embedded.css` if a font ever needs to change: fetch
    the woff2 from `https://fonts.googleapis.com/css2?family=<name>` (a
    normal browser UA is required — the default curl UA gets served an old
    ttf format), base64-encode each `src: url(...)` and inline it as a data
    URI in a `@font-face` block. Keep it to the Latin subset only — full
    Unicode coverage bloats the file for zero benefit on an English-only
    board.
- **Palette** (validated against the `dataviz` skill's accessibility
  checks): cream `#F3EBDE` background, ink `#110518` text/borders, hard
  offset box-shadows (`6px 6px 0 #110518`, zero border-radius — the house
  pixel/arcade look). Chart-legal categorical hues derived from brand colors
  via same-hue OKLCH adjustment (not the raw brand pastels, which fail
  contrast/CVD checks): periwinkle `#5978df` (speed bars), lavender
  `#8338b3`, mint/status-stable `#3b9736`, status-watch `#b8860b`,
  status-degraded `#b03a2e`.
- **Layout**: fixed 1200px width (Discord embed width), height from content
  (10 rows + speed panel); the screenshot is full-page, so nothing needs
  cropping.

## Rendering

`post.mjs` drives Chrome through `puppeteer-core`, which bundles no browser:
GitHub's Ubuntu runners have Chrome at `/usr/bin/google-chrome`, and
`CHROME_PATH` points elsewhere. It loads the board at 1200px wide with
JavaScript off, waits for `document.fonts.ready`, and takes a full-page PNG.
`--no-sandbox` is needed because Ubuntu 24.04 runners block Chrome's
user-namespace sandbox; the page is our own HTML with scripts off.

## Posting

One webhook message (`COMMUNITY_WEBHOOK_URL`, the "Community Model Watch"
webhook) carries each board's post text and both PNGs as attachments, and
pings no one. The post text is each builder's `markdown`, posted verbatim:
don't re-derive or paraphrase it; the awards it calls out (workhorse by
request count, flawless-100% count, speed crown) are deliberately chosen to
surface stats the image itself doesn't show.

A board with no model busy enough is skipped. A board that fails is left out
and fails the run once the others are posted; rerun it with
`-f boards=<name>`.

## Companion design: "The Arena"

A second visualization (speed × success × price, avatar markers sized
uniformly, price tag per model) was explored alongside the main leaderboard
and posted once as a one-off — its HTML/build script live only in session
scratchpads, not in `operations/infra-watch/leaderboard/`. If asked to make
it a recurring post too, port `design-arena-v2.html`'s structure (GitHub
avatar thumbnails via `https://github.com/<user>.png?size=96`, pixelated via
nearest-neighbor resize, log-scaled x-axis, piecewise y-axis for the
95–100% success cluster, a simple pairwise-repulsion layout pass so
same-size markers don't overlap) and post it through `post.mjs` like the
two boards.
