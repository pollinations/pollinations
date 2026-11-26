---
name: model-management
description: "Add, update, rename, reroute, price, or remove Pollinations text, image, video, audio, embeddings, realtime, OCR, SVG, and 3D models. Use for model research, provider changes, capability or public-endpoint edits, and model PRs."
---

# Model management

Use this skill for Pollinations model changes. Make the smallest complete
change. Read the repository
[AGENTS.md](../../../AGENTS.md) and inspect the current registry, route, schemas,
and tests. Check related PRs and verify the exact provider deployment before
recommending a change. The [operating policy](references/operating-policy.md)
defines the defaults for route choice, catalog scope, economics, and fallbacks.

## Shared rules

- Before editing a model, obtain explicit confirmation of its complete model
  contract, including the exact primary route, price, access, and fallback
  decision. Use the [approval checklist](references/change-approval.md).
  Public API changes and secret mutations have separate approval requirements.
- Preserve the public contract unless the user approves a change. Use the
  [implementation reference](references/implementation.md#api-compatibility)
  for compatibility decisions and the existing shared fallback mechanism for
  approved fallback pairs.
- Bill from the provider's reported usage when available. For new models,
  provider or model-ID changes, and price changes, follow
  [billing verification](references/billing-verification.md).
- Probe the exact configured routes directly and through local Gen. Run the
  [applicable test matrix](references/change-and-test-matrix.md) and record the
  evidence in the PR using [verification and PR guidance](references/verification-and-prs.md).

## References

| Task | Read |
| --- | --- |
| Weekly review | [Scheduled tasks catalog](../../../operations/scheduled-tasks/README.md) and the job's runbook |
| Find code and run local Gen | [Repository and local testing](references/repository-and-local-testing.md) |
| Research exact routes, fallbacks, or an existing model | [Route research](references/route-research.md) |
| Change a registry entry, API contract, aliases, or provider onboarding | [Implementation](references/implementation.md) |
| Review release evidence, a dated hold, or a PR description | [Verification and pull requests](references/verification-and-prs.md) |
