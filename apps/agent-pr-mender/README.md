# PR Mender

Give it a pull request link. The agent fetches the PR metadata and diff over
the GitHub API, reads the surrounding code at the PR head sha, reviews for
correctness bugs and regressions, and - when it finds one - pushes a fix
bundle (`review.md`, `fix.diff`, corrected files at their repo paths) to a new
`pr-mender/pr-<N>-fix` branch on
[pollinations/collective-memory](https://github.com/pollinations/collective-memory),
the shared repository the computer tool can push to. If nothing is wrong, it
says SHIP and stops.

- Base model: `openai/gpt-6.1-sol`; MCP servers: `computer`
- Callable model: `community/afanasevmylife/pr-mender`
- Demo transcripts and platform findings:
  https://github.com/afanasevmylife/pr-mender-demos

## Three real PRs

| PR | Verdict | Tool calls | Cost |
| --- | --- | --- | --- |
| #17123 | FIX: the SSE parser isn't flushed at end of stream; [fix branch](https://github.com/pollinations/collective-memory/tree/pr-mender/pr-17123-fix) | 11 | 0.128 Pollen |
| #17115 | SHIP | 8 | 0.091 Pollen |
| #16953 | SHIP | 10 | 0.090 Pollen |

## What blocked it

- `computer` can push only to collective-memory; a fork returns HTTP 401.
  Composio's GitHub tools can commit to a fork the caller has connected.
- This monorepo's symlinks stop it from being cloned in the sandbox, so the
  agent reads files over HTTPS instead.
- Unauthenticated api.github.com calls from the sandbox soon get 403.
- A run ends at its tool-call limit, so the prompt budgets 25 calls and keeps
  the last 3 for commit, push and summary.

Built for quest #17245.
