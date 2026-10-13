# Run #17241 — other-author PR, CLI validation (no prior knowledge)

- PR: https://github.com/pollinations/pollinations/pull/17241
  "fix(cli): drop the 365-day cap on keys create --expires-in"
- Author: voodoohop (maintainer). State: open. No relationship to the
  operator; the diff was first read AFTER preselection.md was written.
- Pinned head: `254a87b1543c2a6e658894fcf681383db501f5b1`
  (branch `fix/cli-expires-in-no-cap` in pollinations/pollinations —
  NEVER touched; the fix below is on the operator fork only).
- Base: `7c46c60832c249c86f3117bad55da1ff7df01384`. Head re-verified
  after the run (pulls API + local `git rev-parse pr-17241`, match).

## Model review

- Call: `agent.json` systemPrompt + read-only review task, model
  `openai/gpt-6.1-sol`, served model `gpt-6.1-sol`.
- Usage: prompt 1076, completion 404 (121 reasoning). Cost 0.006192 pollen
  estimated (see costs.md). No retries.
- Verdict (verbatim in run-17241.json): **NO-FIX** — argues hex/scientific
  acceptance is not a regression (old helper also used Number()) and the
  error text does not demand decimal-only.

## Human judgment (disagreement recorded)

The operator OVERRODE the model on one minor point. The model's facts are
right (pre-existing hole, same error text), but the conclusion is wrong
for a reviewer: the PR rewrites exactly these validation lines, and
`--expires-in 0x10` minting a 16-second key is a caller footgun no user
intends — CLI convention is decimal seconds, and the message promises "a
whole number of seconds". Severity: **minor** (hardening follow-up, not a
PR-breaker). Framed as such in the fix commit; the model's no-fix verdict
stays on record above.

Finding F-17241: `Number()` accepts `0x10`->16, `1e3`->1000, `0b11`->3,
`0o17`->15 (verified with node). Location:
packages/polli-cli/src/commands/keys.ts, `create` command `--expires-in`
handling.

## Fix (fork branch only)

- Branch (operator fork patbing/pollinations):
  `fix/17245-17241-expires-in-decimal`
  https://github.com/patbing/pollinations/tree/fix/17245-17241-expires-in-decimal
- Commit: `e5184cf69a49d0f372b4c37c3fe52c6b57363deb`
  "fix(cli): accept only decimal digits for keys create --expires-in"
- Diff: validator requires `/^[0-9]+$/` (after trim) before the existing
  integer-and->=1 check (kept, same error text); regression test adds
  `0x10, 1e3, 0b11, 0o17` to the rejection list. +21 lines, 2 files.
- The original PR branch and upstream were never written to
  (`git ls-remote` on upstream shows no such ref; only `origin` gained the
  new branch).

## Verification (fail -> pass, pinned head)

Worktree at exact head 254a87b1, `packages/polli-cli` (`npm ci`, 172 pkgs):

| step | command | result |
|---|---|---|
| baseline | `npx vitest run src/commands/keys.test.ts` | 19/19 pass |
| reproduce | +4 non-decimal rejection cases | 4 failed / 19 passed (defect shown) |
| fix | decimal-only gate in keys.ts | 23/23 pass |
| full file | same file after fix | 23/23 pass |
| whole CLI suite | `npx vitest run` (packages/polli-cli) | 347 pass / 13 fail — all 13 reproduce on the CLEAN head too (stash test: mcp config-files, harnesses, validation, update-notice; environment-dependent, unrelated to keys) |
| format | biome check on changed files | whole-file reformat signal is a Windows CRLF-checkout artifact (`core.autocrlf=true`; untouched output.ts fails identically); committed blobs verified CR-free (LF) |

Head CI at the pinned SHA: 16/16 check-runs success.

Human intervention: context assembled by the operator; model verdict
overridden with written rationale; fix + tests + verification by the
operator. No autonomous agent execution is claimed.
