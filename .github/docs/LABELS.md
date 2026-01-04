# Label System

## Inbox Labels (Triage)

| Label           | Purpose                          | Applied by                                        |
| --------------- | -------------------------------- | ------------------------------------------------- |
| `inbox:github`  | External issue needs triage      | `issue-label-external.yml`                        |
| `inbox:discord` | Issue created from Discord       | `issue-create-from-discord.yml` (via Discord bot) |
| `inbox:news`    | PR related to weekly news update | `pr-create-weekly-news.yml`                       |

## Tier Labels (App Submissions)

| Label                 | Purpose                           | Applied by                  |
| --------------------- | --------------------------------- | --------------------------- |
| `TIER-APP`            | New app submission                | Issue template              |
| `TIER-APP-INCOMPLETE` | Needs user action (info/register) | `app-review-submission.yml` |
| `TIER-APP-REVIEW`     | Issue awaiting maintainer review  | `app-review-submission.yml` |
| `TIER-APP-REVIEW-PR`  | PR awaiting maintainer review     | `app-review-submission.yml` |
| `TIER-APP-COMPLETE`   | Approved and merged               | `app-upgrade-tier.yml`      |
| `TIER-APP-REJECTED`   | Submission rejected               | `app-review-submission.yml` |

**Code Contributions** _(future)_: `TIER-CODE`, `TIER-CODE-REVIEW-PR`, `TIER-CODE-COMPLETE`, `TIER-CODE-REJECTED` planned.

## Dev Labels

| Label          | Purpose                                          | Applied by           |
| -------------- | ------------------------------------------------ | -------------------- |
| `DEV-BUG`      | Something is broken                              | `project-manager.py` |
| `DEV-FEATURE`  | New functionality request                        | `project-manager.py` |
| `DEV-QUEST`    | Community task - One off Pollen reward if merged | `project-manager.py` |
| `DEV-TRACKING` | Meta-issue tracking other items                  | `project-manager.py` |
| `DEV-VOTING`   | Community vote on a proposal                     | Manual               |

## Support Labels

| Label             | Purpose                        | Applied by           |
| ----------------- | ------------------------------ | -------------------- |
| `SUPPORT-HELP`    | General assistance request     | `project-manager.py` |
| `SUPPORT-BUG`     | Something is broken            | `project-manager.py` |
| `SUPPORT-FEATURE` | Feature request                | `project-manager.py` |
| `SUPPORT-BILLING` | Payment or subscription issue  | `project-manager.py` |
| `SUPPORT-BALANCE` | Pollen balance issue           | `project-manager.py` |
| `SUPPORT-API`     | API usage or integration issue | `project-manager.py` |

## PR Labels

| Label              | Purpose                                           | Applied by              |
| ------------------ | ------------------------------------------------- | ----------------------- |
| `pr:external`      | Returning external contributor (has flower tier+) | `pr-label-external.yml` |
| `pr:review-needed` | Needs maintainer review                           | Manual                  |
| `pr:merge-ready`   | Approved, ready to merge                          | Manual                  |
| `pr:news`          | PR related to news/social                         | Instagram workflows     |
