# Demo PR pre-selection (written BEFORE any review execution)

Date: 2026-10-13 (UTC+9). All SHAs below were read from the GitHub API
before any diff review or agent run. Detailed diff inspection, model
review calls, and fixes happen only after this file is committed to the
working tree.

## Selected targets

| # | PR | Author | State at selection | Head SHA (pinned) | Base SHA | Change type |
|---|---|--------|--------------------|-------------------|----------|-------------|
| 1 | pollinations/pollinations#17233 "fix(enter): expose gen API catalog and link documentation directly" | patbing (self/operator) | closed+merged 2026-10-13T05:50:13Z | fed3ab9469038b706e257f128e64b455d09272a6 | 2d1275ed0f1e8444c1da39c4400f04d1ca38e7f9 | enter frontend/API wiring (well-known, redirect, llms.txt) |
| 2 | pollinations/pollinations#17183 "fix: correct GLM Flash cached input pricing" | ElliotEtag (other) | open | 993390d1b34888f00f4c13a5ae943a54b952574c | a2cdb2ee3c9650597fe35e9a22577c101325aba3 | pricing/registry data (shared/registry/text.ts + snapshot) |
| 3 | pollinations/pollinations#17241 "fix(cli): drop the 365-day cap on keys create --expires-in" | voodoohop (maintainer, other) | open | 254a87b1543c2a6e658894fcf681383db501f5b1 | 7c46c60832c249c86f3117bad55da1ff7df01384 | CLI validation logic (packages/polli-cli) |

Full 40-char SHAs re-verified via the pulls API on 2026-10-13 (an earlier
draft of this file showed 12-char prefixes; corrected here before any
review execution - same commits, no change of target).

Full head SHAs were fetched via `GET /repos/pollinations/pollinations/pulls/{n}`
with a read-only token on 2026-10-13. If any head moves before the run,
the run uses the pinned SHA above and the move is recorded, never mixed.

## Why these three

- Small and locally verifiable: #17233 touches 5 files (+67/-14);
  #17183 touches 2 files (+8/-8); #17241 touches 4 files (+25/-22).
  Each has an executable check (vitest/node --test or a pricing assertion).
- Three different change types: frontend/API wiring vs pricing data vs
  CLI logic. No two share a file.
- Accessible now: all head SHAs are fetchable; #17233 head lives in the
  operator's fork (patbing/pollinations), the other two heads are public.
- Fix-push plan (write separation): review is read-only. Any fix commit
  goes to a NEW branch on the operator fork ONLY
  (`origin` = patbing/pollinations):
  `fix/17245-<pr-number>-<slug>`. Never push to upstream, never push to
  the original PR branch (including #17233's own branch, which is already
  merged - the fix is a follow-up, not a rewrite).

## Relationship and prior-knowledge disclosure

- #17233: SELF case. The operator (patbing) authored this PR; it was
  implemented in this same workspace lineage and already passed local
  checks, bugbuddy review, and a Sol diff check before merge. This is a
  DISCLOSED KNOWN-CONTEXT case, NOT a blind discovery. The re-review
  must look for RESIDUAL issues (things the first pass missed), and any
  finding is graded as "found on second look at own code", not as
  independent discovery. Prior knowledge given to the review model call:
  none beyond the diff and surrounding files (no hints about where to
  look); but the human implementer knows the code, which is disclosed here.
- #17183: NO prior knowledge. The operator has never read this diff. Only
  the title and file list above were seen before this writing.
- #17241: NO prior knowledge. Same as above; only title + file
  list seen. (Author is the repo maintainer; that gives the PR no special
  treatment - review is on the diff only.)
- Human-in-the-loop disclosure (applies to all three): the agent prompt
  in `agent.json` is executed by the operator via direct
  `openai/gpt-6.1-sol` API calls from this machine (the managed-agent
  registration step belongs to the PR author flow, not to this evidence).
  The model output is saved verbatim; the human applies the fix commit,
  runs the verification, and records every manual step in the per-PR
  evidence file. Nothing is presented as autonomous agent execution.

## No-fix policy

If review of a target finds no verifiable defect, the result is recorded
as `no-fix` with scope, checks run, and limits - no forced finding. At
selection time all three are believed to be fixable (small, logic-bearing
diffs), but that belief is not evidence and does not override the review.
