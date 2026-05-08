# OpenRouter billing via REST API

Validated: **2026-05-06**. Re-validate if a command returns unexpected results.

## Requirements

- Runtime API key in `gen.pollinations.ai/secrets/prod.vars.json` as `OPENROUTER_API_KEY`.
- Management API key in `apps/operation/finance/secrets/.env` or shell as `OPENROUTER_MANAGEMENT_API_KEY`.
- `curl` and `jq` for local checks.

Runtime keys can call completions and `GET /api/v1/key`. Management keys cannot call completions; they are required for `/api/v1/credits` and `/api/v1/keys`.

## Known identifiers

Production runtime secret:

```bash
OPENROUTER_API_KEY=$(sops -d gen.pollinations.ai/secrets/prod.vars.json | jq -r '.OPENROUTER_API_KEY')
```

Finance/management secret:

```bash
OPENROUTER_MANAGEMENT_API_KEY=...
```

No Pollinations production text models are routed through OpenRouter by default.
When enabling one, add the model config, registry metadata, focused tests, and
a production smoke path in the same change.

## Querying spend and usage

### 1. Account credit pool

Requires management key. Returns account-level total purchased credits and all-time usage.

```bash
curl -sS https://openrouter.ai/api/v1/credits \
  -H "Authorization: Bearer $OPENROUTER_MANAGEMENT_API_KEY"
```

Response fields:

- `data.total_credits` - total credits purchased or granted.
- `data.total_usage` - all-time credits consumed.
- Remaining balance is `total_credits - total_usage`.

Finance integration: `apps/operation/finance/lib/providers/openrouter.mjs` stores `month_open_usage_usd` and derives current-month credit burn from the all-time usage delta.

### 2. Runtime key status and limit

Requires runtime key. Useful for quick auth checks and key-level usage counters.

```bash
curl -sS https://openrouter.ai/api/v1/key \
  -H "Authorization: Bearer $OPENROUTER_API_KEY"
```

Response fields:

- `data.limit` - credit limit for the key, or `null` if unlimited.
- `data.limit_remaining` - remaining key limit, or `null` if unlimited.
- `data.usage`, `usage_daily`, `usage_weekly`, `usage_monthly` - key usage counters.
- `data.rate_limit` is deprecated and safe to ignore.

### 3. API key inventory

Requires management key.

```bash
curl -sS https://openrouter.ai/api/v1/keys \
  -H "Authorization: Bearer $OPENROUTER_MANAGEMENT_API_KEY"
```

Use this to find the `hash` needed for delete/update operations. Match carefully by `label` and `name`; refuse to delete if ambiguous.

### 4. Model endpoint pricing and uptime

No auth required for public model endpoint metadata.

```bash
OPENROUTER_MODEL=qwen/qwen3.6-plus
curl -sS "https://openrouter.ai/api/v1/models/$OPENROUTER_MODEL/endpoints"
```

Key fields:

- `pricing.prompt`, `pricing.completion`, `pricing.input_cache_read`
- `context_length`, `max_completion_tokens`
- `supported_parameters`
- `status`, `uptime_last_5m`, `uptime_last_30m`, `uptime_last_1d`

## Runtime smoke tests

Direct OpenRouter:

```bash
curl -sS https://openrouter.ai/api/v1/chat/completions \
  -H "Authorization: Bearer $OPENROUTER_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"model\":\"$OPENROUTER_MODEL\",\"messages\":[{\"role\":\"user\",\"content\":\"reply ok\"}],\"max_tokens\":8}"
```

## Key creation and rotation

Requires management key. OpenRouter uses create-new, deploy, verify, delete-old.

Create:

```bash
curl -sS -X POST https://openrouter.ai/api/v1/keys \
  -H "Authorization: Bearer $OPENROUTER_MANAGEMENT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name":"pollinations-gen-prod","limit":3000,"limit_reset":null,"include_byok_in_limit":false}'
```

The response includes:

- `key` - the runtime key string; store once in SOPS as `OPENROUTER_API_KEY`.
- `data.hash` - the management identifier needed to delete/update the key later.

Delete:

```bash
curl -sS -X DELETE "https://openrouter.ai/api/v1/keys/$OPENROUTER_OLD_KEY_HASH" \
  -H "Authorization: Bearer $OPENROUTER_MANAGEMENT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{}'
```

Automated script: `tools/scripts/rotation/rotate-genai-openrouter.sh`.

## Credit / discount handling

OpenRouter credits are USD-denominated. Treat as a live credit pool in finance:

```json
{
  "_pools": {
    "OpenRouter": {
      "provider": "openrouter",
      "vendor_canonical": "OpenRouter"
    }
  }
}
```

The wrapper sets:

- `total_credits_usd`
- `total_usage_usd`
- `current_balance_usd`
- `mtd_total_usd`
- `mtd_credit_usd`
- `mtd_cash_usd` = `0`

## Gotchas

- Management keys cannot call completion endpoints; use `OPENROUTER_API_KEY` for runtime smoke tests.
- `GET /api/v1/key` does not return the key hash. Use `/api/v1/keys` with the management key and match by label/name, or keep the hash from key creation.
- Rate limits are account/model governed; creating extra keys does not increase global capacity. Use key `limit` for spend control, not traffic shaping.
- Usage accounting is included automatically in OpenRouter responses. Deprecated `usage.include` and `stream_options.include_usage` parameters are not needed.

## Question -> query cheat sheet

| Question | Endpoint |
|---|---|
| How many OpenRouter credits are left? | `GET /api/v1/credits` with management key |
| Is the runtime key valid? | `GET /api/v1/key` with runtime key |
| What is this key's remaining spend limit? | `GET /api/v1/key` |
| What keys exist and what are their hashes? | `GET /api/v1/keys` with management key |
| What does this model cost right now? | `GET /api/v1/models/:author/:slug/endpoints` |
| Is a model endpoint healthy? | Endpoint metadata `status` and `uptime_*`, plus a runtime smoke test |

## Known unknowns

- No invoice export endpoint has been validated. Use account credit balance plus Pollinations Tinybird usage for operational tracking.
- No per-model spend API has been validated beyond response-level usage accounting and dashboard exports.
