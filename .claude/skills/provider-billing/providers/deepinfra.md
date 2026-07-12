# DeepInfra billing via REST API

Validated: 2026-04-24. Re-validate if an endpoint returns unexpected results.

## Requirements

- Auth: `DEEPINFRA_API_KEY` from `gen.pollinations.ai/secrets/prod.vars.json`.
- Tools: `curl`, `jq`, `sops`.
- Runtime base URL: `https://api.deepinfra.com/v1/openai`.
- Native API base URL: `https://api.deepinfra.com`.

Load the runtime key without printing it:

```bash
export DEEPINFRA_API_KEY=$(sops -d gen.pollinations.ai/secrets/prod.vars.json | jq -r '.DEEPINFRA_API_KEY')
```

## Known identifiers

| Field | Value |
|---|---|
| Runtime secret | `gen.pollinations.ai/secrets/prod.vars.json` → `DEEPINFRA_API_KEY` |
| Primary Pollinations model | `deepseek` → `deepseek-ai/DeepSeek-V4-Flash` |
| Pro Pollinations model | `deepseek-pro` → `deepseek-ai/DeepSeek-V4-Pro` |

## Querying models and prices

### 1. OpenAI model list

```bash
curl -sS "https://api.deepinfra.com/v1/models" \
  -H "Authorization: Bearer $DEEPINFRA_API_KEY" |
  jq '.data[] | select(.id | test("DeepSeek-V4")) | {id, metadata}'
```

Validated DeepSeek prices on 2026-04-24:

| Model | Input / 1M | Cached input / 1M | Output / 1M | Context reported by `/v1/models` |
|---|---:|---:|---:|---:|
| `deepseek-ai/DeepSeek-V4-Flash` | `$0.14` | `$0.028` | `$0.28` | `1048576` |
| `deepseek-ai/DeepSeek-V4-Pro` | `$1.74` | `$0.145` | `$3.48` | `65536` |

Note: the Pro description says 1M context, but the live API metadata reports `65536`; use the numeric metadata for registry limits.

## Querying spend and usage

### 1. Account usage by month

```bash
curl -sS "https://api.deepinfra.com/payment/usage?from=2026.04" \
  -H "Authorization: Bearer $DEEPINFRA_API_KEY" |
  jq '.months[] | {period, total_cost, invoice_id, items}'
```

Fields from the OpenAPI schema:

- `total_cost`: integer cents for the month.
- `invoice_id`: Stripe invoice id, `EMPTY`, or `NOT_FINAL`.
- `items[].units`: billed seconds or tokens.
- `items[].rate`: cents per second or cents per token.
- `items[].cost`: item cost in cents.
- `items[].pricing_type`: pricing bucket, such as token/cache buckets.

### 2. Token usage summary

```bash
curl -sS "https://api.deepinfra.com/payment/usage/tokens?from=current" \
  -H "Authorization: Bearer $DEEPINFRA_API_KEY" |
  jq '.months[] | {period, total_cost, items}'
```

### 3. Usage for one API token

Use a token id from `/v1/api-tokens`:

```bash
curl -sS "https://api.deepinfra.com/v1/api-tokens" \
  -H "Authorization: Bearer $DEEPINFRA_API_KEY" |
  jq '.[] | {name, token_id, created_at, allowed_ips}'

curl -sS "https://api.deepinfra.com/payment/usage/<token_id>?from=current" \
  -H "Authorization: Bearer $DEEPINFRA_API_KEY"
```

## Token management

### List keys

```bash
curl -sS "https://api.deepinfra.com/v1/api-tokens" \
  -H "Authorization: Bearer $DEEPINFRA_API_KEY" |
  jq '.[] | {name, token_id, created_at, allowed_ips}'
```

### Create key

```bash
curl -sS -X POST "https://api.deepinfra.com/v1/api-tokens" \
  -H "Authorization: Bearer $DEEPINFRA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name":"rotated-YYYYMMDD-HHMMSS"}'
```

Response includes `token`, `created_at`, `name`, `token_id`, and `allowed_ips`.

### Delete key

```bash
curl -sS -X DELETE "https://api.deepinfra.com/v1/api-tokens/<token_id>" \
  -H "Authorization: Bearer $DEEPINFRA_API_KEY"
```

Use `tools/scripts/rotation/rotate-genai-deepinfra.sh` for the production-safe create → deploy → health-check → delete flow.

## Credit / discount handling

DeepInfra exposes usage costs in cents through `/payment/usage*`. The public API schema does not expose a separate credit-balance endpoint. For remaining credits or payment-method state, use the dashboard billing portal.

## Deployment operations

Not applicable for public DeepInfra models. Private model deployment exists under DeepInfra custom LLM APIs, but Pollinations currently uses public OpenAI-compatible model endpoints.

## Gotchas

- `/v1/models` reports `deepseek-ai/DeepSeek-V4-Flash`, not `Lite`. Treat `deepseek-lite` as a Pollinations alias only.
- `DeepSeek-V4-Pro` live metadata currently reports `65536` context even though the description says 1M.
- Billing endpoints return cents, not dollars.
- Key rotation should be rolling: create a new token, deploy it, health-check production, then delete the old token.

## Question → query cheat sheet

| Question | Command |
|---|---|
| Which DeepSeek V4 models are live? | `curl /v1/models | jq '...test("DeepSeek-V4")...'` |
| What did we spend this month? | `GET /payment/usage?from=current` |
| What did a specific API token spend? | `GET /payment/usage/<token_id>?from=current` |
| Which API keys exist? | `GET /v1/api-tokens` |
| Rotate runtime key | `tools/scripts/rotation/rotate-genai-deepinfra.sh --execute` |

## Known unknowns

- No public REST endpoint was found for remaining prepaid balance or credits.
