# PR Review Fixer

A code agent for [quest #17245](https://github.com/pollinations/pollinations/issues/17245). Send it a pull request link; it reviews the change with the full text of the changed files and pushes a proposed fix commit to a new branch of a fork you control, so a maintainer reads a short review and a ready diff.

The agent is code, not a long prompt. The model does one job: judge the change and propose exact search/replace edits. Everything else is deterministic:

1. Parse the PR link, an optional fork URL and an optional GitHub token from the message.
2. Read the PR, its patches and the full head-revision text of the most changed files (up to 12 files, 30 KB each) from the GitHub API. Larger files are reviewed from their patch and listed in the report.
3. One `/v1/responses` call to `openai/gpt-6.1-sol` with line-numbered files. The token is removed from all text before it reaches the model. PR text and code are framed as data, not instructions.
4. Apply each edit only if its `find` text occurs exactly once in the file. Edits that do not match are dropped and reported, never fuzzed.
5. If a fork and token were sent, create one commit whose parent is the PR head and point a new branch `pr-fixer/<owner>-<repo>-<n>-<sha7>` at it, with the Git Data API. It never updates or force-moves an existing ref. Without a token, the report contains the diff and nothing is written.
6. Reply with verdict, `file:line` findings, branch, compare link, diff and the review's token usage and cost from live catalog prices. A verdict of "nothing wrong" pushes nothing.

Chat Completions and Responses requests both work.

## Use

```bash
curl https://gen.pollinations.ai/v1/chat/completions \
  -H "Authorization: Bearer $POLLINATIONS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"<github-username>/pr-review-fixer","messages":[{"role":"user","content":"Review https://github.com/pollinations/pollinations/pull/123 and push to https://github.com/me/pollinations with github_pat_..."}]}'
```

The fork must contain the PR head commit. A GitHub fork of the base repository has it once you fetch it (`git fetch upstream pull/123/head && git push origin FETCH_HEAD:refs/heads/pr-123`), or for PRs opened from your own fork it is already there. Use a fine-grained token with **Contents: read and write** on that fork only, and a short expiry.

## Deploy

Put `agent.ts` at the root of a public repository and create a code agent from it (`code-agent.json`: `{"type":"code_agent","repository":"https://github.com/<you>/pr-review-fixer"}`, then `npx @pollinations/cli agents create --config code-agent.json`).

## Test

```bash
node --test agent.test.ts
```

The tests use real code with GitHub and model doubles: request parsing and token redaction, exact-once edit application and the diff, the verdict contract, the three Git Data writes (tree, commit on the PR head, new ref) with the token only in the GitHub `Authorization` header, the no-token and nothing-wrong paths, and both response shapes.

## What works, what blocks

- **Reading a PR works today** with anonymous GitHub API calls (60 requests/hour per IP; a token raises it). A run makes 2 + one per loaded file.
- **Pushing is the boundary.** Pollinations has no per-caller GitHub write credential. `computer` pushes only to the shared collective-memory repository, and Composio's GitHub connection is reachable from MCP tools but not as a git credential. So the caller sends a token in the message. The agent keeps it out of the model input and the reply, but the message itself still passes through the gateway. What agents need: a per-user GitHub connection the agent runtime can use for scoped writes, like Composio connections, so no token travels in a prompt.
- **Running the repo's tests is missing.** Code agents run in a Worker with no shell, and `computer` has no Node or Python. The fix is proposed and diffed, not tested; the review says so instead of claiming checks.
- **Long runs.** One model call keeps a review well under Worker time limits; a multi-step "fix, test, retry" loop would need a sandbox with language runtimes.
- **Cost.** Input dominates: about 2 Pollen per million input tokens on GPT-6.1 Sol, so a 20k-token review costs about 0.04 Pollen plus output. The reply prints the exact figure for each run.
