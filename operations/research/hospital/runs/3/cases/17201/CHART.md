# Case 17201
All timestamps UTC. Notes below are append-only and sentinel tagged. Source, prompts, raw logs, test evidence and machine state live beside this chart.

<!-- HOSPITAL:ADMISSION -->
2026-10-12 20:56:13 UTC

Kind: pr
Start: 2026-10-12 20:56:13 UTC
Branch: hospital/17201
Base: 90e652b5d0b7d30af6a71f2631cb4f12fc68579e
Source: https://github.com/pollinations/pollinations/pull/17201
fix(ui): Edit and Delete key buttons open their dialogs on touch screens
Open PRs that mention this case: none in cache

<!-- HOSPITAL:HANDOFF -->
2026-10-12 20:56:13 UTC

Static check, no model run: the diff changes what packages/ui ships without bumping its package.json version (AGENTS.md: published packages bump their version, including their own package-lock.json).
