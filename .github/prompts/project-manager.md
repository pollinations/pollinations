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

### support (pick ONE type + ONE or more services)

**TYPE (exactly 1, blue):**
`S-BUG`, `S-OUTAGE`, `S-QUESTION`, `S-REQUEST`, `S-DOCS`, `S-INTEGRATION`

**SERVICE (1 or more, violet):**
`S-IMAGE`, `S-TEXT`, `S-AUDIO`, `S-VIDEO`, `S-API`, `S-WEB`, `S-CREDITS`, `S-BILLING`, `S-ACCOUNT`

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
5. For support: pick exactly ONE `TYPE-*` label + ONE or more `SVC-*` labels
