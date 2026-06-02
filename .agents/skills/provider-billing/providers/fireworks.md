# Fireworks AI billing via firectl CLI

Validated: 2026-04-12. Re-validate if a command returns unexpected results.

## Requirements
- CLI: `firectl` installed via `brew tap fw-ai/firectl && brew install firectl`
- Auth: `FIREWORKS_API_KEY` env var (API key from https://fireworks.ai/account/api-keys)
- No browser login needed — `--api-key` flag is sufficient

## Known identifiers (our account)

| Field | Value |
|---|---|
| Account ID | `pollinations` |
| Display Name | Pollinations.AI |
| Email | elliot@pollinations.ai |
| Seed balance | ~$10,000 (credits, as of 2026-04-12) |

**Second account (deprecated):** `elliot-l6mb8f24ewds` (Myceli AI, elliot@myceli.ai) — depleted ($2.36). Was used in production until `f358af4c9` switched to the Pollinations account.

## Querying spend and usage

### 1. Account balance — instant

```bash
firectl account get --api-key "$FIREWORKS_API_KEY" --account-id pollinations
```

Returns:
```
Name: accounts/pollinations
Display Name: Pollinations.AI
Create Time: 2026-03-18 00:18:20
Email: elliot@pollinations.ai
State: READY
Status: OK
Suspend State: UNSUSPENDED
Update Time: 2026-04-12 13:52:45
Balance: USD 10003.39
```

**Key field:** `Balance: USD <amount>` — this is the live credit balance. MTD consumption = seed_balance - current_balance.

### 2. Billing metrics export — batch CSV

```bash
firectl billing export-metrics \
  --api-key "$FIREWORKS_API_KEY" \
  --account-id pollinations \
  --start-time "2026-04-01" \
  --end-time "2026-04-13" \
  --filename billing_april.csv
```

**Important:** The `--filename` path is relative to CWD. Run from a writable directory.

CSV columns:
```
email, start_time, end_time, usage_type, accelerator_type, accelerator_seconds,
base_model_name, model_bucket, parameter_count, prompt_tokens, completion_tokens
```

**No cost column** — must compute cost from token counts + pricing tiers:
- <4B params: $0.10/1M tokens
- 4B-16B params: $0.20/1M tokens  
- >16B params: $0.90/1M tokens

### 3. Invoice listing

```bash
firectl billing list-invoices --api-key "$FIREWORKS_API_KEY" --account-id pollinations
```

Returns invoice history with amounts, states (DRAFT/PAID), and invoice URLs.

### 4. List accounts (discovery)

```bash
firectl account list --api-key "$FIREWORKS_API_KEY"
```

## Credit / discount handling

Fireworks uses a **prepaid credit pool** model. Credits are loaded into the account balance and consumed per-request. The `Balance` field in `account get` reflects remaining credits after consumption.

- All usage deducts from the credit balance
- Invoices show $0.00 while credits remain (POSTPAID_BILLING type, billed only for overage)
- No separate "credit" vs "cash" split — everything comes from the pool

## Deployment operations

Not applicable — Fireworks is a serverless inference provider. No instances to manage.

## Gotchas

- **No REST billing endpoint**: The only way to get balance is `firectl account get` (CLI). No documented `/v1/accounts/{id}/billing` REST endpoint exists.
- **Export CSV has no cost column**: Token counts are reported but not dollar amounts. Must compute cost from pricing tiers × token counts. For balance tracking, just use `account get` balance diff instead.
- **`--filename` is CWD-relative**: The export command writes relative to the current directory, not to an absolute path. `cd` to target dir first.
- **Two accounts exist**: The `elliot-l6mb8f24ewds` (Myceli) account is depleted and no longer used. Always use `pollinations` account ID.
- **Account created 2026-03-18**: No historical data before that date.

## Integration with the finance runway app

The finance app (`apps/operation/finance/lib/providers/fireworks.mjs`) uses `firectl account get` to fetch the live balance, then computes MTD as month_open_balance - current_balance (same stateful tracking as Runpod).

- Pool type: credit pool (not payg)
- `live_balance: true` — orchestrator trusts the wrapper's balance value
- Month-open tracking via `month_open_balance_usd` / `month_open_as_of`
- Top-up detection: if balance increases mid-month, resets baseline

## Question → query cheat sheet

| Question | Command |
|---|---|
| What's our current Fireworks credit balance? | `firectl account get --api-key $FIREWORKS_API_KEY --account-id pollinations` |
| How much did we spend this month? | seed_balance - Balance from above |
| What models are we using? | `firectl billing export-metrics --start-time YYYY-MM-01 --end-time YYYY-MM-DD` → group by `base_model_name` |
| Invoice history | `firectl billing list-invoices --api-key $FIREWORKS_API_KEY --account-id pollinations` |
| Which accounts exist? | `firectl account list --api-key $FIREWORKS_API_KEY` |

## Known unknowns

- No REST API for billing — if firectl is unavailable, there's no fallback
- Export CSV cost computation is approximate (pricing tier boundaries may shift)
- No per-model cost breakdown via balance alone — need export CSV + pricing math for that
