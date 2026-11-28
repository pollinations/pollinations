# Scheduled tasks

Use one dedicated chat per job. Times are local to Europe/Berlin. Support
reviews run every day. Each model review has its own weekday at 11:00 and
a dedicated chat. Proposed jobs await activation.

| Job | Status | Cadence | Scope and result | Runbook |
| --- | --- | --- | --- | --- |
| Support Git | Active | Daily at 09:00 | Review open Community issues in the Express queue and surface the next reply or action. Draft or send a reply on request under the support workflow. | [Git support runbook](support-git.md) |
| Support email | Active | Daily at 18:00 | Review the connected inbox over the last 24 hours and surface replies, deadlines and follow-ups. Handle individual replies under the email support workflow on request. | [Email support runbook](support-email.md) |
| [Model repairs](https://github.com/orgs/pollinations/projects/20/views/42?filterQuery=is%3Aopen%20is%3Apr%20area%3A%22Models%20%C2%B7%20Repair%22) | Proposed | Mondays at 11:00 | Review open repair PRs and verify the proposed fix against production health and linked reports. | [Repair runbook](model-repairs.md) |
| [Model updates](https://github.com/orgs/pollinations/projects/20/views/42?filterQuery=is%3Aopen%20is%3Apr%20area%3A%22Models%20%C2%B7%20Update%22) | Proposed | Tuesdays at 11:00 | Review open PRs for planned upgrades, pricing, capability or routing changes. | [Update runbook](model-updates.md) |
| [Model additions](https://github.com/orgs/pollinations/projects/20/views/42?filterQuery=is%3Aopen%20is%3Apr%20area%3A%22Models%20%C2%B7%20Add%22) | Proposed | Wednesdays at 11:00 | Review open PRs for new models and verify their provider, capability, price and fallback decisions. | [Addition runbook](model-additions.md) |
| [Model retirements](https://github.com/orgs/pollinations/projects/20/views/42?filterQuery=is%3Aopen%20is%3Apr%20area%3A%22Models%20%C2%B7%20Retire%22) | Active | Thursdays at 11:00 | Find low-use models and upstream shutdowns. Propose a dated removal or route migration. Process an approved retirement through the existing notice and hold procedure. | [Retirement runbook](model-retirements.md) |

Start each weekly model review from its linked queue of open PRs. Use linked issues
for context and production telemetry to judge impact. The
[Project Manager](../../apps/agent-weaver/system-prompt.md) assigns
the Models area when a PR opens. If an existing PR is in the wrong one, change its
Area in the Dev project.
Each model job owns its PR through review and authorized merge. Check test
evidence, required approvals and any merge hold in that job's chat. When a job
finds work owned by another, link the evidence and existing issue or PR in its
report. The Retirement job owns provider-announced shutdowns through the
resulting migration or removal.

## Maintain the schedules

This directory holds the schedule catalog and runbooks for active and proposed jobs.

- Edit cadence, status and scope here. Edit the linked runbook for procedure
  changes. Point each active Codex task to its Git runbook on `origin/main`.
- In Codex Scheduled, apply cadence or status changes to the existing task and
  verify its next run. Keep each task's chat binding and authenticated inbox
  selection in Codex.
- For a manual run, open the linked runbook in the job's chat and use the same
  scope. Keep cases, account data and drafts in the private chat.
