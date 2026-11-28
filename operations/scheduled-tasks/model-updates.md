# Weekly model updates

Start with the [Models · Update queue](https://github.com/orgs/pollinations/projects/20/views/42?filterQuery=is%3Aopen%20is%3Apr%20area%3A%22Models%20%C2%B7%20Update%22).
Review open PRs for planned version, capability, pricing, access or routing
changes to working models. Read linked issues for context.

1. Compare the live public contract and production route with the proposed
   PR diff. Check provider dates and open merge holds first.
2. Document the before and after behavior. Check
   [API compatibility](../../.claude/skills/model-management/references/implementation.md#api-compatibility)
   and [aliases and stored IDs](../../.claude/skills/model-management/references/implementation.md#aliases-and-stored-ids)
   when affected. For a provider or route change, use
   [route research](../../.claude/skills/model-management/references/route-research.md#research-the-exact-route).
   For pricing or route changes, verify the exact rate and usage with [billing verification](../../.claude/skills/model-management/references/billing-verification.md).
3. Report the issue and PR links, user-visible change, effective date, and
   required [approval](../../.claude/skills/model-management/references/change-approval.md#model-contract)
   in the job's chat. Use the
   [change matrix](../../.claude/skills/model-management/references/change-and-test-matrix.md#change-matrix)
   for the remaining verification.
