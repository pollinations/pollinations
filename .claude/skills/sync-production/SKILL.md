---
name: sync-production
description: Promote Pollinations main to production through the required promotion PR and GitHub Actions. Use when asked to merge main into production, deploy main to production, or sync production.
---

# Sync Production

Follow the Git workflow, production deployment, and secret-safety rules in root `AGENTS.md`.

- Inspect current `main` and `production` revisions and the complete pending diff. Reuse an open `main` → `production` promotion PR, or create one for the requested promotion.
- Check changed Tinybird datasources and pipes in the pending diff. Use bounded production queries and endpoint calls to verify the required schema in `pollinations_enter`. Tinybird is deployed separately: missing resources or failed probes block promotion. Follow `tinybird-deploy` for authorized changes.
- Compare pending D1 migrations with production migration history. Verify that `.github/workflows/deploy-cloudflare-production.yml` applies them before the affected Workers deploy, and that old Workers remain compatible during that interval. Record both data checks and any blockers in the promotion PR body.
- Check the current PR head, required checks, conflicts, and deployment prerequisites. Merge through the PR when authorized and checks pass; resolve or report blockers within that workflow.
- Follow the resulting GitHub Actions deployments. When path filters do not trigger the required production workflow, dispatch it from `production` as specified in `AGENTS.md`.
- Verify the deployed revision, required bindings, and affected behavior; report any incomplete verification.
- The production deploy re-pushes unchanged, already-approved secrets; that is not a rotation and needs no new approval. A new or changed value does. Per-Worker secret checks: `enter-services` skill.
