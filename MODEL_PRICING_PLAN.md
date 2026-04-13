# Model Pricing Plan

## PR1: remove `serviceId`

- Use the registry key as the canonical model identifier.
- Remove the extra `serviceId` layer from shared registry helpers.
- Stop keying cost lookup by provider `modelId`; use the public model name instead.
- Keep provider-specific `modelId` only where it is actually needed.
- Update tracking and registry lookups so both cost and price are keyed by the same public model key.
- Preserve aliases and existing public model names.

## PR2: add `price`

- Add `price?: PriceDefinition[]` next to `cost` in registry entries.
- Fallback rule: if `price` is missing, use `cost`.
- Keep `cost` as internal/provider cost and `price` as user-facing billing value.
- Update model-info and pricing/dashboard consumers to read `price`, not raw `cost`.
- Add regression tests for:
  - `price` omitted => `price === cost`
  - `price` present => `price` can differ from `cost`

## Notes

- Keep this split minimal. No broader billing or analytics rename in these PRs.
- Existing `totalCost` and `totalPrice` tracking can stay; this change is mainly registry shape and lookup cleanup.
