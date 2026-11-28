# Model verification and pull requests

## Verify end to end

- Run the relevant rows in [change-and-test-matrix.md](change-and-test-matrix.md).
- For new models and provider/model-ID changes, run the full declared-modality matrix and [billing-verification.md](billing-verification.md).
- Test aliases, permissions, errors, caching, capacity, and `/models` metadata.
- Check the affected model on the Pollinations website. For models offered in Play, verify the model appears in each applicable picker filter (for example, Image → SVG for native SVG output), then check inputs and defaults. Submit through Play and inspect the result using the same sample as the API check. For renames or removals, check saved links, picker fallback and stale overrides. For pricing changes, check the displayed rates and distinguish them from historical request costs. For models outside Play, verify the relevant website listing. Record the website checks in the PR.
- When a fallback is configured, probe it directly and run the same applicable E2E matrix through a forced fallback, including capabilities, parameters, permissions, cache behavior, billing, provider attribution, errors, and expected burst. When no fallback is approved, record the researched candidate and rejection reason.
- Verify all media is fully returned within the supported request-lifetime budget, including the durable-media checks when applicable.
- Record exact evidence and uncertainty in the PR.
- Before releasing a new provider, read back the actual Drive journals with
  existing authorized access, confirm the provider IDs match the Economics
  registry, and verify the dashboard loads with that snapshot. Public GitHub CI
  uses synthetic data and does not need Drive credentials. Missing onboarding
  or unavailable private validation blocks release; never rely on the dashboard
  failing at runtime to enforce this check.

## Open the PR

Before publishing:

- Format changed files with the repository formatter.
- Run focused tests and type checks for every touched service.
- Review the complete diff for unrelated changes and dead code.
- Write the description in the format below.
- Leave the PR draft when a live, quota, latency, safety, or product decision remains unresolved.

### Scheduled merges and holds

- Apply the repository's `MERGE-HOLD` label and keep the PR draft whenever a model change must wait for a date, provider confirmation, or another unresolved prerequisite. Do not enable auto-merge while held.
- Start every held model PR title with `🕒 YYYY-MM-DD | <type>: <change>` using the earliest planned merge date. If that date is unconfirmed, use `🕒 DATE TBD | <type>: <change>`. Never put the clock/date only at the end or infer a date from an older model's promotion.
- Put the earliest merge date, provider source, exact cutoff/timezone (or explicitly unknown), hold reason, and release conditions at the top of the description. Distinguish the merge date from the production effective date; a date alone does not authorize merging or deployment.
- Verify successor prices for the exact model and each serving route. Mark unconfirmed rates as unconfirmed; do not present an older model's rates or a free placeholder as verified future pricing.
- Prioritize passed merge dates during triage, but recheck provider facts, dependencies, current CI and required live validation before lifting a hold. Unknown dates need clarification, not an invented deadline.
- Remove `MERGE-HOLD` and mark ready only when all release conditions are met and the merge is authorized. Keep the clock/date prefix for scheduled changes so their timing remains visible.

### PR description

Decision first, at most ~150 words, no narrative:

```md
**Decision:** ready to merge | needs your call: <question>

`<model ID>` · effective on production deploy | YYYY-MM-DD HH:MM UTC

| | Before | After |
| --- | --- | --- |
| Access | | |
| Price (USD per unit) | | |
| Primary · cost | | |
| Fallback · cost | | |
| Promo | | |
| Capabilities | | |

**Verified:** <routes × capabilities> · provider charge = our cost · wallet = price
**Flags:** <only if action is needed>
```

- Take values from code, catalog and live provider. Write `same` if unchanged, `none` if absent.
- Below the description, outside the word limit, add a collapsed `<details>` table with one row per tested parameter value or capability: route, request, result, billed units.
- For a discounted cost, put the end date and the cost after it in the Promo row and link the dated PR that restores the normal rate.
- End each cost cell with `= price`, `below price` or `above price ⚠`.
- Retirement, once decided: add the row below; the news pipeline parses it. Postpone with a new row, withdraw with `Cancelled`, never move a date earlier. Note a provider's route deadline as a code comment, not in the registry.

| Model | Action | Change | Before | After | Effective |
| --- | --- | --- | --- | --- | --- |
| `<model ID>` | RETIRE | Availability | Available | Retired | YYYY-MM-DD HH:MM UTC |

## Completion gate

A model change is not complete until all applicable statements are true:

- The configured model, aliases, provider, route, price, access, modalities, and capabilities match the approved contract.
- Direct-provider and local E2E requests passed for every declared surface.
- The best fallback candidate and use/decline decision are documented; every configured fallback passed direct and forced-fallback E2E verification.
- No existing capability disappeared unless explicitly approved.
- Every non-zero usage field is accounted for and billed at the confirmed rate,
  from the provider's reported usage whenever the route reports it.
- Malformed or rejected requests return useful 4xx responses rather than opaque 5xx responses.
- Capacity and media latency fit the expected production load.
- The catalog description is developer-facing, does not repeat the title, and the publisher logo resolves.
- No public API surface was added or changed without its separate explicit confirmation.
- No unapproved secret or deployment mutation occurred.
- The PR contains only this model or tightly coupled family.
