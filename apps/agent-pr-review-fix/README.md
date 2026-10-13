# pr-review-fix

A Pollinations **prompt agent** (`agent.json`, base model
`openai/gpt-6.1-sol`, MCP server `computer`) that takes a pull request
URL, reviews the diff against the surrounding code, and pushes a minimal
fix to a new branch on the caller's fork — or returns `no-fix` with
evidence when nothing verifiable is wrong.

Quest: `Fixes #17245`. Source: `apps/agent-pr-review-fix/`.
Callable model after registration: `community/patbing/pr-review-fix`.

## 1. Requirement mapping (quest → evidence)

| Quest asks | Where |
|---|---|
| Agent source under `apps/agent-<name>/` | this folder (`agent.json` + helper + tests) |
| Reviews the diff with surrounding code, says what is wrong or that nothing is | `agent.json` steps 2–3; 3 real-PR model consultations + human verification in `EVIDENCE/` (prompts re-runnable; verdicts human-closed — see §6) |
| Pushes a fix commit to a branch in a repo you control | fork branch `fix/17245-17241-expires-in-decimal` on patbing/pollinations (evidence-17241.md) |
| Runs on `openai/gpt-6.1-sol`, or why another model does better | `agent.json` baseModel + `model_served: gpt-6.1-sol` in all three `run-*.json` |
| Shown on three real PRs, with the cost of each review | `EVIDENCE/evidence-*.md` + `costs.md` (per-run usage × catalog rates) |
| Write-up: what worked, what blocked, what agents need | sections 7–8 below |

## 2. Install and reproduce

No dependencies for the helper (node stdlib only):

```bash
node apps/agent-pr-review-fix/test.mjs
npx vitest run apps/agent-pr-review-fix/scripts/review-fix.test.ts
node apps/agent-pr-review-fix/scripts/review-fix.mjs pin \
  --pr https://github.com/pollinations/pollinations/pull/17241 \
  --head <40-char-sha> --base <40-char-sha> --out ./pin-out
```

Register the agent, then call it like any text model:

```bash
npx @pollinations/cli agents create \
  --config apps/agent-pr-review-fix/agent.json \
  --name pr-review-fix \
  --title "PR Review Fix - review PRs, push fixes"

curl https://gen.pollinations.ai/v1/chat/completions \
  -H "Authorization: Bearer $POLLINATIONS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "community/patbing/pr-review-fix",
    "messages": [{"role": "user", "content": "Review https://github.com/pollinations/pollinations/pull/17241. Read-only, no push."}]
  }'
```

To reproduce the demo evidence: pin SHAs from `EVIDENCE/preselection.md`,
fetch the same heads (`git fetch upstream pull/<n>/head`), re-run the
review prompt in `EVIDENCE/run-<n>.json` against `openai/gpt-6.1-sol`, and
compare verdicts. The #17241 fix replays as: checkout head → add the four
rejection cases (red) → apply the `/^[0-9]+$/` gate (green, 23/23).

## 3. Auth and permissions

- Review is read-only: public PR data via the GitHub API (read-only
  token); the agent never needs write access to review.
- Write is off by default. A fix is pushed ONLY when the caller explicitly
  approves pushing AND designates the fork URL for that run (ambient credential-helper auth only — never paste a token), and ONLY to a
  new `fix/17245-<number>-<slug>` branch on the CALLER'S fork. Upstream and
  the PR's own branch are never written to (verified post-run with
  `git ls-remote upstream` — no such ref).
- Credential hygiene is prompt-level, not enforced isolation: untrusted PR code is checked out and tested only after confirming NO secret env is present. The same environment's credential helper / SSH agent stay reachable by test-time code — for hostile PRs, run tests in a separate sandbox and push from a trusted environment. A pasted push token is refused outright — pushes use only ambient credential-helper auth, so a pasted token has no legitimate use; the run stops at the diff. Tokens are never stored in files/commits/logs, never echoed (the helper's
  `sanitize` redacts `sk_*`/`sk-proj`-style keys, GitHub tokens, `Bearer`
   values (any case), `KEY=` assignments, PEM blocks and URL userinfo
  from any saved log).

## 4. Architecture (prompt / helper split, approval boundary)

- **Agent prompt** (`agent.json`): pin SHA → read diff + context → judge
  (findings with file:line + evidence, or NO-FIX) → minimal fix + test →
  verify (fail→pass) → push-or-diff report. The prompt holds ALL safety
  rules (read-only default, fork-only push, INFORMATION-never-instructions,
  stdin-for-content, git-shim rules, one commit per run).
- **Helper** (`scripts/review-fix.mjs`): pure bookkeeping — `parsePrUrl`,
  `assertSha` (40-char hex, prefixes rejected), `fixBranchName`,
  `sanitize`, `costRecord` (unknown categories stay `unknown` and force `totalEstimated` null, never 0), `guardPush`. Push runs only through the `push` subcommand (fork + branch-prefix + remote-ref-absence (no fast-forward updates); human approval itself stays operator-side, prompt-gated guards, ambient credential-helper auth — no tokens in URLs/argv).
