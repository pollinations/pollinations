Review the requested PR or code changes using the Coding Principles, Testing, and Communication Style sections of root `AGENTS.md` and any applicable scoped instructions.

- Read the current diff, latest accepted decision, affected callers, and relevant tests before judging the change.
- Identify concrete correctness problems and opportunities to satisfy the same requirement with less complexity. Check whether existing code already solves the problem.
- Report actionable findings in concise bullets, ordered by impact, with a specific file/line, the affected behavior, and the smallest sufficient fix. Distinguish demonstrated problems from open questions.
- State verification gaps that matter to the change. If there are no actionable findings, say so; do not invent suggestions to fill a template.
- Keep a review advisory unless the user also requested fixes; follow the requested scope.

Before reporting a finding:

- Passing tests don't prove a real entry point reaches the code. Check nothing upstream (validator, router, permission check) blocks it first.
- Check subagent findings against the source yourself, especially billing or security claims.
- Before calling code missing, make sure the checkout is current (`git rev-list --count HEAD..origin/main`) and search the requested ref, not the local branch.
- "Already broken today" needs a concrete input, wrong output, and file/line. A bug that only appears under a future feature is not a present bug.
- A key-like variable name is not an exposed credential. Trace where it is minted and what it grants.
- For billing findings, say who pays (the account or key owner, not necessarily the viewer) and the fix.
- For a ported or rewritten service, check the security and billing checks the original enforces on the same shared resource still exist; missing ones don't show in a diff.
- A mock looser than the platform (e.g. buffering a stream the API requires a length for) hides bugs. A syntax check can't validate embedded SQL/GLSL/HTML or cross-module exports; use the real compiler or loader.
- Read each file once and reuse it; don't re-read unchanged files.
