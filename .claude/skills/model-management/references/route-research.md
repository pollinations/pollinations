# Model route research

Use this when evaluating a new model, a provider or route change, or a successor.
Read the [operating policy](operating-policy.md) before recommending a model or route.

## Load context first

1. Read the repository `AGENTS.md`.
2. Read the live registry entry, runtime config, handler, schemas, and tests. The repository is the source of truth for what Pollinations currently offers.
3. Read the relevant local active plan when present:
   - `temp/manage_inference.md`
   - `temp/manage_inferenceport.md`
   - `temp/manage_gpus.md`
   - `temp/manage_azure_limits.md`
4. Check GitHub for open or merged PRs that may already implement or conflict with the work.
5. Check current official provider documentation, catalog, pricing, availability, quotas, and deprecation notices. Then probe the exact route; the live response wins over documentation.

The `temp` plans are ignored operational state, not repository truth. When working in a linked worktree where they are absent, locate the primary checkout with `git worktree list` and read them there. Never copy balances, prices, PR statuses, quotas, or candidate rankings into this skill.

## Reconcile current state

- Resolve aliases to the canonical registry entry.
- API keys store model categories and canonical model IDs. A rename keeps
  working for keys that stored the old ID only while the old ID stays an
  alias. A model that changes category changes which restricted keys reach
  it; state that in the PR.
- Models served at `/alpha/decisions` use `category: "decision"`. Keys need
  `decision` on that route; on chat endpoints, `text` also allows them.
- Audit every modality registry and every model change merged to `main` since
  the current production revision; production can lag behind `main`.
- If a model or provider is missing from the registry, check `git log --all -- <path>`
  and `gh pr list --state merged --search <model>` before re-adding it — it may have been
  removed on purpose, added and reverted, or replaced.
- Trace every reachable runtime route and any configured fallback.
- Distinguish the configured provider from the provider that served an observed request.
- Compare the intended change with open PRs and active plan entries.
- Remove shipped work from active plans after production verification; do not keep a completed archive.

## Research the exact route

- Use official provider/model sources for release, model identity, pricing, regions, preview status, quotas, rate limits, context, inputs, outputs, tools, caching, and deprecation.
- Deduplicate the canonical model across providers.
- List material route differences. Equal model names do not prove equal capabilities.
- Probe the exact deployment and request shape Pollinations will use.
- For every addition or modification, run a fresh web search across provider catalogs and official documentation to discover viable fallback routes; do not rely only on repository integrations or remembered availability. Verify each serious candidate against its current official model page and pricing, then probe the exact route. Compare checkpoint identity, capabilities, parameters, formats, safety/privacy, availability, latency, price, permissions, and billing. Recommend the best candidate or state `none found`; never omit the fallback decision because the primary route is healthy.
- Inspect provider-managed routing/fallback defaults and controls. Report identity, capability, pricing, residency, and observability tradeoffs.

For direct Novita discovery, use the supported
[model catalog](https://docs.novita.ai/api-reference/model-apis-llm-list-models)
and [account quotas](https://docs.novita.ai/api-reference/quota-list) with an
existing authorized key. Quota queries require `modal=llm`; query `RPM` and
`TPM` separately with `productType=Public Endpoint` and the exact model as
`quotaObject`, then check the returned identity. The OpenAI-compatible base is
`https://api.novita.ai/openai/v1`; probe the exact upstream model using
[Chat Completions](https://docs.novita.ai/api-reference/model-apis-llm-create-chat-completion).
Request `stream_options.include_usage` for streaming and prove terminal usage,
cache/reasoning billing, capabilities and burst capacity through local Gen
before routing traffic. Gateway availability does not prove direct access or
independent capacity: OpenRouter/Vercel routes backed by Novita can share the
same upstream pool. Keep direct provider attribution and charges distinct from
gateway-billed traffic; use the Economics Novita connector guide for supported
billing sources. Preserve the existing public contract and fallback mechanism.
