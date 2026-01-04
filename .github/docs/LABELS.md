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
| `TIER-APP-REVIEW`     | PR created, awaiting maintainer   | `app-review-submission.yml` |
| `TIER-APP-COMPLETE`   | Approved and merged               | `app-upgrade-tier.yml`      |
| `TIER-APP-REJECTED`   | Submission rejected               | `app-review-submission.yml` |

**Code Contributions** _(future)_: `TIER-CODE-*` labels planned.

## PR Labels

| Label              | Purpose                                           | Applied by              |
| ------------------ | ------------------------------------------------- | ----------------------- |
| `pr:external`      | Returning external contributor (has flower tier+) | `pr-label-external.yml` |
| `pr:review-needed` | Needs maintainer review                           | Manual                  |
| `pr:merge-ready`   | Approved, ready to merge                          | Manual                  |
| `pr:news`          | PR related to news/social                         | Instagram workflows     |
