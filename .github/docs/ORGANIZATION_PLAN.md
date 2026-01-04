# Project Organization

This document defines how we organize issues and PRs across GitHub Projects. It covers labels for categorization, priority levels, and workflow statuses.

We are transitioning from using a single **Dev** project to four dedicated projects: **Support**, **Dev**, **News**, and **Tier**.

**Rule:** Every issue and PR in the pollinations repository must belong to exactly one project — no more, no less.

## Labels

GitHub labels applied to issues and PRs for categorization and filtering.

### Label Hierarchy

| Level | Purpose                                                   | Required                |
| ----- | --------------------------------------------------------- | ----------------------- |
| TOP   | Project identifier - applied to ALL items in that project | Always 1                |
| TYPE  | Issue/PR classification within project                    | At least 1 if available |
| TAG   | Additional context (Support only)                         | Optional                |

**Per project:**

- **DEV**: TOP + TYPE (e.g., `DEV` + `BUG`)
- **SUPPORT**: TOP + TYPE + TAG (e.g., `SUPPORT` + `HELP` + `BILLING`)
- **NEWS**: TOP only (e.g., `NEWS`)

### Dev

| Label    | Issue | PR  | Comments                                         |
| -------- | ----- | --- | ------------------------------------------------ |
| DEV      | x     | x   | Applied to all Dev items                         |
| BUG      | x     |     | Something is broken                              |
| FEATURE  | x     |     | New functionality request                        |
| QUEST    | x     |     | Community task - One off Pollen reward if merged |
| TRACKING | x     |     | Meta-issue tracking other items                  |

### Support

**Single concatenated labels** — one label shows full context at a glance.

| Label           | Issue | Comments                       |
| --------------- | ----- | ------------------------------ |
| SUPPORT-HELP    | x     | General assistance request     |
| SUPPORT-BUG     | x     | Something is broken            |
| SUPPORT-FEATURE | x     | Feature request                |
| SUPPORT-BILLING | x     | Payment or subscription issue  |
| SUPPORT-BALANCE | x     | Pollen balance issue           |
| SUPPORT-API     | x     | API usage or integration issue |

### NEWS

| Label | PR  | Comments                |
| ----- | --- | ----------------------- |
| NEWS  | x   | Applied to all News PRs |

### Tier

**Single concatenated labels** — one label shows full state at a glance.

App Submissions (via issue template)

| Label               | Issue | PR  | Comments                          |
| ------------------- | ----- | --- | --------------------------------- |
| TIER-APP            | x     |     | New submission received           |
| TIER-APP-INCOMPLETE | x     |     | Needs user action (info/register) |
| TIER-APP-REVIEW     | x     | x   | PR created, awaiting maintainer   |
| TIER-APP-COMPLETE   | x     | x   | Approved and merged               |
| TIER-APP-REJECTED   | x     | x   | Declined                          |

Code Contributions _(future)_

| Label              | PR  | Comments            |
| ------------------ | --- | ------------------- |
| TIER-CODE          | x   | New contribution    |
| TIER-CODE-REVIEW   | x   | Awaiting maintainer |
| TIER-CODE-COMPLETE | x   | Approved and merged |
| TIER-CODE-REJECTED | x   | Declined            |

_Note: Code contribution labels are planned for future implementation._

**Flow:**

```
TIER-APP → (valid) → TIER-APP-REVIEW → TIER-APP-COMPLETE
                                     ↘ TIER-APP-REJECTED
         → (invalid) → TIER-APP-INCOMPLETE → (user fixes) → re-process
                     ↘ TIER-APP-REJECTED (duplicate/spam)
```

## Priority

GitHub Projects priority field — a built-in property for ranking importance.

| Priority | Support Issue | Dev Issue | News PR |
| -------- | ------------- | --------- | ------- |
| Urgent   | x             | x         | x       |
| High     | x             | x         |         |
| Medium   | x             | x         |         |
| Low      | x             | x         |         |

## Status (Issues)

GitHub Projects status field — tracks workflow state across different project views.

| Status      | Support Issue | Dev Issue | Tier Issue |
| ----------- | ------------- | --------- | ---------- |
| Backlog     |               | x         |            |
| To do       | x             | x         |            |
| In progress | x             | x         |            |
| In review   |               |           | x          |
| Done        | x             | x         | x          |
| Discarded   | x             | x         |            |

## Status (PRs)

PR state on GitHub — Draft PRs are work-in-progress; Ready for review PRs are awaiting approval.

| Status           | Dev PR | News PR | Tier PR | News PR |
| ---------------- | ------ | ------- | ------- | ------- |
| Draft            | x      |         |         |         |
| Ready for review | x      | x       | x       | x       |
