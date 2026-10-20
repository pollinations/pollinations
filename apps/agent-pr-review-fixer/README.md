# PR Review Fixer

A code agent for [quest #17245](https://github.com/pollinations/pollinations/issues/17245). Send it a pull request link; it reviews the change with the full text of the changed files and pushes a proposed fix commit to a new branch of a fork you control, so a maintainer reads a short review and a ready diff.

The agent is code, not a long prompt. The model does one job: judge the change and propose exact search/replace edits. Everything else is deterministic:

1. Parse the PR link, an optional fork URL and an optional GitHub token from the message.
2. Read the PR, its patches and the head-revision text of the most changed files (up to 12) from the GitHub API. Files up to 30 KB go to the model in full, larger ones as line-numbered excerpts 40 lines around each hunk. Files that cannot be loaded are reviewed from their patch and listed in the report.
3. A `/v1/responses` call to `openai/gpt-6.1-sol` with line-numbered files. The token is removed from all text before it reaches the model. PR text and code are framed as data, not instructions.
4. If the model needs code it was not shown (the rest of a large file, a caller, a test, a type), it answers with `reads` instead of a verdict: up to 6 line ranges of any file at the PR head, 400 lines each. The agent fetches them, redacts tokens, and calls the model again with the code under `READ`. It can ask twice; the third call must give the verdict, and if it still does not, the reply says "no verdict" and pushes nothing. A file it read can be edited like a changed file.
5. Apply each edit only if its `find` text occurs exactly once in the file. Edits that do not match are dropped and reported, never fuzzed.
6. If a fork and token were sent, create one commit whose parent is the PR head and point a new branch `pr-fixer/<owner>-<repo>-<n>-<sha7>` at it, with the Git Data API. It never updates or force-moves an existing ref. Without a token, the report contains the diff and nothing is written.
7. Reply with verdict, `file:line` findings, the reads it made, branch, compare link, a diff that `git apply` accepts, and the review's token usage and cost (all calls) from live catalog prices. A verdict of "nothing wrong" pushes nothing.

Chat Completions and Responses requests both work.

## Use

```bash
curl https://gen.pollinations.ai/v1/chat/completions \
  -H "Authorization: Bearer $POLLINATIONS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"<github-username>/pr-review-fixer","messages":[{"role":"user","content":"Review https://github.com/pollinations/pollinations/pull/123"}]}'
```

**Default: no GitHub token at all.** The agent reads the PR anonymously and replies with the review and a diff that `git apply` accepts, plus the exact commands to apply it (`gh pr checkout 123 --repo pollinations/pollinations && git apply fix.patch`). A maintainer applies the diff and pushes it to the PR branch with their own access; GitHub allows that when the author leaves "Allow edits from maintainers" on, which is the default. The agent never posts a comment, so nothing about the run is public until someone pushes.

**Optional: push a branch for you.** Add a fork URL and a fine-grained token to the same private request (`... and push to https://github.com/me/pollinations with github_pat_...`). The fork must contain the PR head commit. A GitHub fork of the base repository has it once you fetch it (`git fetch upstream pull/123/head && git push origin FETCH_HEAD:refs/heads/pr-123`), or for PRs opened from your own fork it is already there.

The token goes only in that private API request. Never paste it in a PR, issue or any other public place: the agent reads it from the request, and it never posts a comment anywhere. Only a fine-grained token (`github_pat_...`) is used, because it can be limited to one repository. Give it **Contents: read and write** on that fork only and a short expiry, and revoke it after the run. A classic token (`ghp_...`) can write to every repository of its owner, so the agent removes it from the text and does not push with it.

## Deploy

Put `agent.ts` at the root of a public repository and create a code agent from it (`code-agent.json`: `{"type":"code_agent","repository":"https://github.com/<you>/pr-review-fixer"}`, then `npx @pollinations/cli agents create --config code-agent.json`).

## Test

```bash
node --test agent.test.ts
```

The tests use real code with GitHub and model doubles: request parsing and token redaction, exact-once edit application and a diff that `git apply` accepts, the verdict contract, hunk excerpts for large files, reads on request (path checks, token redaction, the round limit, editing a file it read), the three Git Data writes (tree, commit on the PR head, new ref) with the token only in the GitHub `Authorization` header, the no-token and nothing-wrong paths, and both response shapes.

## Live runs

[`demos/live-runs.md`](demos/live-runs.md) has four live runs with their cost. One is a planted bug that got reviewed, fixed and pushed for 0.0023 Pollen on GPT-6.1 Sol. Three are merged upstream PRs. Rerun one with `POLLINATIONS_API_KEY=... GITHUB_TOKEN=... node demos/run-live.mjs <pr-url> [model] [fork-url]`.

## What works, what blocks

- **Reading a PR works today** with anonymous GitHub API calls (60 requests/hour per IP; a token raises it). A run makes 2 + one per loaded file, plus one per file read on request.
- **Pushing is the boundary.** Pollinations has no per-caller GitHub write credential. `computer` pushes only to the shared collective-memory repository, and Composio's GitHub connection is reachable from MCP tools but not as a git credential. So the caller sends a short-lived fine-grained token in the request. The agent removes every GitHub token from the PR text, patches and files before the prompt is built, keeps it out of the reply, and sends it only in the `Authorization` header to `api.github.com`. The request itself still passes through the gateway, so this is a workaround, not a safe default. What agents need: a per-user GitHub connection the agent runtime can use for scoped writes, like Composio connections, so no token travels in a request.
- **Running the repo's tests is missing.** Code agents run in a Worker with no shell, and `computer` has no Node or Python. The fix is proposed and diffed, not tested; the review says so instead of claiming checks.
- **Context of large files.** Files over 30 KB start as excerpts 40 lines around each hunk, so the first call is small. When a fix needs more, the model asks for the lines it wants (step 4) and gets them before it answers; an edit still applies only if its `find` text matches the full file exactly once. The limits (2 read rounds, 6 ranges of 400 lines each) keep the cost and the run time bounded. Searching the repository is not there yet: the model has to name the file it wants.
- **Long runs.** At most three model calls keep a review well under Worker time limits; a multi-step "fix, test, retry" loop would need a sandbox with language runtimes.
- **Cost.** Input dominates: GPT-6.1 Sol is 2 Pollen per million input tokens and 10 per million output tokens. A small PR cost 0.0023 Pollen; a 20k-token review comes to about 0.04 plus output. The reply prints the exact figure for each run.
