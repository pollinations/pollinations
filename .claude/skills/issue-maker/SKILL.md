---
name: issue-maker
description: Create GitHub issues following Pollinations team conventions. Use when asked to create issues, track work, or plan features.
---

# Issue-Maker

Turn any user request into GitHub issues following team conventions.

---

## Hard Rules

1. **Repo:** `pollinations/pollinations`
2. **Assignee:** Assign to appropriate team member based on domain expertise
3. **No local side-effects** (no file creation/modification)

---

## Workflow

### 1. Research First

Before creating any issues:

```bash
# Check @eulervoid's PRs for style inspiration (concise, bullet-point format)
gh search prs --repo pollinations/pollinations --author eulervoid --limit 5

# Search existing issues for patterns
gh search issues --repo pollinations/pollinations "KEYWORD" --limit 5
```

### 2. Plan

List all planned issues:

-   One sentence description per issue
-   Identify assignee and labels
-   Note related PRs or issues

### 3. Create

```bash
gh issue create --repo pollinations/pollinations \
  --title "EMOJI Short clear title" \
  --body "- Bullet point 1
- Bullet point 2
- Bullet point 3" \
  --assignee HANDLE \
  --label "LABEL"
```

### 4. Output

Provide Discord-compatible summary:

-   Bold titles with issue numbers
-   Plain URLs on separate lines (Discord auto-embeds)
-   Group by category

---

## Team Handles

| Name   | GitHub          | Domain                    |
| ------ | --------------- | ------------------------- |
| Thomas | **@voodoohop**  | General, Models, Infra    |
| Joshua | **@eulervoid**  | Pollen, Backend, Auth     |
| Elliot | **@elliotetag** | Community, Newsletter, UI |

---

## Common Labels

| Label             | Use Case                                           |
| ----------------- | -------------------------------------------------- |
| `TRACKING`        | Meta/planning issues that track multiple sub-tasks |
| `NEWS`            | Community announcements and updates                |
| `ext-issue`       | External user requests (tier upgrades, etc.)       |
| `app:review`      | New project submission (under review)              |
| `app:info-needed` | Submission awaiting user response                  |
| `app:approved`    | Project approved and merged                        |
| `app:denied`      | Submission rejected                                |

---

## Issue Templates

### Standard Issue (max 3 bullets)

```markdown
-   Adds X to Y
-   Fix Z by doing W
-   Related: #1234
```

### Tracking Issue (more detailed)

```markdown
## Overview

Brief description

## Tasks

-   [ ] Task 1
-   [ ] Task 2
-   [ ] Task 3

## Related

-   #issue1
-   #issue2
```

### Tier Upgrade Request

```markdown
-   Upgrade @USERNAME to TIER tier
-   Qualification: [reason]
-   Related: #original_request_issue
```

---

## Style Guide

-   **Short, sharp, no fluff**
-   Smart emojis (not overdone)
-   Bullet points over paragraphs
-   Reference @eulervoid's style: `repo:pollinations/pollinations author:eulervoid`

---

## Example Commands

**Create simple issue:**

```bash
gh issue create --repo pollinations/pollinations \
  --title "🔧 Fix caching header for image service" \
  --body "- Update cache-control header
- Add proper ETag support
- Related: #4100" \
  --assignee voodoohop
```

**Create tracking issue:**

```bash
gh issue create --repo pollinations/pollinations \
  --title "📋 TRACKING: Q4 Model Updates" \
  --body "## Overview
Track all model-related updates for Q4

## Tasks
- [ ] Add Claude Sonnet 4.5
- [ ] Update pricing tiers
- [ ] Deprecate old models" \
  --label "TRACKING" \
  --assignee voodoohop
```

**Comment on issue:**

```bash
gh issue comment 1234 --repo pollinations/pollinations \
  --body "✅ Done! Merged in #5678"
```
