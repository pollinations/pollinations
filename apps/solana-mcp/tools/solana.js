import { z } from "zod";
import { fetchJson } from "../fetch.js";

const BASE = "https://api.dexscreener.com";
const tokenAddress = z.string().trim()
    .regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/, "Use a valid base58 Solana token mint address.")
    .describe("Solana token mint address (base58)");
const limit = z.number().int().min(1).max(30).default(10);
const query = z.string().trim().min(2).max(80);

const numberOrNull = (value) =>
    typeof value === "number" && Number.isFinite(value) ? value : null;
const liquidityUsd = (pair) => numberOrNull(pair?.liquidity?.usd) ?? 0;
const sortedPairs = (pairs) => [...pairs].sort((a, b) => liquidityUsd(b) - liquidityUsd(a));

function tokenForPair(pair, mint) {
    if (pair?.baseToken?.address === mint) return pair.baseToken;
    if (pair?.quoteToken?.address === mint) return pair.quoteToken;
    return null;
}
function pairSummary(pair, mint) {
    const token = tokenForPair(pair, mint);
    return {
        pairAddress: pair.pairAddress ?? null,
        dexId: pair.dexId ?? null,
        labels: pair.labels ?? [],
        token: token ? { address: token.address, name: token.name ?? null, symbol: token.symbol ?? null } : null,
        baseToken: pair.baseToken ?? null,
        quoteToken: pair.quoteToken ?? null,
        priceUsd: pair.priceUsd ?? null,
        priceNative: pair.priceNative ?? null,
        marketCapUsd: numberOrNull(pair.marketCap),
        fdvUsd: numberOrNull(pair.fdv),
        liquidity: pair.liquidity ?? null,
        volume: pair.volume ?? null,
        transactions: pair.txns ?? null,
        priceChange: pair.priceChange ?? null,
        pairCreatedAt: numberOrNull(pair.pairCreatedAt),
        url: pair.url ?? null,
    };
}
async function getTokenPairs(mint) {
    const data = await fetchJson(\`\${BASE}/token-pairs/v1/solana/\${encodeURIComponent(mint)}\`);
    if (!Array.isArray(data))
        throw new Error("Unexpected response from DexScreener token-pairs endpoint.");
    return sortedPairs(data.filter((pair) =>
        pair?.chainId === "solana" &&
        (pair?.baseToken?.address === mint || pair?.quoteToken?.address === mint)
    ));
}
function tokenDetails(pair, mint) {
    const token = tokenForPair(pair, mint);
    if (!token) return null;
    return {
        address: token.address,
        name: token.name ?? null,
        symbol: token.symbol ?? null,
        links: pair.baseToken?.address === mint
            ? { imageUrl: pair.info?.imageUrl ?? null, websites: pair.info?.websites ?? [], socials: pair.info?.socials ?? [] }
            : null,
    };
}

export const solanaTools = [
    [
        "search_solana_tokens",
        "Search Solana token pairs by name, symbol, or address using public DexScreener data. Results are unique token candidates with their best-liquidity matching pair. This is not a token safety audit.",
        z.object({ query: query.describe("Token name, symbol, or mint address"), limit: limit.describe("Maximum unique candidates (default 10, max 30)") }),
        async ({ query: search, limit: maxResults }) => {
            const data = await fetchJson(\`\${BASE}/latest/dex/search?q=\${encodeURIComponent(search)}\`);
            const pairs = Array.isArray(data?.pairs)
                ? sortedPairs(data.pairs.filter((pair) => pair?.chainId === "solana"))
                : [];
            const needle = search.toLowerCase();
            const candidates = new Map();
            for (const pair of pairs) {
                const tokens = [pair.baseToken, pair.quoteToken].filter(Boolean);
                const matched = tokens.find((token) =>
                    [token.name, token.symbol, token.address].some(
                        (value) => typeof value === "string" && value.toLowerCase().includes(needle),
                    ),
                ) ?? pair.baseToken;
                if (!matched?.address || candidates.has(matched.address)) continue;
                candidates.set(matched.address, {
                    token: { address: matched.address, name: matched.name ?? null, symbol: matched.symbol ?? null },
                    bestPair: pairSummary(pair, matched.address),
                });
            }
            const results = [...candidates.values()].slice(0, maxResults);
            return { query: search, chain: "solana", count: results.length, results, source: "DexScreener" };
        },
    ],
    [
        "get_token_info",
        "Get a Solana token's name, symbol, mint, DEX listings, and available links from DexScreener. Metadata is source-reported and does not verify ownership, authorities, or token safety.",
        z.object({ mint: tokenAddress }),
        async ({ mint }) => {
            const pairs = await getTokenPairs(mint);
            const best = pairs[0];
            return {
                chain: "solana", mint, found: pairs.length > 0, pairCount: pairs.length,
                dexes: [...new Set(pairs.map((pair) => pair.dexId).filter(Boolean))].sort(),
                token: best ? tokenDetails(best, mint) : null,
                bestLiquidityPair: best ? pairSummary(best, mint) : null,
                source: "DexScreener",
            };
        },
    ],
    [
        "get_token_pairs",
        "List the DEX pools DexScreener reports for a Solana mint, ordered by reported USD liquidity. Returns pool-level metrics, not a consolidated order book.",
        z.object({ mint: tokenAddress, limit: limit.describe("Maximum pools to return (default 10, max 30)") }),
        async ({ mint, limit: maxResults }) => {
            const pairs = await getTokenPairs(mint);
            return {
                chain: "solana", mint, pairCount: pairs.length, returned: Math.min(pairs.length, maxResults),
                pairs: pairs.slice(0, maxResults).map((pair) => pairSummary(pair, mint)),
                source: "DexScreener",
            };
        },
    ],
    [
        "get_liquidity_metrics",
        "Inspect reported USD/base/quote liquidity per Solana DEX pool. Pools remain separate; values are not summed into a synthetic market-depth figure.",
        z.object({ mint: tokenAddress, limit: limit.describe("Maximum pools to return (default 10, max 30)") }),
        async ({ mint, limit: maxResults }) => {
            const pairs = await getTokenPairs(mint);
            return {
                chain: "solana", mint, pairCount: pairs.length,
                pools: pairs.slice(0, maxResults).map((pair) => ({
                    pairAddress: pair.pairAddress ?? null, dexId: pair.dexId ?? null,
                    quoteToken: pair.quoteToken ?? null,
                    liquidityUsd: numberOrNull(pair.liquidity?.usd),
                    baseLiquidity: numberOrNull(pair.liquidity?.base),
                    quoteLiquidity: numberOrNull(pair.liquidity?.quote),
                })),
                methodology: "Pool liquidity is reported by DexScreener. Pools are not summed because that would imply consolidated market depth.",
            };
        },
    ],
    [
        "get_price_changes",
        "Get source-reported USD prices and percentage changes for Solana DEX pools over 5 minutes, 1 hour, 6 hours, and 24 hours. Missing windows remain null.",
        z.object({ mint: tokenAddress, limit: limit.describe("Maximum pools to return (default 10, max 30)") }),
        async ({ mint, limit: maxResults }) => {
            const pairs = await getTokenPairs(mint);
            return {
                chain: "solana", mint,
                prices: pairs.slice(0, maxResults).map((pair) => ({
                    pairAddress: pair.pairAddress ?? null, dexId: pair.dexId ?? null,
                    priceUsd: pair.priceUsd ?? null, priceNative: pair.priceNative ?? null,
                    priceChangePercent: pair.priceChange ?? null,
                })),
                source: "DexScreener",
            };
        },
    ],
    [
        "get_token_activity",
        "Get DEX-pool aggregate buy/sell counts and USD volume for 5 minutes, 1 hour, 6 hours, and 24 hours. This is not wallet-level activity or a complete on-chain transaction history.",
        z.object({ mint: tokenAddress, limit: limit.describe("Maximum pools to return (default 10, max 30)") }),
        async ({ mint, limit: maxResults }) => {
            const pairs = await getTokenPairs(mint);
            return {
                chain: "solana", mint,
                pools: pairs.slice(0, maxResults).map((pair) => ({
                    pairAddress: pair.pairAddress ?? null, dexId: pair.dexId ?? null,
                    transactions: pair.txns ?? null, volumeUsd: pair.volume ?? null,
                })),
                activityScope: "DEX pool aggregates from DexScreener; not wallet-level or full on-chain history.",
                source: "DexScreener",
            };
        },
    ],
];