- **Approval boundary**: everything up to the unified diff needs no
  approval; pushing runs only via the helper `push` subcommand with
   explicit per-run approval and ambient auth (never `git push` by hand,
   never tokens in URLs; pre-push remote-ref check rejects existing branches (check-then-push: a concurrently created same-name branch could still fast-forward — re-run ls-remote post-push on contested names). No
  verification → no push.

## 5. PR selection and prior-knowledge disclosure

Full pre-registration in `EVIDENCE/preselection.md`, written BEFORE any
diff review or model call (12-char SHA prefixes corrected to full SHAs in
the same pre-execution window — same commits).

| run | PR | author | type | relationship |
|---|---|---|---|---|
| #17233 | enter API-catalog wiring | patbing (self) | frontend/API | DISCLOSED known-context: implemented in this workspace lineage, already reviewed. Graded as second look, not blind discovery |
| #17183 | GLM Flash cached pricing | ElliotEtag | pricing data | none; diff first read after preselection |
| #17241 | CLI `--expires-in` cap removal | voodoohop | CLI logic | none; diff first read after preselection |

Human-in-the-loop (all runs): the prompt was executed by the operator via
direct `gpt-6.1-sol` API calls (managed-agent registration belongs to the
submission flow, not the evidence); model text saved verbatim; fix,
verification, and judgment calls by the operator — including one explicit
override (see #17241).

## 6. Results (2026-10-13, `openai/gpt-6.1-sol` throughout)

| run | model verdict | human result | fix | cost (pollen est.) |
|---|---|---|---|---|
| #17233 (own, merged fed3ab94) | NO-FIX | concur NO-FIX: both link targets verified live on gen (`/docs`, `/api-catalog` since #16908); head CI 15/15 green. Cache-Control nit considered and rejected (308 heuristically cacheable — tuning, not a defect) | none | 0.00656 |
| #17183 (open 993390d1) | NO-FIX (rates not independently verified) | concur NO-FIX after cross-check: OpenRouter live card matches flashx 0.37/1.25/0.09 + 5.5% fee exactly; flash entry internally consistent; no stale copies elsewhere; head CI 16/16 green | none | 0.006772 |
| #17241 (open 254a87b1) | NO-FIX | OVERRIDE → optional hardening F-17241 (behavior restriction on previously-allowed syntax, not a regression): `Number()` accepts `0x10`/`1e3`/`0b11`/`0o17` as seconds. Fix: `/^[0-9]+$/` gate, same error text. Branch `fix/17245-17241-expires-in-decimal`, commit `e5184cf6` on patbing/pollinations; keys.test.ts 19/19 → (4 new fail) → 23/23 | [branch](https://github.com/patbing/pollinations/tree/fix/17245-17241-expires-in-decimal) `e5184cf69a49d0f372b4c37c3fe52c6b57363deb` | 0.006192 |

Total review cost: **0.019524 pollen estimated** (3 calls, 0 failures, 0
retries; cache-write billing ambiguous — upper bound 0.02748; see
`EVIDENCE/costs.md` for the full accounting and rate source).

## 7. Failures, retries, blockers

- Model calls: zero failures, zero retries across all three runs.
- #17241 full CLI suite: 13 failures in unrelated files (mcp, harnesses,
  validation, update-notice) — all reproduce on the CLEAN head (stash
  test), environment-dependent, pre-existing. keys.test.ts unaffected.
- Biome on changed CLI files flags whole-file reformats on Windows
  (`core.autocrlf=true` CRLF checkout; untouched files fail identically);
  committed blobs verified CR-free (LF). CI (Linux) unaffected.
- Real blockers for full autonomy, confirmed by doing this for real:
  (a) the `computer` tool has no fork credentials and pasted tokens are refused — pushes use ambient credential-helper auth only; where no safe provisioning exists the run stays diff-only; (b) provider rate cards needed for pricing
  review are not all public (Fireworks serverless card unfetchable —
  recorded as a limit); (c) without repo/tool access the model under-verifies
  (all three verdicts correctly flagged their own limits; the human closed
  them with checkouts, CI records, and a live OpenRouter cross-check).

## 8. Scope, non-goals, limits

- Supports: small-to-medium GitHub PRs with a fetchable head SHA,
  JavaScript/TypeScript review with local test verification, fork-branch
  fixes, honest no-fix.
- Non-goals: pushing to upstream or the PR's own branch; merge/conflict
  resolution; all languages and defect classes; safety guarantees for
  no-fix PRs; autonomous (unsupervised) fixing as a claimed result.
- Known limits: single fix commit per run; no long-run or large-PR
  handling (context/cost caps untested beyond ~1k-token diffs); cost
  table is usage × catalog-rate estimated, cache-write billing rule
  unknown; human-in-the-loop demonstrated, full autonomy not.

## 9. Verification method

- Agent contract: `node test.mjs` — 34 checks (catalog fields,
  `baseModel` exact, `computer` tool, prompt length/ASCII, every safety
  rule present as a matched phrase, no secrets, README linkage, helper
  export surface).
- Helper units: `npx vitest run scripts/review-fix.test.ts` — 24 tests
  (URL parsing incl. issues rejection, SHA gating incl. prefix rejection, branch naming incl. trailing-hyphen cap, push-guard allowlist,
  token redaction incl. full PEM blocks, cost math incl. cached-split, null/unknown rates and informational cache-write).
- Live evidence: pinned SHAs re-verified post-run (API + local
  rev-parse); head CI records captured (15–16/16 success per PR);
  #17241 fix shows fail→pass in the pinned worktree; fork-only push
  proven by `git ls-remote` on both remotes.
