# Codex schedules

Use one dedicated chat per job. Times are local to Europe/Berlin. Proposed
jobs are planning entries and require a decision before activation.

| Job | Status | Cadence | Scope and result | Skill or runbook |
| --- | --- | --- | --- | --- |
| Daily Express GitHub support triage | Active | Daily at 09:00 | Review open Community issues in the Express queue and surface the next reply or action. Draft or send a reply on request under the support workflow. | [Express triage](../../.claude/skills/pollinations-support-profile/references/daily-express-triage.md) |
| Daily Pollinations model deprecation review | Active | Daily at 09:30 | Find low-use models and upstream shutdowns. Propose a dated removal or route migration. Process an approved retirement through the existing notice and hold procedure. | [Deprecation review](../../.claude/skills/model-management/references/deprecation-review.md) |
| Daily Email Review | Active | Daily at 18:00 | Review the connected inbox over the last 24 hours and surface replies, deadlines and follow-ups. Handle individual replies under the email support workflow on request. | [Daily email review](../../.claude/skills/pollinations-support-triage/references/daily-email-review.md) |
| Model additions | Proposed | Tuesdays at 14:00 | Review new-model requests and prepare provider, capability, price and fallback decisions. Implement an approved addition. | [Model management](../../.claude/skills/model-management/SKILL.md) |
| Model updates | Proposed | Thursdays at 14:00 | Plan upgrades, pricing, capability or routing changes for models that are working. Implement approved changes. | [Model management](../../.claude/skills/model-management/SKILL.md) |
| Model repairs | Proposed | Weekdays at 10:00 | Diagnose active model failures or regressions. Fix the failing layer or restore service through a verified route. | [Model debugging](../../.claude/skills/model-debugging/SKILL.md) |
| API repairs | Proposed | Weekdays at 10:30 | Investigate failures in shared API behavior such as request schemas, authorization, streaming or compatibility. Verify the fix against the existing public contract. | [API repair](../../.claude/skills/api-repair/SKILL.md) |

Each model job owns its PR through review and authorized merge. Check test
evidence, required approvals and any merge hold in that job's chat. When a job
finds work owned by another, link the evidence and existing issue or PR in its
report. The deprecation review owns provider-announced shutdowns through the
resulting migration or removal.

## Maintain the schedules

- Edit cadence, status and scope here. Edit the linked runbook for procedure
  changes. Point each active Codex task to its Git runbook on `origin/main`.
- In Codex Scheduled, apply cadence or status changes to the existing task and
  verify its next run. Keep each task's chat binding and authenticated inbox
  selection in Codex.
- For a manual run, open the linked runbook in the job's chat and use the same
  scope. Keep cases, account data and drafts in the private chat.
