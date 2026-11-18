# Solana Launch Radar MCP

A read-only MCP server for inspecting Solana SPL token mints and recent Pump.fun/PumpSwap on-chain events.

## Tools

- \`get_token_mint_info\` — mint owner, decimals, supply, mint authority and freeze authority.
- \`get_token_largest_accounts\` — current top-20 token accounts (not unique wallet holders).
- \`get_token_activity\` — recent signatures for a mint and matching Pump.fun TradeEvents.
- \`get_recent_pumpfun_launches\` — recent official Pump.fun CreateEvent records.
- \`get_recent_pumpfun_trades\` — recent official Pump.fun TradeEvent records.
- \`get_recent_pumpswap_events\` — recent PumpSwap pool creation and buy/sell events.

## Data integrity and limits

- Source: Solana mainnet public JSON-RPC; no external provider API key is required.
- Program IDs and event discriminators/layouts are taken from the public Pump.fun/PumpSwap IDLs.
- Unknown event suffixes are kept opaque; no unknown bytes are interpreted as trade fields.
- Launch/trade scans inspect only a bounded recent signature window (default 5, max 10); they are not a complete historical archive.
- Token largest-account results are token accounts, not a unique-holder count; pool vaults may appear.
- This server does not provide USD prices, market cap, consolidated liquidity, or token-safety assessments.
- Public Solana RPC is shared, rate-limited and explicitly not intended as production infrastructure. This MCP is alpha; HTTP 429/Retry-After is surfaced and repeated identical reads use a short isolate-local cache.

## Local checks

\`\`\`bash
npm ci --workspaces=false
npm test
npm run check
\`\`\`

Hosted endpoint: \`https://gen.pollinations.ai/mcp/solana\` (Pollinations API key required).
