# Project Organization

This document defines how we organize issues and PRs across GitHub Projects.

**Rule:** Every issue and PR in the pollinations repository must belong to exactly one project — no more, no less.

---

## Dev

Internal development work: features, refactors, infrastructure.

### Labels

| Label        | Comments                                         |
| ------------ | ------------------------------------------------ |
| DEV-BUG      | Something is broken                              |
| DEV-FEATURE  | New functionality request                        |
| DEV-QUEST    | Community task - One off Pollen reward if merged |
| DEV-TRACKING | Meta-issue tracking other items                  |
| DEV-VOTING   | Community vote on a proposal                     |

### Priority

| Priority | Description                         |
| -------- | ----------------------------------- |
| Urgent   | Critical, needs immediate attention |
| High     | Important, address soon             |
| Medium   | Normal priority                     |
| Low      | Nice to have                        |

### Status

| Status      | Description                   |
| ----------- | ----------------------------- |
| Backlog     | Not yet prioritized           |
| To do       | Ready to work on              |
| In progress | Currently being worked on     |
| Done        | Completed                     |
| Discarded   | Won't do / no longer relevant |

---

## Support

External user issues: help requests, bugs, API questions.

### Labels

| Label           | Comments                       |
| --------------- | ------------------------------ |
| SUPPORT-HELP    | General assistance request     |
| SUPPORT-BUG     | Something is broken            |
| SUPPORT-FEATURE | Feature request                |
| SUPPORT-BILLING | Payment or subscription issue  |
| SUPPORT-BALANCE | Pollen balance issue           |
| SUPPORT-API     | API usage or integration issue |

### Priority

| Priority | Description                         |
| -------- | ----------------------------------- |
| Urgent   | Critical, needs immediate attention |
| High     | Important, address soon             |
| Medium   | Normal priority                     |
| Low      | Nice to have                        |

### Status

| Status      | Description                   |
| ----------- | ----------------------------- |
| To do       | Ready to work on              |
| In progress | Currently being worked on     |
| Done        | Completed                     |
| Discarded   | Won't do / no longer relevant |

---

## NEWS

Releases, announcements, and social content.

### Labels

| Label | Comments                    |
| ----- | --------------------------- |
| NEWS  | Applied to news-related PRs |

---

## Tier

App submissions and code contributions from external users.

### Labels

**App Submissions** (via issue template)

| Label               | Issue | PR  | Comments                          |
| ------------------- | ----- | --- | --------------------------------- |
| TIER-APP            | x     |     | New submission received           |
| TIER-APP-INCOMPLETE | x     |     | Needs user action (info/register) |
| TIER-APP-REVIEW     | x     |     | Issue awaiting maintainer review  |
| TIER-APP-REVIEW-PR  |       | x   | PR awaiting maintainer review     |
| TIER-APP-COMPLETE   | x     | x   | Approved and merged               |
| TIER-APP-REJECTED   | x     | x   | Declined                          |

**Code Contributions** _(future)_

| Label               | PR  | Comments               |
| ------------------- | --- | ---------------------- |
| TIER-CODE           | x   | New contribution       |
| TIER-CODE-REVIEW-PR | x   | PR awaiting maintainer |
| TIER-CODE-COMPLETE  | x   | Approved and merged    |
| TIER-CODE-REJECTED  | x   | Declined               |

### Flow

```
TIER-APP → (valid) → TIER-APP-REVIEW → TIER-APP-COMPLETE
                                     ↘ TIER-APP-REJECTED
         → (invalid) → TIER-APP-INCOMPLETE → (user fixes) → re-process
                     ↘ TIER-APP-REJECTED (duplicate/spam)
```
