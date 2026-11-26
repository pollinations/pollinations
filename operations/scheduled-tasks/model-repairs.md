# Weekly model repairs

Start with the [Repair queue](https://github.com/orgs/pollinations/projects/20/views/42?filterQuery=is%3Aopen%20is%3Apr%20area%3AModels%20model-work%3ARepair).
Review open fix PRs and read their linked issues for context. Use the Tinybird-backed
[Model Monitor](https://model-monitor.pollinations.ai) to check production impact,
including cases where a fallback hides a failing primary route.

1. Start with active outages and regressions affecting users. For each PR,
   identify the model, environment, request shape, symptom and time window.
2. Follow the [model debugging skill](../../.claude/skills/model-debugging/SKILL.md)
   to trace the failing layer. Check for evidence that the proposed fix
   reproduces the old failure and restores the affected behavior.
3. Report the issue and PR links, impact, evidence, and the next repair or
   verification step in the job's chat. Flag active outages for immediate action.

Use the [model management skill](../../.claude/skills/model-management/SKILL.md)
for an approved change to the model or its route.
