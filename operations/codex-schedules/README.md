# Codex schedules

Use one dedicated chat per job. Times are local to Europe/Berlin. Support
reviews run every day. Thursday is the weekly model review day, with separate
chats for each type of model work. Proposed jobs await activation.

| Job | Status | Cadence | Scope and result | Skill or runbook |
| --- | --- | --- | --- | --- |
| Daily Express GitHub support triage | Active | Daily at 09:00 | Review open Community issues in the Express queue and surface the next reply or action. Draft or send a reply on request under the support workflow. | [Express triage](daily-express-triage.md) |
| Daily Email Review | Active | Daily at 18:00 | Review the connected inbox over the last 24 hours and surface replies, deadlines and follow-ups. Handle individual replies under the email support workflow on request. | [Daily email review](daily-email-review.md) |
| [Pollinations model deprecation review](https://github.com/orgs/pollinations/projects/20/views/42?filterQuery=is%3Aopen%20area%3AModels%20model-work%3ARetirement) | Active | Thursdays at 09:30 | Find low-use models and upstream shutdowns. Propose a dated removal or route migration. Process an approved retirement through the existing notice and hold procedure. | [Deprecation review](deprecation-review.md) |
| [Model repairs](https://github.com/orgs/pollinations/projects/20/views/42?filterQuery=is%3Aopen%20area%3AModels%20model-work%3ARepair) | Proposed | Thursdays at 10:00 | Diagnose active model failures or regressions. Fix the failing layer or restore service through a verified route. | [Model debugging](../../.claude/skills/model-debugging/SKILL.md) |
| [Model additions](https://github.com/orgs/pollinations/projects/20/views/42?filterQuery=is%3Aopen%20area%3AModels%20model-work%3AAddition) | Proposed | Thursdays at 13:30 | Review new-model requests and prepare provider, capability, price and fallback decisions. Implement an approved addition. | [Model management](../../.claude/skills/model-management/SKILL.md) |
| [Model updates](https://github.com/orgs/pollinations/projects/20/views/42?filterQuery=is%3Aopen%20area%3AModels%20model-work%3AUpdate) | Proposed | Thursdays at 14:00 | Plan upgrades, pricing, capability or routing changes for models that are working. Implement approved changes. | [Model management](../../.claude/skills/model-management/SKILL.md) |

Start each Thursday chat from its linked queue of open issues and PRs. The
[Project Manager](../infrastructure/project-manager/project-manager.md) assigns the queue. To catch up existing items, run **Repo / Organize issues and PRs**
with **model_queues_only**. Its default dry run previews the assignments.
Each model job owns its PR through review and authorized merge. Check test
evidence, required approvals and any merge hold in that job's chat. When a job
finds work owned by another, link the evidence and existing issue or PR in its
report. The deprecation review owns provider-announced shutdowns through the
resulting migration or removal.

## Maintain the schedules

This directory holds the schedule catalog and the procedures for active runs.
The proposed jobs use the scope above and link to the relevant reusable skill.

- Edit cadence, status and scope here. Edit the linked runbook for procedure
  changes. Point each active Codex task to its Git runbook on `origin/main`.
- In Codex Scheduled, apply cadence or status changes to the existing task and
  verify its next run. Keep each task's chat binding and authenticated inbox
  selection in Codex.
- For a manual run, open the linked runbook in the job's chat and use the same
  scope. Keep cases, account data and drafts in the private chat.
