# PR Fix Review — a guarded Pollinations code-review agent

Give `review.mjs` a public GitHub pull-request URL. It fetches the pinned PR head and surrounding code, asks `openai/gpt-6.1-sol` for **one** high-confidence issue (or an explicit no-fix), and returns a short review and a literal proposed replacement. With `--push --fork OWNER/REPO`, it commits that replacement on a **new** branch in your fork. It does not comment on or alter the reviewed PR.

Run from a clone whose `origin` is the reviewed repository. Node 20+ is sufficient; there are no npm dependencies. Configure `POLLINATIONS_API_KEY` privately for the model call, optionally `GH_TOKEN` for GitHub API reads, and your usual Git credential helper for pushes. **Never put a credential in a PR link, command argument, source file, screenshot, or review text.** The reviewer never passes Git or Pollinations credentials to the model; only public PR context reaches it.

```bash
node apps/agent-pr-fix-review/review.mjs https://github.com/pollinations/pollinations/pull/17304
node apps/agent-pr-fix-review/review.mjs https://github.com/pollinations/pollinations/pull/17304 --fork YOUR_GITHUB_NAME/pollinations --push
node --test apps/agent-pr-fix-review/review.test.mjs
```

The second command requires that the chosen fix branch **does not already exist**. On a re-run, choose a fresh PR revision; the agent deliberately refuses to overwrite its existing branch. The default (first command) performs no write. The push path verifies the fork parent, pins the exact PR head, rejects paths outside changed source files and credential/CI files, checks an exact-once text match, refuses symlinks, runs `git diff --check`, and creates a new commit. No force push. If the model says no-fix or its edit fails validation, nothing is pushed. It does not run arbitrary model-suggested shell commands.

## Three real PR reviews (2026-10-14)

| PR | Result | Charged Pollen |
| --- | --- | ---: |
| [#17304](https://github.com/pollinations/pollinations/pull/17304) | Found an authenticated job result using public immutable HTTP caching; pushed [one-line cache-privacy fix](https://github.com/xiaotian1171/pollinations/compare/ace322393f9c9b1db91409f5f09d6f5234d01311...review-fix/pr-17304-ace32239), commit `11e60631e`. | 0.040076 |
| [#17284](https://github.com/pollinations/pollinations/pull/17284) | Found a streamed function-call arguments timing bug; produced a validated, exact-match proposed diff, not pushed. | 0.0331985 |
| [#17380](https://github.com/pollinations/pollinations/pull/17380) | No high-confidence issue found in the supplied changed files; no branch pushed. This is our own PR; that relationship is disclosed. | 0.0347685 |

Total **0.108043 Pollen** for three distinct reviewed PRs. These are **billed** amounts read from the caller's own `/account/key/usage` history (matched by model, time and input/output token counts), not just a model-token estimate. Repeating the #17304 input to preview and push its cached response produced no additional billed history rows. The redacted, key-free results and pinned SHAs are in `demos.json`.

The pushed #17304 commit passed Biome `check --write` and both focused async-job tests (2/2) on that PR's code. A full typecheck in a separate temporary worktree hit unrelated dependency/type mismatches (`openRouterImageModel`, `Buffer`, `@better-auth/api-key`) because it reused this checkout's installed packages rather than the PR's exact lockfile; it is **not** claimed to have passed. Do not merge a proposed fix without the target PR's own CI.

## What works and what is missing

- **Works:** one model call reviews the diff with adjacent head-revision lines; the model can say no-fix, or propose a minimal exact replacement. The runner verifies the pinned SHA and fork before pushing. It never gives the model a write token, so PR text cannot instruct it to exfiltrate that token. No secret mutation or credential file edits are allowed.
- **Limitations:** only up to seven changed source files and 65,000 characters of patch/context are inspected; larger PRs are partial reviews. This is a **local code agent**, not a registered hosted Pollinations model. The same repository can publish a managed read-only reviewer, but today's Worker/computer runtime cannot use a caller's fork write credentials or run arbitrary repository tests without a scoped GitHub connector or separate runner. Do not paste a PAT into a hosted agent prompt to work around that boundary.
- **For a fully hosted fixer:** provide per-caller, write-scoped repository authorization and an isolated test runner with bounded time and cost. The code-review and patch validation can stay as-is; only the push/test authority needs to move into a trusted tool boundary.
