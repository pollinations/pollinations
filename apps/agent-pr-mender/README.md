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
- Demo transcripts (three real merged PRs from this repo, with per-review
  Pollen cost) and platform findings:
  https://github.com/afanasevmylife/pr-mender-demos

Built for quest #17245.
