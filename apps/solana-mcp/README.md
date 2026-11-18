# Solana Launch Radar MCP

A read-only MCP server for researching Solana tokens and DEX pools through the public DexScreener API.

## Tools

- \`search_solana_tokens\` — search token listings by name, symbol, or mint.
- \`get_token_info\` — token identity, DEX listings, and available public links.
- \`get_token_pairs\` — pools and source-reported market metrics.
- \`get_liquidity_metrics\` — per-pool liquidity without inventing consolidated depth.
- \`get_price_changes\` — pool-level prices and percentage changes.
- \`get_token_activity\` — DEX-pool aggregate buy/sell counts and volume.

## Data limits

- Source: DexScreener public API; no external provider key is required.
- Values are source-reported; missing fields remain null.
- Activity is DEX-pool aggregate data, not wallet-level activity or complete on-chain history.
- Liquidity is returned per pool and is not summed into synthetic market depth.
- This server does not assess token safety, submit transactions, or access wallets.
- DEX endpoints have documented request limits; identical requests use a short edge cache and upstream 429 responses remain explicit.

## Local checks

\`\`\`bash
npm ci --workspaces=false
npm test
npm run check
\`\`\`

Hosted endpoint: \`https://gen.pollinations.ai/mcp/solana\` (Pollinations API key required).
