---
name: changelog-from-git
description: Turn a git log range into user-facing release notes via the Pollinations text API. Use when asked to write a changelog, release notes, "what changed since vX", a PR description covering many commits, or a weekly digest. Dogfoods the polli CLI.
allowed-tools: Bash(git *), Bash(polli *), Bash(jq *), Read, Write
---

# changelog-from-git

Pipe `git log` into `polli text` to draft release notes. Pure dogfooding — the same thing every Pollinations user does with our text API, packaged as a skill.

## When to use

- "Write a changelog for the last release"
- "Summarize what changed since v1.2.3 / since last Friday / since `main` diverged"
- "Draft a PR description — the branch has 20 commits"
- Weekly / sprint digest for the team
- Before tagging a release

## Quick reference

| Intent | Command |
|---|---|
| Changelog since last tag | `scripts/changelog.sh` |
| Since a specific ref | `scripts/changelog.sh v1.2.3..HEAD` |
| For a single branch | `scripts/changelog.sh main..HEAD` |
| Last N days | `scripts/changelog.sh --since '7 days ago'` |
| Scoped to a path | `scripts/changelog.sh -- packages/sdk/` |
| PR description | `scripts/changelog.sh --style pr main..HEAD` |
| Raw commits only (no LLM) | `scripts/changelog.sh --raw` |

Styles:

- `release` (default) — grouped by `feat` / `fix` / `docs` / `chore`, user-facing voice, no issue numbers inline
- `pr` — "## Summary" + bullets, ready to paste into `gh pr create --body`
- `digest` — narrative paragraph suitable for Slack / email, links key PRs

## How it works

1. `git log --pretty=format:...` over the requested range, capturing subject, body, author, files changed.
2. Filter out merge commits and noise (dependabot, auto-formatters) unless `--all` is passed.
3. Send the list to `gen.pollinations.ai/v1/chat/completions` via `polli gen text` with a style-specific system prompt.
4. Print markdown to stdout — pipe to `gh pr edit`, `gh release create --notes-file -`, or a file.

## Recipes

```bash
# Release notes for the next tag, write to CHANGELOG_NEW.md
scripts/changelog.sh > CHANGELOG_NEW.md

# PR description for the current branch
scripts/changelog.sh --style pr main..HEAD | gh pr edit --body-file -

# GitHub release from last tag
PREV=$(git describe --tags --abbrev=0)
scripts/changelog.sh "${PREV}..HEAD" | gh release create "v$(date +%Y.%m.%d)" --notes-file -

# Weekly digest to paste in Discord
scripts/changelog.sh --style digest --since '7 days ago'

# Scoped: only changes touching enter.pollinations.ai
scripts/changelog.sh --style release --since '30 days ago' -- enter.pollinations.ai/
```

## Writing style the prompt enforces

(See [scripts/prompts/](scripts/prompts/).)

- Bullets start with a verb ("Add X", "Fix Y", "Remove Z").
- Group by type if `release` style: `### Features / Fixes / Docs / Chores`.
- No marketing adjectives ("revolutionary", "blazing fast"). Per [AGENTS.md](../../../AGENTS.md) communication style.
- Under 200 words for PR style.
- Link PR / issue numbers at the end of the bullet, not inline: `... (#1234)`.
- Collapse dependabot / version bumps into one line: "Upgrade 12 dependencies".

## Gotchas

- **Requires `polli` CLI configured** — run `polli auth status` once. See the `polli` skill in this folder.
- **Long ranges cost pollen.** Ranges over 500 commits: pass `--summarize-first` to chunk + summarize recursively instead of jamming everything into one call.
- **Don't trust it for security-sensitive changelogs.** LLM may downplay severity. Read the output and promote anything auth/billing/crypto-related to the top by hand.
- **Commit hygiene matters.** Garbage in, garbage out — if the repo has "fix" / "wip" / "update" subjects, the output will too. This skill doesn't invent meaning that isn't in the commits.
- **Use `--model gemini-search` (web-search) for "since vX what did users report" prompts** — it can pull in issue discussion. Default model is tuned for summarization, not retrieval.
- **PR style assumes one branch.** For multi-branch aggregation (release train), concatenate first: `git log branch-a branch-b --not main`.

## Related

- [polli skill](../polli/SKILL.md) — underlying CLI
- [web-research skill](../web-research/SKILL.md) — when you need web-grounded context beyond the commits
- `commit-push-pr` (Claude Code built-in) — for just pushing the branch after the changelog is written
