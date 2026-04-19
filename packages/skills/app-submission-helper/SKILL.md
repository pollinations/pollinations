---
name: app-submission-helper
description: Help a user submit their app to the Pollinations showcase (apps/APPS.md). Prepares a well-formed TIER-APP issue following the two-phase review flow, checks prerequisites (enter.pollinations.ai account, API usage), picks the right category/platform, and drafts the ~80-char description. Use when the user says they built something with pollinations.ai and wants it listed, featured, or added to the showcase.
allowed-tools: Bash(gh *), Bash(curl *), Read, Write
---

# app-submission-helper

Turn "I built something with pollinations.ai" into a merge-ready submission. This skill is the **contributor-facing** counterpart to the internal `app-review` skill — it helps people *submitting* apps, not the team reviewing them.

## When to use

- User says they built an app / bot / site / library using pollinations.ai and wants it on the showcase
- User asks "how do I get my app listed on pollinations", "add to APPS.md", "submit to the showcase"
- Agent is acting on behalf of a contributor preparing a submission

## How submissions flow (so you can set expectations)

Source of truth: [AGENTS.md](../../../AGENTS.md) and [apps/APPS.md](../../../apps/APPS.md).

1. Contributor opens a GitHub issue using the **SubmitApp** template → gets label `TIER-APP`.
2. `app-review-submission.yml` workflow validates the submission, generates an AI preview, and posts `APP_REVIEW_DATA` JSON as a comment. Labels flip to `TIER-APP-REVIEW`.
3. A maintainer adds `TIER-APP-APPROVED`. Workflow prepends a row to [apps/APPS.md](../../../apps/APPS.md), opens an auto-merging PR, and closes the issue via `Fixes #NNN`.
4. If something's wrong: `TIER-APP-REJECTED` (duplicate / spam) or `TIER-APP-INCOMPLETE` (no enter.pollinations.ai account).

The contributor's only job is **getting step 1 right** — everything after is automated.

## Prerequisites to confirm before opening the issue

- [ ] User has an account at **https://enter.pollinations.ai** (sign up with GitHub). Without this → auto-labelled `TIER-APP-INCOMPLETE`.
- [ ] The GitHub account submitting the issue is the **same one** used at enter.pollinations.ai. The issue author becomes the `App Author` credit.
- [ ] The app actually calls `gen.pollinations.ai` (or a documented subdomain). Ask for a code snippet or network tab screenshot if unsure — "my app uses AI" isn't enough.
- [ ] Not already listed. Search [apps/APPS.md](../../../apps/APPS.md) by app name and by GitHub handle.

## Fields the issue template asks for

(From [.github/ISSUE_TEMPLATE/tier-app-submission.yml](../../../.github/ISSUE_TEMPLATE/tier-app-submission.yml). Gather these before opening the issue.)

| Field | Notes |
|---|---|
| App Name | 1–4 words, distinctive |
| App Description | 2–4 sentences about what it does + how it uses pollinations. The workflow condenses this to ~80 chars for APPS.md |
| App URL | Public link. If no URL, pick `api` / `library` / `cli` platform instead |
| Category | one of: `image`, `video_audio`, `writing`, `chat`, `games`, `learn`, `bots`, `build`, `business` |
| Platform | auto-detected; can be multi. `web` (default with URL), `android`, `ios`, `windows`, `macos`, `desktop`, `cli`, `discord`, `telegram`, `whatsapp`, `library`, `browser-ext`, `roblox`, `wordpress`, `api` (default without URL) |
| GitHub repo | optional but strongly recommended |
| Discord handle | optional — used so the team can ping back |

## Category cheat sheet

- **image** — anything whose primary output is a generated image (galleries, prompt playgrounds, avatar gens)
- **video_audio** — video or audio generation, TTS, music, voice clones
- **writing** — long-form text tools, story/essay generators, writing assistants
- **chat** — chatbots with a conversational UI (if it's a Discord/Telegram bot, use `bots` platform instead)
- **games** — interactive/gameplay
- **learn** — education, study tools, tutoring
- **bots** — automation that runs as a bot on a platform (Discord/Telegram/WhatsApp)
- **build** — developer tooling, SDKs, ComfyUI nodes, integrations
- **business** — B2B / productivity / workflow

## Writing the description

The workflow trims user input to ~80 chars for the APPS.md row. Make the first sentence of the issue description *already* ~80 chars and self-contained so the AI condensation has less room to drift. Bad ("Describe what your app does and how it integrates with pollinations.ai...") → Good:

> **"Akhbaar turns daily tech reports into structured insights by converting daily PDFs into structured JSON."**

Rules:
- Name the app in the first clause.
- Verb-led: what it *does*, not what it *is*.
- No "powered by pollinations" filler — the column is already for pollinations apps.
- No marketing adjectives ("revolutionary", "cutting-edge").

## Opening the issue

```bash
gh issue create \
  --repo pollinations/pollinations \
  --template tier-app-submission.yml \
  --title "[App Submission] <AppName>" \
  --web   # let the user fill remaining fields interactively
```

Or fully scripted once fields are collected:

```bash
gh issue create \
  --repo pollinations/pollinations \
  --title "[App Submission] <AppName>" \
  --label TIER-APP \
  --body "$(cat <<'EOF'
### App Name
<AppName>

### App Description
<2-4 sentences, leading with a ~80-char summary>

### App URL
<https://…>

### Category
<image|video_audio|writing|chat|games|learn|bots|build|business>

### GitHub repo
<optional>

### Discord handle
<optional>
EOF
)"
```

## After the issue is open

- Workflow comment appears within ~1 min with the generated `APP_REVIEW_DATA` JSON. Review it: category, platform, description are AI-inferred and sometimes wrong.
- If wrong, the contributor **comments a correction** on the issue (not editing the issue body — the workflow keyed off the original). The `app-review-agent` re-runs and updates the preview.
- Approval (`TIER-APP-APPROVED` label) is maintainer-only. Don't promise a timeline.

## Gotchas

- **Don't open a PR directly against `apps/APPS.md`.** Manual PRs bypass dedup, duplicate detection, and tier attribution. Use the issue template; the PR is auto-generated. (The only exception is the team using [.github/scripts/app-update-readme.js](../../../.github/scripts/app-update-readme.js) after a manual edit — that's internal.)
- **One app per issue.** A suite of tools = multiple issues, one per user-facing app.
- **Stars badge is auto-populated** from the repo; don't put `⭐` in the description.
- **Emoji** is chosen by the reviewer, not the contributor — don't spend time on it.
- **If the app is gated / requires signup**, mention that in the description; reviewers won't hunt for credentials.
- **"Powered by Pollinations" credit** in the app's UI is optional but appreciated (see the issue template — it links to a badge). Not required for approval.

## Related

- [apps/APPS.md](../../../apps/APPS.md) — the file the submission eventually lands in
- [.github/workflows/app-review-submission.yml](../../../.github/workflows/app-review-submission.yml) — the workflow you'll see run
- Internal review / labelling is handled by the `app-review` skill (not in this folder)
