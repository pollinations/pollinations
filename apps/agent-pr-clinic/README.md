# agent-pr-clinic

A Pollinations agent that reviews a pull request and pushes a proposed fix
branch. Answers the quest in https://github.com/pollinations/pollinations/issues/17245.

## What it does

Given a PR number, `scripts/review-fix.mjs`:

1. Fetches the PR metadata and unified diff via the GitHub REST API.
2. Optionally (`--context`) fetches the small changed files at the PR head so
   the review sees code around the hunks, not just the diff.
3. Calls **`openai/gpt-6.1-sol`** (the model suggested by the quest) through
   `https://gen.pollinations.ai/v1/chat/completions` with a strict
   `VERDICT: FIX|NO-FIX` contract.
4. Saves verbatim usage (`run-<pr>.json`), the review (`review-<pr>.md`), and
   — on FIX — the proposed patch (`patch-<pr>.diff`).
5. With `--push`, the proposed fix is applied and pushed to a branch
   `agent-pr-clinic/fix-<pr>` in the operator's fork (a repository they
   control), so a maintainer can fetch the whole diff in one move.

## Run it

```bash
export POLLINATIONS_API_KEY=your_key   # https://enter.pollinations.ai/keys
node scripts/review-fix.mjs --pr 17453 --context
node scripts/review-fix.mjs --pr 17453 --context --push --fork your-name/pollinations
node test.mjs                          # smoke test (--dry-run, no tokens spent)
```

Uses Node 18+ built-ins only — no npm dependencies.

## Evidence (4 real runs, 2026-10-14)

| PR | verdict | outcome |
|---|---|---|
| #17453 (X-Forwarded-Host spoof hardening) | **FIX** | proposed fix pushed: `agent-pr-clinic/fix-17453` @ `983ca0c` in `mhmdrizzzki/pollinations` |
| #17447 (WebM MIME parsing) | NO-FIX | reasoning in review-17447.md |
| #17422 (SDK videoUrl) | NO-FIX | reasoning in review-17422.md |
| #17484 (Decider model wiring) | NO-FIX | reasoning in review-17484.md |

Details: `EVIDENCE/evidence-*.md`, `EVIDENCE/run-*.json` (verbatim usage),
`EVIDENCE/costs.md` (rates + totals).

## The fix this agent actually found

`pollinations/pollinations` #17453 adds egress-gating to stop spoofed
`X-Original-Client-IP` from choosing the rate-limit identity. Its
`shared/client-ip.ts` trusts the string prefixes `"64.252."` and `"130.176."`
— each a whole /16 — while the same file documents the trusted spaces as
`64.252.64.0/18` and `130.176.0.0/17`. A caller on `64.252.128.1` or
`130.176.128.1` is outside the documented ranges yet still trusted, so the
spoof window stays partly open. The agent (gpt-6.1-sol) flagged the mismatch;
we verified the subnet arithmetic, refined the patch to exact-subnet matching
with IPv4 shape validation, and added regressions before pushing
`agent-pr-clinic/fix-17453`.

## Why gpt-6.1-sol

The quest names it; it is in the live model catalog
(`GET /v1/models`, pricing `promptTokens 0.000002` / `completionTokens
0.00001` pollen). Four reviews, 0 retries, cost ≈ 0.031 pollen (≤ 0.044 with
the additive cache-write interpretation). A cheaper model would reduce cost
but the quest explicitly asks for this model, so we kept it.

## What blocks a fully autonomous run (write-up)

This is the gap report the quest asks for, from actually running it:

- **No GitHub MCP server.** The Pollinations MCP list (`GET /mcp`) exposes
  pollinations, ffmpeg, exa, composio, computer — not GitHub. An agent can
  reach GitHub only through raw REST (`fetch`) or through `composio` with the
  caller's connectors. We used raw REST, which keeps the harness dependency-free.
- **Push still needs a credential.** The model can produce a correct patch,
  but pushing it requires an SSH key / token with write access to a fork. No
  Pollinations-native path grants that yet; the operator's SSH key did the
  actual push. An agent that can push on its own would need a scoped GitHub
  token provisioned by the user (or a composio connector), plus a fork to write to.
- **Long runs are fine.** Reviews completed in 7-22 s each; no timeout pressure.
- **Prompt contract matters.** Without a strict `VERDICT`/`PATCH` template the
  model drifts into prose. The harness asserts the template and saves usage
  verbatim so costs are auditable.
