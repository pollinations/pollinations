---
name: quest-solution-review
description: Compare competing pull requests for a Pollinations community quest and select the smallest correct solution. Use when reviewing multiple implementations linked to a POLLEN-QUEST issue.
---

# Quest Solution Review

Choose the implementation that fully solves the quest with the least ongoing
complexity. Do not reward being first, large, or already up to date with `main`.

## Review

1. Read the quest, acceptance criteria, and relevant current code.
2. Find every linked implementation from the issue timeline, closing keywords,
   cross-references, and PR search. Include closed and draft PRs when they are
   genuine submissions.
3. Inspect each complete diff and checks. Separate branch-age conflicts from the
   quality of the proposed change.
4. Verify changing external contracts against current primary documentation.
5. Apply the gates below, then test the strongest candidates in proportion to
   risk. Prefer focused tests of real code and a practical smoke test when one is
   feasible.

### Correctness gate

A candidate must:

- Meet the quest's observable acceptance criteria.
- Use the real provider/API contract and the repository's existing architecture.
- Preserve required auth, permissions, security, accounting, and tracking.
- Handle failure modes that users can realistically encounter.

Reject a candidate that only appears to work, silently changes the public
contract, or requires speculative fallback behavior to cover a defect.

### Simplicity comparison

Among correct candidates, prefer:

- The smallest focused diff and fewest new concepts.
- Existing shared utilities and established data flow.
- Clear ownership and direct code over wrappers or generic frameworks for one
  use case.
- Focused tests that exercise the production implementation.
- Registry, schema, and documentation changes only when the public contract
  requires them.

Treat unrelated edits, generated noise, lockfile churn, duplicated helpers,
hard-coded copies of dynamic data, mock infrastructure, and contaminated commit
history as costs. Line count is evidence, not the decision by itself.

## Report

Give a concise comparison containing:

- Candidate PRs reviewed and any submissions excluded, with the reason.
- Blocking correctness findings.
- Relative complexity and useful ideas found in alternatives.
- Tests, checks, and smoke tests actually run.
- A verdict: merge, request a small follow-up, combine a specific idea, or accept
  none.

Do not comment, close, edit, or merge contributor PRs unless the user asks. If a
maintainer follow-up is authorized, keep it minimal and preserve contributor
attribution. A small bonus for an alternative is exceptional: use it only when
the alternative was independently strong or materially influenced the shipped
solution, not merely because it was submitted.
