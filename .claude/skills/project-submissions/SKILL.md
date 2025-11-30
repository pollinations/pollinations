---
name: project-submissions
description: Process GitHub project submissions (APPS label) by adding them to the appropriate category file and closing issues with attribution.
---

# Project Submissions Skill

Process project submission issues labeled **APPS** in GitHub.

---

## Workflow

### 1. List Open Submissions
```bash
gh api 'repos/pollinations/pollinations/issues?labels=APPS&state=open&per_page=50' \
  --jq '.[] | {number, title, user: .user.login, user_id: .user.id, body}'
```

### 2. Parse Issue Body
Extract from each issue:
- **name**: Project Name field
- **url**: Project URL field (required)
- **description**: Project Description (condense to ~50 words)
- **author**: Contact Information or GitHub username
- **repo**: GitHub Repository URL (if provided)
- **category**: Map to file based on Project Category field

### 3. Category Mapping

| Issue Category | File | Description |
|---------------|------|-------------|
| Chat Projects 💬 | `chat.js` | Standalone chat UIs / multi-model playgrounds |
| Creative Projects 🎨 | `creative.js` | Image, video, music, design generation |
| Games 🎲 | `games.js` | AI-powered games, interactive fiction |
| Hack & Build 🛠️ | `hackAndBuild.js` | SDKs, extensions, dashboards, MCP servers |
| Social Bots 🤖 | `socialBots.js` | Discord / Telegram / WhatsApp bots |
| Learn 📚 | `learn.js` | Tutorials, guides, educational demos |
| Vibe Coding ✨ | `vibeCoding.js` | No-code / describe-to-code builders |

### 4. Add Project Entry

Add to `pollinations.ai/src/config/projects/<category>.js`:

```javascript
{
  name: "Project Name 🎨",
  url: "https://project-url.com",
  description: "Condensed description ~50 words max.",
  author: "@github_username",
  repo: "https://github.com/user/repo", // if available
  submissionDate: "YYYY-MM-DD",
  order: 1
}
```

**Rules:**
- Add emoji to name if not present
- `submissionDate` = today's date (YYYY-MM-DD format)
- `order: 1` for new submissions
- Add `language: "xx-XX"` for non-English projects
- If no URL provided, use repo URL or skip

### 5. Close Issue with Attribution

```bash
gh issue close NUMBER --repo pollinations/pollinations \
  --comment "🌸 Added to project showcase!

Thanks @USERNAME for submitting! Your project is now listed in the [$(CATEGORY) category](https://pollinations.ai).

Welcome to the Pollinations community! 🚀"
```

### 6. Regenerate README

After adding all projects:
```bash
node pollinator-agent/project-list-scripts/generate-project-table.js --update-readme
```

---

## Commit Format

```
Add [Project1], [Project2], ... to project showcase

Co-authored-by: user1 <id1+user1@users.noreply.github.com>
Co-authored-by: user2 <id2+user2@users.noreply.github.com>
Closes #issue1, #issue2, ...
```

---

## Batch Processing

Process multiple submissions at once:

1. List all open APPS issues
2. Group by category
3. Add all entries to respective files
4. Single commit with all co-authors
5. Close all issues with comments

---

## Validation Checklist

Before adding:
- [ ] URL is accessible (not 404)
- [ ] Project actually uses Pollinations
- [ ] Description is concise (<100 words)
- [ ] Category assignment is correct
- [ ] No duplicate entry exists

---

## Quick Reference

**File paths:**
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

**Date format:** `YYYY-MM-DD` (e.g., `2025-11-30`)

**User ID lookup:** Available in GitHub issue API response as `user.id`
