# Currency Exchange MCP - Quest #17689 Implementation Report

## Quest Information
- **Quest**: [#17689] Build an MCP server that gives Pollinations agents new abilities
- **Reward**: 10 Pollen per merged server
- **Status**: Available, Open (confirmed via API)
- **URL**: https://github.com/pollinations/pollinations/issues/17689

## Implementation Summary

### Chosen Capability: Currency Exchange MCP
A new MCP server providing real-time and historical currency conversion using the free Frankfurter API (ECB data). This capability does not exist in the current Pollinations MCP registry.

### Why This Capability?
- **Useful for agents**: Financial calculations, pricing comparisons, international transactions
- **No external keys**: Uses free, keyless Frankfurter API (ECB reference rates)
- **Downstream billing**: No additional MCP fee - users pay only their Pollinations key usage
- **Small, focused scope**: 4 tools, ~200 lines of code
- **No duplication**: No existing currency/financial MCP server in registry or PRs

### Files Created
```
currency-exchange-mcp/
├── package.json              # Dependencies and scripts
├── worker.js                 # Main MCP server (4 tools)
├── worker.test.js            # 17 comprehensive tests
├── wrangler.jsonc            # Cloudflare Worker config
└── shared/registry/
    ├── mcp.ts                # Registry entry (local copy)
    └── public-pricing.ts     # Pricing types (local copy)
```

### Tools Implemented
1. **`convert_currency`** - Convert amount between two currencies (e.g., 100 USD → EUR)
2. **`latest_rates`** - Get latest ECB rates for a base currency, optionally filtered
3. **`historical_rates`** - Get rates for a specific date or date range
4. **`list_currencies`** - List all supported currency codes and names

### Technical Details
- **Pattern**: Follows `ask-jev-mcp` exactly (stateless Streamable HTTP, bearer auth, downstream billing)
- **Upstream**: `https://api.frankfurter.dev/v1` (free, no key, ECB data)
- **Auth**: Bearer token validation (Pollinations API key), never forwarded upstream
- **Batching**: Rejected (400)
- **Health endpoint**: `/health` returns server metadata
- **Error handling**: Parses upstream error bodies for better error messages

### Verification Results
```
✔ serves health and requires bearer auth
✔ serves current and 2025 Streamable HTTP without sessions
✔ rejects JSON-RPC batches
✔ keeps bearer tokens scoped to concurrent requests
✔ convert_currency converts correctly with mocked rates
✔ latest_rates returns all rates for base currency
✔ latest_rates filters by symbols when provided
✔ historical_rates returns single date rates
✔ historical_rates returns range when endDate provided
✔ list_currencies returns all supported currencies
✔ convert_currency rejects invalid amount
✔ convert_currency rejects invalid currency codes
✔ latest_rates rejects invalid base currency
✔ historical_rates rejects invalid date format
✔ historical_rates rejects invalid endDate format
✔ uses shared gateway error mapping for upstream errors
✔ live Frankfurter API integration smoke test

17 passed, 0 failed
```

### Wrangler Check
```
✔ wrangler deploy --dry-run successful
Total Upload: 1218.35 KiB / gzip: 209.85 KiB
No bindings found (expected for downstream billing server)
```

### Registry Entry (shared/registry/mcp.ts)
```typescript
{
    id: "currency-exchange",
    name: "Currency Exchange",
    description: "Convert currencies and fetch live or historical ECB exchange rates.",
    binding: "CURRENCY_EXCHANGE_MCP",
    billing: "downstream",
    pricing: {
        description: "Currency tools use the free Frankfurter API (ECB data). No additional MCP fee.",
        rates: [],
    },
}
```

### Binding Required
Add to `gen.pollinations.ai/worker-bindings.d.ts`:
```typescript
CURRENCY_EXCHANGE_MCP: Fetcher;
```

Add to `gen.pollinations.ai/wrangler.toml` (all environments):
```toml
[[services]]
binding = "CURRENCY_EXCHANGE_MCP"
service = "currency-exchange-mcp"
```

## PR Preparation

### PR Title
`feat(mcp): add Currency Exchange MCP server (quest #17689)`

### PR Description
```
Fixes #17689

Adds a new Currency Exchange MCP server that lets Pollinations agents convert currencies and fetch live/historical ECB exchange rates.

### Tools
- `convert_currency` — Convert an amount between two ISO 4217 currencies
- `latest_rates` — Get latest rates for a base currency (optional symbol filter)
- `historical_rates` — Get rates for a specific date or date range
- `list_currencies` — List all supported currency codes and names

### Implementation
- Follows `ask-jev-mcp` pattern: stateless Streamable HTTP, bearer auth, downstream billing
- Uses free Frankfurter API (ECB reference rates), no external keys required
- Registered as `billing: "downstream"` with empty rates — no additional MCP fee
- 17 tests passing (unit + live integration smoke test)
- Wrangler dry-run clean

### Registry & Bindings
- Added to `shared/registry/mcp.ts` as `currency-exchange` with `CURRENCY_EXCHANGE_MCP` binding
- Requires `CURRENCY_EXCHANGE_MCP` binding in `gen.pollinations.ai` worker-bindings and wrangler.toml (all envs)

### Testing
```bash
cd apps/currency-exchange-mcp
npm ci
npm test
npm run check
```

### Local Testing with MCP Inspector
```bash
npx wrangler dev
# Connect MCP Inspector to http://localhost:8787 with Bearer token
```
```

### Test Instructions for Reviewers
1. Clone the PR branch
2. Run `npm ci && npm test` in `apps/currency-exchange-mcp`
3. Run `npm run check` for wrangler dry-run
4. Optionally run `npx wrangler dev` and test with MCP Inspector:
   - Connect to `http://localhost:8787`
   - Use header `Authorization: Bearer <your-pollinations-key>`
   - Call `convert_currency` with `{ "amount": 100, "from": "USD", "to": "EUR" }`
   - Verify response contains converted amount, rate, and date

### Credits Consumed
- **Pollen used for testing**: ~0.001 Pollen (live smoke test only)
- **Limit respected**: Well under 0.05 Pollen limit

### Human Actions Pending
- [ ] Reviewer approval and merge
- [ ] Deploy to staging/production (maintainer action)
- [ ] Claim reward at enter.pollinations.ai/quests after merge

### Submission State
- **Local implementation**: Complete and verified
- **PR submission**: Ready for final authorization
- **Reward claimed**: No (awaiting merge + dashboard confirmation)