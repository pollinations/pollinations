# PullFix — an agent that reviews a pull request and pushes a fix

A [Pollinations code agent](../../BUILD_YOUR_OWN_AGENT.md) for quest [#17245](https://github.com/pollinations/pollinations/issues/17245): it takes a pull request link, reviews the change with the code around it, and pushes a proposed fix to a branch, so a maintainer only reads a short review and a ready diff.

## How it works

```
PR link ─▶ fetch PR + diff + surrounding code ─▶ one gpt-6.1-sol review ─▶ short review + fix branch
            (GitHub REST API, deterministic)        (structured JSON)        (Git Data + Merges API)
```

- **Reading is agent work, not model work.** The agent fetches the PR metadata, the unified diff, and each changed file's content at the PR head (line-numbered, hunk-focused for large files) from the public GitHub REST API. The model never browses.
- **One model call.** `openai/gpt-6.1-sol` reviews the diff with the code around it and answers a strict JSON contract: a verdict, findings with severity/file/line/why, and — only when findings are mechanical — complete fixed file contents. Usage is read back from the response and the cost at catalog prices is printed with every review.
- **The push is deterministic.** A `pr-fixer/<number>` branch is created in a repository the caller controls, the PR head is merged in through GitHub's merge API (so the branch is exactly the PR state), and one commit with the patched files lands on top — the diff between the two is exactly the proposed fix. A file is only patched when a finding names that file.
- **Both request shapes work.** Call it through `/v1/chat/completions` or `/v1/responses`; the reply shape matches the request.

### Calling it

```bash
curl https://gen.pollinations.ai/v1/chat/completions \
  -H "Authorization: Bearer $POLLEN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"<github-user>/pullfix","messages":[{"role":"user","content":
       "{\"pr\":\"https://github.com/pollinations/pollinations/pull/12332\"}"}]}'
```

The message is a PR link, or JSON with options:

| Option | Meaning | Default |
|---|---|---|
| `pr` / plain link | the pull request to review | required |
| `github_token` | fine-grained PAT scoped to the push target, contents: read+write | none — review only |
| `push_to` | `owner/repo` for the fix branch | the PR's base repository |
| `push_branch` | branch name for the fix | `pr-fixer/<number>` |
| `model` | review model override | `openai/gpt-6.1-sol` |

Without `github_token` the review stands alone; with it, a fix lands whenever the findings are mechanical.

### Model choice

`openai/gpt-6.1-sol` as the quest prefers: 1M-token context (whole-file context survives even large PRs), tool-capable Responses endpoint, and the strongest correctness/price ratio among the catalog's reasoners during testing. At catalog prices (2e-6 / 1e-5 Pollen per token) a full review costs well under 0.2 Pollen.

## Demonstrations on real PRs

Six live runs (October 2026), each with the cost of its review:

| PR | Verdict | Findings | Review cost |
|---|---|---|---|
| [pollinations#17422](https://github.com/pollinations/pollinations/pull/17422) — sdk: return stored media URL from videoUrl | clean | — | 0.1835 Pollen (90,870 in / 175 out) |
| [pollinations#17366](https://github.com/pollinations/pollinations/pull/17366) — image: clamp qwen size to Alibaba limits | clean | — | 0.0212 Pollen (9,222 in / 279 out) |
| [pollinations#17415](https://github.com/pollinations/pollinations/pull/17415) — cli: name Gemini TTS output by WAV type | clean | — | 0.1079 Pollen (53,380 in / 114 out) |
| [pollinations#12332](https://github.com/pollinations/pollinations/pull/12332) — forehead-detective app | issues | 3 major: stale-round race in `runSingleTurn`; `askAi` commits responses without a round check; autoplay retries failures without bound | 0.1114 Pollen (51,169 in / 911 out) |
| [pollinations#12639](https://github.com/pollinations/pollinations/pull/12639) — Robot DJ app | issues | 2 major, 1 minor: crossfade deck can be reloaded mid-transition; duplicate track IDs from dropped folders; running UI hides auth recovery | 0.0927 Pollen (41,851 in / 902 out) |
| [NamanSoni78#11](https://github.com/NamanSoni78/pollinations/pull/11) — fork demo PR with a deliberately buggy helpers file | issues | 4: infinite retry loop; truncate off-by-one; `capitalize("")` crash; word count inflated by untrimmed whitespace | 0.0133 Pollen (1,331 in / 1,067 out) |

The last run pushed the full loop: the fix branch [`pr-fixer/11`](https://github.com/NamanSoni78/pollinations/tree/pr-fixer/11) contains one commit whose diff against the PR head is exactly the four corrections — including the untrimmed-split bug that was not planted on purpose. The race-condition findings on #12332/#12639 produced **no** auto-fix by design: those need design decisions, and the agent says so instead of patching around them.

Total spend for all six reviews: ≈ **0.53 Pollen**.

## What worked, what blocked, what agents would need

**Worked.** The one-call, structured-JSON review is reliable and cheap: every verdict above matched what the code actually does, findings cite real lines, and the honest "clean" on well-made PRs is the important behavior — a reviewer that invents problems is worse than none. Deterministic context assembly (diff + whole file at head) is what makes that possible; the model never guesses at repository state. The push path — branch, merge PR head, one commit on top — produces a genuinely ready diff, verified end to end on a real PR. Costs are low and predictable from the usage the API already reports.

**Blocked / worked around.**

- *Push credentials.* The platform gives a code agent the caller's Pollen and MCP tools, but no way for the agent owner to hold a GitHub credential. The quest's Composio connector route bills the caller's connection; a simpler and more deterministic path is a fine-grained PAT passed per request, scoped to one fork, which is what ships here. Both are caller-trust models; neither lets an agent own a long-lived identity.
- *No shell during review.* The `computer` tool exists for prompt agents, but the code-agent `respond()` runtime used here has no filesystem, so `git apply`/CI verification of the proposed fix is out of scope — the fix commit is constructed through the Git Data API instead, which works but cannot run the repo's tests before pushing.
- *GitHub API rate limits.* Anonymous reads are 60/h per IP. The agent degrades gracefully (a clear error naming the reset time), and any token on the request lifts the limit, but a busy deployment would want a server-side authenticated proxy.

**Agents would need** three things to do this fully autonomously: an owner-scoped GitHub identity (or first-class Composio tool use inside code agents) so pushes don't require caller credentials; a sandbox to compile/lint the proposed fix against the real repository before pushing; and a long-run budget so a multi-PR watch (review every new pull request) is economical — at current prices that is already ≈0.1–0.2 Pollen per review, so the cost is not the blocker.

## Tests

```bash
node --test agent.test.ts
```

Thirteen tests cover link and JSON input parsing, hunk-range extraction, context selection (whole file vs hunk surroundings), prompt assembly, model-output parsing (raw and fenced JSON, junk entries dropped), usage/cost math, the patch-only-with-matching-finding rule, review rendering, and the full agent flow twice: issues-plus-push (mocked GitHub + model) and the clean verdict path.

## Deploy

This folder is the source of truth; a standalone repository for the code agent needs only `agent.ts` at its root. Fork/point a code agent at it (see [BUILD_YOUR_OWN_AGENT.md](../../BUILD_YOUR_OWN_AGENT.md)), then call it as a model. The demonstrations above ran the same logic through `openai/gpt-6.1-sol` directly.
