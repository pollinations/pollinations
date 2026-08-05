# Billing and usage verification

Use this for every new model, provider/model-ID change, or price change. Provider pricing must come from the exact route's current official source; aggregator or model-lab prices do not prove another provider's rate.

## Contract

For every real cache-miss request:

1. Capture the complete upstream usage or provider billing block.
2. Map every non-zero billable field into Pollinations' typed usage contract in `shared/registry/usage-headers.ts`.
3. Confirm the registry cost block has the matching exact-route rate.
4. Confirm the public response usage/body or `x-usage-*` headers carry the mapped units.
5. Confirm the `generation_event_v2` row contains the same units, provider attribution, cost, multiplier, and final price.
6. Confirm logs contain no `Missing conversion rate` warning.

If upstream returns a new numeric billing field, extend the usage contract and observability path or document why the provider bundles it into an existing billed field. Never silently discard a separately billed field.

## Price calculation

- Verify input, output, cached input, reasoning, image, audio, video, duration, resolution, and provider tool charges independently when the route reports them.
- Confirm the user-approved `priceMultiplier` separately from provider cost.
- Calculate expected price from observed usage and compare it with response headers/body and Tinybird. Allow only the repository's normal rounding.
- Do not change the multiplier to hide incomplete usage accounting.
- Do not guess unposted units or derive a price from an unrelated provider.

## Provider and fallback attribution

- Registry provider means configured primary route.
- Selected/used provider means the backend that actually served a request.
- For a fallback request, verify attempt attribution, selected provider, actual provider cost, and user price under the approved fallback economics.
- Provider-managed routing may obscure the physical backend; document the observable identity rather than inventing one.

## Cache behavior

- Verify prompt caching empirically; if the second identical long-prefix request reports cached tokens, the cost block must account for them.
- Verify output cache with a genuine MISS followed by a byte-identical HIT.
- Cache hits may intentionally produce no billable Tinybird row. Media cache hits may omit usage headers while text cache behavior can differ. Check the current implementation before filing a billing defect.
- Never use a cache hit as the only billing probe.

## Tinybird and logs

- Local/dev and staging traffic use the staging workspace; production traffic uses production.
- Query `generation_event_v2` for the exact model and request time. `model_health` is for health/latency, not billing detail.
- Confirm every non-zero unit has a corresponding count and price column and that total cost/price reconcile.
- Tail the worker during the probe. Any missing conversion warning means a billable line may be priced at zero and blocks merge.

## Acceptance

- Exact current provider price is evidenced.
- Every billable upstream unit is represented or explicitly documented as bundled.
- Response usage, headers, Tinybird, and logs agree.
- Provider/route attribution is correct, including fallbacks.
- Cache MISS/HIT behavior is understood.
- No billing uncertainty is hidden by a multiplier or model-specific workaround.
