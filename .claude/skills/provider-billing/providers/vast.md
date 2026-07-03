# Vast.ai billing via CLI

Validated: 2026-07-03 (live pull of account credit and charge ledger).

## Requirements
- CLI: `vastai` (`pip install vastai`), installed at `~/.local/bin/vastai`
- Auth: API key already configured locally (`~/.config/vastai/vast_api_key` / `vastai set api-key`); key comes from https://cloud.vast.ai/account/

## Known identifiers (our account)
| Field | Value |
|---|---|
| Account | Myceli AI (id 396700) |
| Email | elliot+vast_team_2fbb2@myceli.ai |
| Credit | ~$290 (2026-07-03, live; changes with usage) |

## Querying balance and usage

### 1. Account credit — instant (validated 2026-07-02)
```bash
vastai show user --raw     # GET https://console.vast.ai/api/v0/users/current/
```
Key fields: `credit` (prepaid balance remaining, USD — the number the spend-audit "Prepaid left" column wants), `balance` (0 for us), `user`/`email`/`id`.

### 2. Invoices / deposit history — validated 2026-07-02
```bash
vastai show invoices --raw    # GET https://console.vast.ai/api/v0/users/me/invoices/?inc_charges=true
```
Per-instance charge + payment line items with `type`, `amount`, `timestamp`, `instance_id` — gives deposit history ("total prepaid") alongside `credit` ("left"). REST auth: `Authorization: Bearer <key>`.

Other live fields on `users/current/`: `total_spend` (lifetime net, negative), `billing_creditonly: 1` (we are credit-only, so `balance` stays 0).

### 3. Instances (shadow burn) — standard
```bash
vastai show instances --raw   # empty for us since teardown
```

## Credit / discount handling
- `credit` mixes promo credit and cash top-ups into one number. Our $299.52 is promo/untouched; cash paid historically tracked via Wise ($6,963.88 in 2026).

## Gotchas
- `vastai show user` prints the API key field in raw output — filter fields before pasting anywhere.

## Question → query cheat sheet
| Question | Command |
|---|---|
| Prepaid credit left | `vastai show user --raw` → `.credit` |
| Deposit/charge history | `vastai show invoices --raw` |
| Current burn | `vastai show instances --raw` → sum `dph_total` |

## Known unknowns
- Whether promo credit vs paid balance can be split programmatically (single `credit` field suggests no).
