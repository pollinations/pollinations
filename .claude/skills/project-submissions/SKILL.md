---
name: project-submissions
description: AI-assisted pipeline for processing GitHub project submissions. Reviews submissions, creates PRs, and manages status via app: labels.
---

# Project Submissions Skill

AI-assisted pipeline for processing project submissions labeled `app:review`.

---

## Status Tiers (Single Source of Truth)

Four labels track submission status:

| Label             | Status           | Description                        |
| ----------------- | ---------------- | ---------------------------------- |
| `app:review`      | **Under Review** | New submission, awaiting AI review |
| `app:info-needed` | **Info Needed**  | Awaiting response from submitter   |
| `app:approved`    | **Approved**     | PR merged, project in showcase     |
| `app:denied`      | **Denied**       | Submission rejected                |

**Flow:**

1. User submits → `app:review` (auto-applied by template)
2. AI reviews:
    - Valid → creates PR (maintainer merges manually)
    - Needs info → swaps to `app:info-needed`, @mentions user
3. User responds → AI re-reviews (triggered by edit)
4. **Maintainer merges PR** → auto-swaps to `app:approved`
5. Manual deny → swap to `app:denied`, close issue

---

## Issue Template Contract

The issue template (`project-submission.yml`) exposes these fields:

| Field ID              | Type     | Required | Maps To        |
| --------------------- | -------- | -------- | -------------- |
| `project-name`        | input    | ✅       | `name`         |
| `project-url`         | input    | ✅       | `url`          |
| `project-description` | textarea | ✅       | `description`  |
| `contact-info`        | input    | ✅       | `author`       |
| `github-repo`         | input    | ❌       | `repo`         |
| `project-category`    | dropdown | ✅       | category file  |
| `project-language`    | input    | ❌       | `language`     |
| `additional-info`     | textarea | ❌       | (context only) |

---

## Parsing Issue Body

Extract structured data from GitHub issue body. The issue body uses this format:

```
### Project Name

<value>

### Project Description

<value>

### Project URL

<value>
...
```

**Parse function spec:**

```javascript
parseIssueBody(body) → {
  name: string,           // from "### Project Name"
  url: string,            // from "### Project URL"
  description: string,    // from "### Project Description"
  author: string,         // from "### Contact Information"
  repo: string | null,    // from "### GitHub Repository URL"
  category: string,       // from "### Project Category"
  language: string | null // from "### Project Language"
}
```

---

## Category Mapping

| Issue Category       | File              | Key            |
| -------------------- | ----------------- | -------------- |
| Chat Projects 💬     | `chat.js`         | `chat`         |
| Creative Projects 🎨 | `creative.js`     | `creative`     |
| Games 🎲             | `games.js`        | `games`        |
| Hack & Build 🛠️      | `hackAndBuild.js` | `hackAndBuild` |
| Social Bots 🤖       | `socialBots.js`   | `socialBots`   |
| Learn 📚             | `learn.js`        | `learn`        |
| Vibe Coding ✨       | `vibeCoding.js`   | `vibeCoding`   |

**Base path:** `pollinations.ai/src/config/projects/`

---

## Building Project Entry

```javascript
buildProjectEntry(parsed, issueUser, issueUserId) → {
  name: "Project Name 🎨",        // Add emoji if missing
  url: "https://...",             // Required
  description: "...",             // Condensed to ~50 words
  author: "@github_username",     // From contact-info or issue author
  repo: "https://github.com/...", // Optional
  submissionDate: "YYYY-MM-DD",   // Today's date
  order: 1,                       // Always 1 for new submissions
  language: "zh-CN"               // Optional, if non-English
}
```

**Rules:**

-   Add contextual emoji to name if not present (🎨 creative, 🤖 bot, 🎮 game, etc.)
-   `submissionDate` = today's date in `YYYY-MM-DD` format
-   `order: 1` for all new submissions
-   Add `language` field only if specified and non-English
-   Condense description to ~50 words max

---

## AI Review Process

When reviewing a submission, validate:

1. **URL accessible** — Not 404, loads correctly
2. **Uses Pollinations** — Evidence of Pollinations API usage
3. **Description quality** — Clear, informative, appropriate length
4. **Category fit** — Matches the selected category
5. **No duplicates** — Not already in the project files

**AI verdict structure:**

```javascript
{
  tier: "valid" | "needs_more_info",
  reason: "Brief explanation",
  condensedDescription: "50-word description",
  normalizedCategory: "creative",
  suggestedEmoji: "🎨",
  language: "en" | "zh-CN" | ...,
  flags: ["no-pollinations-detected", "url-404", ...]
}
```

**Actions based on tier:**

-   `valid` → Create PR, keep `app:review` until merged
-   `needs_more_info` → Swap to `app:info-needed`, @mention user asking for clarification

---

## PR Creation

When creating a PR for a valid submission:

1. **Branch name:** `auto/app-<issue-number>-<slug>`
2. **Update file:** `pollinations.ai/src/config/projects/<category>.js`
3. **Add entry** at the top of the exports array
4. **Run generator:** `node pollinator-agent/project-list-scripts/generate-project-table.js --update-readme`
5. **Commit message:**

    ```
    Add [ProjectName] to project showcase

    Co-authored-by: <login> <id+login@users.noreply.github.com>
    Closes #<issueNumber>
    ```

6. **Open PR** targeting `main`

---

## Comment Templates

### Valid Submission (PR Created)

```markdown
## 🌸 Submission Review

**Project:** [Name](url)
**Category:** Creative 🎨
**Status:** ✅ Valid

I've created PR #XX to add your project to the showcase.

Once merged by a maintainer, your project will be live at [pollinations.ai](https://pollinations.ai)!
```

### Needs More Info

```markdown
## 🌸 Submission Review

**Project:** [Name](url)
**Category:** Creative 🎨
**Status:** ⚠️ Action Needed

<specific issue>

Please update your submission with the requested information.
```

---

## File Paths

```
pollinations.ai/src/config/projects/
├── chat.js
├── creative.js
├── games.js
├── hackAndBuild.js
├── socialBots.js
├── learn.js
└── vibeCoding.js
```

**Generator script:** `pollinator-agent/project-list-scripts/generate-project-table.js`

---

## CLI Commands

**List submissions by status:**

```bash
# Under review
gh api 'repos/pollinations/pollinations/issues?labels=app:review&state=open&per_page=50' \
  --jq '.[] | {number, title, user: .user.login}'

# Needs info
gh api 'repos/pollinations/pollinations/issues?labels=app:info-needed&state=open&per_page=50' \
  --jq '.[] | {number, title, user: .user.login}'
```

**Change label:**

```bash
gh issue edit NUMBER --remove-label "app:review" --add-label "app:info-needed"
```

**Regenerate README:**

```bash
node pollinator-agent/project-list-scripts/generate-project-table.js --update-readme
```
