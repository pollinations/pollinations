# pr-fixer

Takes a pull request link, reviews the change with the code around it, and pushes one proposed fix commit to a new branch of a fork the caller controls. Addresses [quest #17245](https://github.com/pollinations/pollinations/issues/17245).

A prompt agent: `openai/gpt-6.1-sol` plus the `computer` MCP server (bash, `/workspace`). No code to install.

## Run

```bash
npx @pollinations/cli agents create --config agent.json --name pr-fixer --title "PR Fixer"

curl https://gen.pollinations.ai/v1/chat/completions \
  -H "Authorization: Bearer $POLLINATIONS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "<github-username>/pr-fixer",
    "messages": [{"role": "user", "content": "Review https://github.com/OWNER/REPO/pull/123. Push the fix to https://github.com/ME/REPO with token github_pat_..."}]
  }'
```

Without a fork and token it still reviews and returns the fix as a unified diff.

## Flow

1. Reads PR metadata from the GitHub API, clones the repo, fetches `pull/<n>/head`, diffs against the base.
2. Reads changed files in full, their callers and tests, and the repo's contribution guide.
3. Reports findings with `file:line`, or says nothing is wrong and pushes nothing.
4. Commits the smallest fix on `pr-fixer/<n>-<slug>` and pushes it to the fork (never the PR's repository, never forced).
5. Reports verdict, findings, branch/SHA or diff, checks run, blockers.

## What agents need to do this today

- **Push access is the boundary.** The `computer` tool pushes to the shared collective-memory repository only; it has no credentials for a fork. The agent therefore takes a fine-grained token (contents: write on the fork only) from the caller's message, uses it in one push command, and is told never to echo or store it. A token in a chat message is visible to the model provider and request logs; use a short-lived token scoped to one fork. The proper fix is a per-caller GitHub credential for `computer` (like the Composio per-user connections), so no token travels in the prompt.
- **Composio GitHub** can read PRs and open branches with the caller's own connection, but it works file by file through the API; shell checks (tests, lint) need `computer`.
- **Long runs and size.** Cost scales with diff size and the number of files read. The prompt caps a run at ten bash calls and restricts review to the likeliest files above 40 changed files or 150 KB of diff; large monorepo clones use `--depth 50`.
- **Not yet shown.** This PR ships the agent and a contract test (`node --test test.mjs`); it does not include live runs or per-review cost, because the author had no authenticated Pollinations account available to register and call the agent.
