Classify this GitHub issue/PR. Return JSON only.

## Output Schema

```json
{
  "is_app_submission": true | false,
  "project": "dev" | "support" | "news",
  "priority": "Urgent" | "High" | "Medium" | "Low" | null,
  "labels": ["LABEL"],
  "reasoning": "brief explanation"
}
```

## Projects

- `dev`: Internal team only. Infrastructure, CI/CD, refactors, features.
- `support`: External users. API help, bugs, billing, general questions.
- `news`: Announcements, releases, social media content.

## Labels

### dev (pick ONE)

`DEV-BUG`, `DEV-FEATURE`, `DEV-QUEST`, `DEV-TRACKING`

### support

**TYPE (pick exactly 1, never 2 or more):**
`.BUG`, `.OUTAGE`, `.QUESTION`, `.REQUEST`, `.DOCS`, `.INTEGRATION`

**SERVICE (pick 1 or more):**
`IMAGE`, `TEXT`, `AUDIO`, `VIDEO`, `API`, `WEB`, `CREDITS`, `BILLING`, `ACCOUNT`

### news

none

## Priority

- Only for `support` project: `Urgent`, `High`, `Medium`, `Low`
- For `dev` and `news`: set to `null`

## Rules

1. If user submitting an app/tool for review → `is_app_submission: true`
2. If author is internal → can route to `dev`
3. If author is external → route to `support` (never `dev`)
4. For dev: pick ONE label
5. For support: pick exactly 1 TYPE label (never 2 or more) + 1 or more SERVICE labels
