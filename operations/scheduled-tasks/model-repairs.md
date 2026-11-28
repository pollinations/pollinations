# Weekly model repairs

Start with the [Models · Repair queue](https://github.com/orgs/pollinations/projects/20/views/42?filterQuery=is%3Aopen%20is%3Apr%20area%3A%22Models%20%C2%B7%20Repair%22).
Review open fix PRs and read their linked issues for context. Use the Tinybird-backed
[Model Monitor](https://model-monitor.pollinations.ai) to check production impact,
including cases where a fallback hides a failing primary route.

1. Start with active outages and regressions affecting users. For each PR,
   identify the model, environment, request shape, symptom and time window.
2. Follow the [model debugging skill](../../.claude/skills/model-debugging/SKILL.md)
   to trace the failing layer. Check for evidence that the proposed fix
   reproduces the old failure and restores the affected behavior. Use the
   [test matrix](../../.claude/skills/model-management/references/change-and-test-matrix.md#change-matrix)
   for the affected model or route.
3. Report the issue and PR links, impact, evidence, and the next repair or
   verification step in the job's chat. Flag active outages for immediate action.

Before changing a model or its route, follow the
[model contract approval](../../.claude/skills/model-management/references/change-approval.md#model-contract).
