Review the requested PR or code changes using the Coding Principles, Testing, and Communication Style sections of root `AGENTS.md` and any applicable scoped instructions.

- Read the current diff, latest accepted decision, affected callers, and relevant tests before judging the change.
- Identify concrete correctness problems and opportunities to satisfy the same requirement with less complexity. Check whether existing code already solves the problem.
- Report actionable findings in concise bullets, ordered by impact, with a specific file/line, the affected behavior, and the smallest sufficient fix. Distinguish demonstrated problems from open questions.
- State verification gaps that matter to the change. If there are no actionable findings, say so; do not invent suggestions to fill a template.
- Keep a review advisory unless the user also requested fixes; follow the requested scope.

Before reporting a finding:

- Check reachability: passing tests prove the code does what you think, not that a real entry point calls it before an upstream validator, router, or permission check blocks it.
- Verify subagent-reported findings against the source yourself before publishing, especially billing or security claims.
- Trace a credential to where it is minted and what it grants before calling it exposed; a key-like variable name is not evidence.
- Before saying code is missing, confirm the checkout is current (`git rev-list --count HEAD..origin/main`); if behind, search the requested ref, not the local branch.
- A "this is already broken today" claim needs a concrete input, wrong output, and file/line; a defect that only appears under a future feature is not a present bug.
- For a ported or reimplemented service, check that every security and billing invariant the original or a sibling enforces on the same shared resource is re-established; omissions do not show in a diff.
- For billing-facing findings, name the account or credential owner that pays and the remedy; the viewer is not necessarily the payer.
- A mock more permissive than the platform (for example buffering an unbounded stream where the API requires a known length) gives false confidence; check that the mock enforces what the platform enforces.
- A host-language syntax check cannot validate embedded GLSL, SQL, or HTML in template literals, nor cross-module export gaps; use the real compiler, module loader, or typechecker.
- Read each needed file or line range once and reuse it; do not re-read unchanged files or re-issue speculative shell dumps.
