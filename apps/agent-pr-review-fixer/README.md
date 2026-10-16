# pr-review-fixer — reviews a pull request and produces the fix commit

A code agent that takes a GitHub pull request URL, reviews the diff with a
language model, and returns the review findings plus the unified-diff patch
and exact non-force push commands for the commit that fixes the most
important finding. Addresses
[quest #17245](https://github.com/pollinations/pollinations/issues/17245).

## How it works

- Input: the PR URL (or `owner/repo#N`) anywhere in the request text, over
  `/v1/responses` or `/v1/chat/completions`.
- The agent reads PR metadata and the full unified diff from GitHub's REST
  API **unauthenticated** — public PRs need no token, so the agent holds no
  secret.
- One model call (`kimi-k2.5`, falling back to `openai/gpt-5.4-nano`) returns
  a fenced JSON block: severity-ordered findings plus a minimal `git apply`-able
  patch for exactly one finding. Diffs above 120k chars are truncated and the
  truncation is reported in the answer.
- Output: JSON with `review.findings`, `review.fix.patch`,
  `review.fix.commands` (clone → fetch PR head → apply → commit → push
  without force) and `boundaries`.

## Automation boundaries

- Never merges a PR; merging stays a human or maintainer action.
- Never force-pushes; the emitted push writes only to the reviewed PR's head
  branch, as a fast-forward.
- Holds no GitHub credentials; the operator runs the push commands with their
  own credentials, so the platform cannot be used to write anywhere.
- Never writes outside the reviewed PR branch.

## Trace and tests

Every answer is a single JSON object: `ok`, `model`, `pr` (url, head ref and
SHA, author), `review` (summary, findings, fix patch, commands),
`diffTruncated`, `boundaries`.

Run `node --test agent.test.ts` with a current Node.js release.
Tests cover PR-reference parsing (URL and `owner/repo#N`), Responses and Chat
input extraction, lenient report parsing, diff capping, the non-force push
command set and the automation boundaries.

## Deploy

Copy this `agent.ts` to a public standalone repository (the repository name
becomes the model ID), then create the code agent in the dashboard
(Add Agent → Code agent) or with `npx @pollinations/cli agents create`.
Merging here does not update a standalone deployment.

```bash
curl https://gen.pollinations.ai/v1/responses \
  -H "Authorization: Bearer $POLLINATIONS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"hyyfree/pr-review-fixer","input":"Review https://github.com/OWNER/REPO/pull/N and fix the top finding."}'
```

The live demonstration for quest #17245 used a draft PR that injects one
small reviewable defect; the review output, the fix commit and the
verification run are attached to the quest PR description.
