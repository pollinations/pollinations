---
name: api-repair
description: Diagnose and repair shared Pollinations API regressions in Gen or Enter, including request validation, authentication, streaming, and client compatibility. Use model-debugging for failures isolated to a model or upstream route.
---

# Pollinations API repair

1. Start with the failing endpoint, request shape, expected result and deployed
   revision. Check open issues and PRs for an existing fix. Compare the current
   route and OpenAPI source with the last known working behavior and current
   compatibility reference when relevant.
2. Trace the shared route, middleware and response handling that own the failure.
   Use [model-debugging](../model-debugging/SKILL.md) for scoped production logs and
   Tinybird context. Hand off failures isolated to a model or upstream route.
3. Restore the established contract with the smallest fix. Reproduce the defect
   through the normal local entry point and run the focused Gen or Enter tests.
   Follow the repository's approval rules for public contract changes and
   production deployments.

For a scheduled review, surface the highest-impact verified regression, affected
clients, evidence, existing fix or proposed next action in the API repairs chat.
