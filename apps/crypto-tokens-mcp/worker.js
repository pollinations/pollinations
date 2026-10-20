import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
    createMCPResponse,
    createTextContent,
} from "../../packages/mcp/src/utils/coreUtils.js";

const DEXSCREENER_API = "https://api.dexscreener.com/latest/dex";

function formatPair(pair) {
    return {
        chain: pair.chainId ?? null,
        dex: pair.dexId ?? null,
        pairAddress: pair.pairAddress ?? null,
        baseToken: pair.baseToken?.symbol ?? null,
        quoteToken: pair.quoteToken?.symbol ?? null,
        priceUsd: pair.priceUsd ?? null,
        priceChange24h: pair.priceChange?.h24 ?? null,
        liquidityUsd: pair.liquidity?.usd ?? null,
        volume24hUsd: pair.volume?.h24 ?? null,
        fdvUsd: pair.fdv ?? null,
        marketCapUsd: pair.marketCap ?? null,
        buy24h: pair.txns?.h24?.buys ?? null,
        sell24h: pair.txns?.h24?.sells ?? null,
        pairCreatedAt: pair.pairCreatedAt ?? null,
        url: pair.url ?? null,
        labels: pair.labels ?? null,
    };
}

async function fetchPairs(path, args, context) {
    const response = await fetch(`${DEXSCREENER_API}${path}`);
    if (!response.ok) {
        throw new Error(`DexScreener returned HTTP ${response.status}`);
    }
    const data = await response.json();
    return (data.pairs ?? []).map(formatPair);
}

function buildServer() {
    const server = new McpServer(
        {
            name: "crypto-tokens-mcp",
            title: "Crypto Tokens MCP",
            version: "0.1.0",
        },
        { capabilities: { tools: {} } },
    );

    server.registerTool(
        "token_info",
        {
            description:
                "Look up a token by contract address across EVM chains using DexScreener. " +
                "Returns price, liquidity, volume, FDV/market cap, 24h price change, buy/sell counts, and pair links. " +
                "Useful for a quick due-diligence glance before trading.",
            inputSchema: {
                address: z
                    .string()
                    .describe(
                        "Token contract address, e.g. 0x6B175474E89094C44Da98b954EedeAC495271d0F",
                    ),
            },
        },
        async ({ address }) => {
            const pairs = await fetchPairs(
                `/tokens/${encodeURIComponent(address)}`,
            );
            if (pairs.length === 0) {
                return createMCPResponse([
                    createTextContent(`No pairs found for address ${address}.`),
                ]);
            }
            return createMCPResponse([
                createTextContent(JSON.stringify(pairs, null, 2)),
            ]);
        },
    );

    server.registerTool(
        "search_tokens",
        {
            description:
                "Search tokens and pairs by symbol, name, or partial address using DexScreener. " +
                "Returns the top matches with price, chain, liquidity, and volume. " +
                "Use to find a token when you only know its symbol or name.",
            inputSchema: {
                query: z
                    .string()
                    .describe(
                        "Symbol, name, or partial address, e.g. WETH, pepe, USDC",
                    ),
            },
        },
        async ({ query }) => {
            const pairs = await fetchPairs(
                `/search?q=${encodeURIComponent(query)}`,
            );
            const top = pairs.slice(0, 10);
            if (top.length === 0) {
                return createMCPResponse([
                    createTextContent(`No results for query "${query}".`),
                ]);
            }
            return createMCPResponse([
                createTextContent(JSON.stringify(top, null, 2)),
            ]);
        },
    );

    return server;
}

const mcpHandler = createMcpHandler(() => buildServer(), {
    legacy: "stateless",
    onerror: (error) => console.error(error),
});

function readBearerToken(request) {
    const authorization = request.headers.get("authorization");
    if (!authorization) return null;

    const [scheme, token] = authorization.trim().split(/\s+/, 2);
    if (scheme?.toLowerCase() !== "bearer" || !token) {
        return null;
    }
    return token;
}

function unauthorizedResponse() {
    return Response.json(
        {
            error: "unauthorized",
            message: "Send a Pollinations API key as a bearer token.",
        },
        {
            status: 401,
            headers: {
                "WWW-Authenticate":
                    'Bearer realm="crypto-tokens-mcp.pollinations.ai"',
            },
        },
    );
}

export default {
    async fetch(request) {
        const url = new URL(request.url);

        if (url.pathname === "/health" && request.method === "GET") {
            return Response.json({
                name: "crypto-tokens-mcp",
                transport: "streamable-http",
                endpoint: "/",
                stateless: true,
            });
        }

        if (url.pathname !== "/") {
            return new Response("Not found", { status: 404 });
        }

        const token = readBearerToken(request);
        if (!token) return unauthorizedResponse();

        if (
            request.method === "POST" &&
            Array.isArray(
                await request
                    .clone()
                    .json()
                    .catch(() => null),
            )
        ) {
            return Response.json(
                {
                    error: "invalid_request",
                    message: "Batch requests are not supported.",
                },
                { status: 400 },
            );
        }

        return mcpHandler.fetch(request, {
            authInfo: {
                token,
                clientId: "pollinations-api-key",
                scopes: [],
            },
        });
    },
};
