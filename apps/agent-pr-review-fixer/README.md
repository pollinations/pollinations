# PR Review Fixer

A code agent for [quest #17245](https://github.com/pollinations/pollinations/issues/17245). Send it a pull request link; it reviews the change with the full text of the changed files and pushes a proposed fix commit to a new branch of a fork you control, so a maintainer reads a short review and a ready diff.

The agent is code, not a long prompt. The model does one job: judge the change and propose exact search/replace edits. Everything else is deterministic:

1. Parse the PR link, an optional fork URL and an optional GitHub token from the message.
2. Read the PR, its patches and the head-revision text of the most changed files (up to 12) from the GitHub API. Files up to 30 KB go to the model in full, larger ones as line-numbered excerpts 40 lines around each hunk. Files that cannot be loaded are reviewed from their patch and listed in the report.
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

The fork must contain the PR head commit. A GitHub fork of the base repository has it once you fetch it (`git fetch upstream pull/123/head && git push origin FETCH_HEAD:refs/heads/pr-123`), or for PRs opened from your own fork it is already there.

The token goes only in the private API request above. Never paste it in a PR, issue or any other public place: the agent reads it from the request, and it never posts a comment anywhere. Only a fine-grained token (`github_pat_...`) is used, because it can be limited to one repository. Give it **Contents: read and write** on that fork only and a short expiry, and revoke it after the run. A classic token (`ghp_...`) can write to every repository of its owner, so the agent removes it from the text and does not push with it.

## Deploy

Put `agent.ts` at the root of a public repository and create a code agent from it (`code-agent.json`: `{"type":"code_agent","repository":"https://github.com/<you>/pr-review-fixer"}`, then `npx @pollinations/cli agents create --config code-agent.json`).

## Test

```bash
node --test agent.test.ts
```

The tests use real code with GitHub and model doubles: request parsing and token redaction, exact-once edit application and the diff, the verdict contract, hunk excerpts for large files, the three Git Data writes (tree, commit on the PR head, new ref) with the token only in the GitHub `Authorization` header, the no-token and nothing-wrong paths, and both response shapes.

## Live runs

[`demos/live-runs.md`](demos/live-runs.md) has four live runs with their cost. One is a planted bug that got reviewed, fixed and pushed for 0.0023 Pollen on GPT-6.1 Sol. Three are merged upstream PRs. Rerun one with `POLLINATIONS_API_KEY=... GITHUB_TOKEN=... node demos/run-live.mjs <pr-url> [model] [fork-url]`.

## What works, what blocks

- **Reading a PR works today** with anonymous GitHub API calls (60 requests/hour per IP; a token raises it). A run makes 2 + one per loaded file.
- **Pushing is the boundary.** Pollinations has no per-caller GitHub write credential. `computer` pushes only to the shared collective-memory repository, and Composio's GitHub connection is reachable from MCP tools but not as a git credential. So the caller sends a short-lived fine-grained token in the request. The agent removes every GitHub token from the PR text, patches and files before the prompt is built, keeps it out of the reply, and sends it only in the `Authorization` header to `api.github.com`. The request itself still passes through the gateway, so this is a workaround, not a safe default. What agents need: a per-user GitHub connection the agent runtime can use for scoped writes, like Composio connections, so no token travels in a request.
- **Running the repo's tests is missing.** Code agents run in a Worker with no shell, and `computer` has no Node or Python. The fix is proposed and diffed, not tested; the review says so instead of claiming checks.
- **Context of large files.** Files over 30 KB are shown as excerpts 40 lines around each hunk. The model is told to edit only the lines it was shown, and an edit applies only if its `find` text matches the full file exactly once. So the agent can fix code near the change but has no reliable view of the rest of a large file. A problem that needs more context should come back as a finding without a matching edit. Reading more on demand would need a tool loop (read a file, search the repository) over the GitHub API. A code agent can run that loop, but each read costs one more model step.
- **Long runs.** One model call keeps a review well under Worker time limits; a multi-step "fix, test, retry" loop would need a sandbox with language runtimes.
- **Cost.** Input dominates: GPT-6.1 Sol is 2 Pollen per million input tokens and 10 per million output tokens. A small PR cost 0.0023 Pollen; a 20k-token review comes to about 0.04 plus output. The reply prints the exact figure for each run.
