# Label System

## Inbox Labels (Triage)

| Label           | Purpose                          | Applied by                                        |
| --------------- | -------------------------------- | ------------------------------------------------- |
| `inbox:github`  | External issue needs triage      | `issue-label-external.yml`                        |
| `inbox:discord` | Issue created from Discord       | `issue-create-from-discord.yml` (via Discord bot) |
| `inbox:news`    | PR related to weekly news update | `pr-create-weekly-news.yml`                       |

## Tier Labels (Unified for Apps & PRs)

| Label              | Purpose                                         | Applied by                                              |
| ------------------ | ----------------------------------------------- | ------------------------------------------------------- |
| `tier:review`      | No tier/spore/seed, eligible for Flower upgrade | Issue template / `pr-label-external.yml`                |
| `tier:info-needed` | Awaiting registration or more info              | `tier-app-submission.yml` / `tier-upgrade-on-merge.yml` |
| `tier:flower`      | Approved for Flower tier                        | `tier-upgrade-on-merge.yml` (auto on merge)             |
| `tier:done`        | Tier upgrade completed                          | `tier-upgrade-on-merge.yml`                             |

## PR Labels

| Label              | Purpose                                           | Applied by              |
| ------------------ | ------------------------------------------------- | ----------------------- |
| `pr:external`      | Returning external contributor (has flower tier+) | `pr-label-external.yml` |
| `pr:review-needed` | Needs maintainer review                           | Manual                  |
| `pr:merge-ready`   | Approved, ready to merge                          | Manual                  |
| `pr:news`          | PR related to news/social                         | Instagram workflows     |
