# PR Shepherd — review a PR, push a fix to your fork

A prompt agent for [#17245](https://github.com/pollinations/pollinations/issues/17245):
give it a pull request link, it reviews the change against the code
around it and pushes one proposed fix commit to a new branch of a fork
you control — so a maintainer reads a short review and a ready diff.

This is a prompt agent: `agent.json` is the whole submission
(`openai/gpt-6.1-sol` + Computer MCP). No code, no new service.

## Run

```bash
npx @pollinations/cli agents create \
  --config agent.json --name pr-shepherd --title "PR Shepherd"
```

```bash
curl https://gen.pollinations.ai/v1/chat/completions \
  -H "Authorization: Bearer $POLLINATIONS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "<github-username>/pr-shepherd",
    "messages": [{"role": "user", "content": "Review https://github.com/OWNER/REPO/pull/123. Push the fix to https://github.com/ME/REPO with token github_pat_..."}]
  }'
```

Without a fork and token it still reviews and returns the fix as a
unified diff.

## Flow

1. Parses owner/repo/number, fetches the `.diff` (never the
   rate-limited REST API), clones, checks out the PR head.
2. Reads changed files in full plus callers, tests, AGENTS.md.
3. Reports findings with `file:line`, or says nothing is wrong.
4. Smallest fix on `pr-shepherd/<n>-<slug>`, pushed to the fork
   (never the PR repo, never forced). Falls back to diff on 401/403.
5. Token lives in the one push command only — never echoed, stored,
   or committed. Short-lived, single-fork tokens recommended.

## What agents need to do this today (measured)

- **Push access is the boundary.** `computer` pushes to the shared
  collective-memory repo only. Fork pushes need the caller's
  fine-grained token (contents:write, one fork) passed in the prompt;
  a token in chat is visible to the provider and logs, so keep it
  short-lived and single-fork. The proper fix is a per-caller GitHub
  credential for `computer` (like Composio per-user connections).
- **Read via `.diff`, not the API.** Shared-egress REST calls hit 403;
  `github.com/<o>/<r>/pull/<n>.diff` returns 200.
- **Sandbox git is virtual** (`just-git`): no `ls-remote`, no long
  flags. Ten bash calls max per run; `--depth 50` clones.

## Verify

Three live runs on three real PRs with per-review Pollen cost —
full log in `demos/demo.md`.

`node apps/agent-pr-shepherd/test.mjs` checks the agent contract
(schema, model, MCP, push/token guardrails).
