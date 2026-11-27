---
name: steward
description: Repository rules for the /ship and /steward pull request watch in pollinations/pollinations.
---

Follow root `AGENTS.md` (Git Workflow, Testing, Code Style, Communication Style,
and all safety sections). For commits and PR text, follow
`.claude/commands/commit-push-pr.md`.

## Branches and pushes

- PRs target `main`. Never push to or target `production`; promotion is a
  separate PR (`.claude/skills/sync-production/SKILL.md`).
- Fix with follow-up commits. Never force-push or rewrite the branch.
- Never deploy, mutate secrets, or touch Tinybird/Cloudflare production from a
  watch, even when a failing check seems to need it. Report it instead.

## Reviewers

- Fix and reply to review comments in a short bullet or one line.
- Never re-request reviews, request new reviewers, or comment `polli`.

## Failing checks

- Reproduce locally with the narrowest command before pushing a fix:
  - Formatting/lint: `npx @biomejs/biome check --write <file>`.
  - Enter/Gen: `npm run test` from the service directory, one file at a time
    (`npx vitest run test/<file>.test.ts`). Enter needs `npm run decrypt-vars`
    first.
  - Other packages: their declared test runner.
- Fix the code, not the tests. Don't edit tests or snapshots to make them pass
  unless the change intentionally altered that behavior.
- A check that needs secrets or production access you lack: report it, don't
  work around it.
