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

Look for the provider's own count before writing usage math. Check the
response body and headers for a usage block or billed quantity, such as fal's
`x-fal-billable-units`, and bill from it. Derive units from request parameters
only when the route reports none. Then compare real requests with the
provider's billing records before merging: providers round, apply minimums,
and multiply by parameters in ways their docs may not show.

Media bodies never reach the billing parser. An image or video handler returns
the provider's quantity in `trackingData.usage`, or in
`trackingData.pricingInput` when it refines a pricing input, such as a fallback
that pays per megapixel while the caller pays per image.

If upstream returns a new numeric billing field, extend the usage contract and observability path or document why the provider bundles it into an existing billed field. Never silently discard a separately billed field.

## Price calculation

- Verify input, output, cached input, reasoning, image, audio, video, duration, resolution, and provider tool charges independently when the route reports them.
- Confirm the user-approved `priceMultiplier` separately from provider cost.
- Calculate expected price from observed usage and compare it with response headers/body and Tinybird. Allow only the repository's normal rounding.
- Do not change the multiplier to hide incomplete usage accounting.
- Do not guess unposted units or derive a price from an unrelated provider.
- To check whether a past pricing change really shipped, read the code deployed at that
  revision and the billed `generation_event_v2` events around it. A PR title or
  announcement is not evidence; a same-day multiplier or promotion change can cancel the
  advertised effect.

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
- For production SQL, use `enter.pollinations.ai/observability/scripts/tb-prod.sh` with `FORMAT JSON`; it rejects failed queries. Enable `set -o pipefail` when piping its output so the failure reaches the caller.
- Confirm every non-zero unit has a corresponding count and price column and that total cost/price reconcile.
- A provider's account usage also counts staging and manual probes that share
  the key. Compare request count and quantity for a short isolated window
  before trusting a whole-period ratio.
- Attribute cost to a provider by `model_provider_used`. `model_used` can omit
  a fallback's provider suffix.
- Tail the worker during the probe. Any missing conversion warning means a billable line may be priced at zero and blocks merge.

## Acceptance

- Exact current provider price is evidenced.
- Every billable upstream unit is represented or explicitly documented as bundled.
- Response usage, headers, Tinybird, and logs agree.
- Provider/route attribution is correct, including fallbacks.
- Cache MISS/HIT behavior is understood.
- No billing uncertainty is hidden by a multiplier or model-specific workaround.
