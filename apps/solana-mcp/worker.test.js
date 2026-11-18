import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import worker from "./worker.js";

const MINT = "So11111111111111111111111111111111111111112";
const PAIR = {
    chainId: "solana", dexId: "raydium", pairAddress: "pair-1",
    url: "https://dexscreener.com/solana/pair-1",
    baseToken: { address: MINT, name: "Wrapped SOL", symbol: "SOL" },
    quoteToken: { address: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", name: "USD Coin", symbol: "USDC" },
    priceUsd: "150", priceNative: "1", marketCap: 123000000, fdv: 125000000,
    liquidity: { usd: 500000, base: 3000, quote: 500000 },
    volume: { h24: 2500000, h6: 700000, h1: 100000, m5: 9000 },
    txns: { h24: { buys: 800, sells: 600 }, h1: { buys: 50, sells: 30 }, m5: { buys: 7, sells: 4 } },
    priceChange: { h24: 4.2, h1: 1.1, m5: 0.3 }, pairCreatedAt: 1700000000000,
    info: { imageUrl: "https://example.invalid/sol.png", websites: [], socials: [] },
};

async function clientFor(t, modern = false) {
    const client = new Client(
        { name: "solana-mcp-tests", version: "1" },
        modern ? { versionNegotiation: { mode: "auto" } } : {},
    );
    await client.connect(
        new StreamableHTTPClientTransport(new URL("https://solana.internal/"), {
            requestInit: { headers: { Authorization: "Bearer test-not-a-real-key", Cookie: "private=session" } },
            fetch: (input, init) => worker.fetch(input instanceof Request ? input : new Request(input, init)),
        }),
    );
    t.after(() => client.close());
    return client;
}

test("private Worker config disables public routes and exposes only MCP endpoint", () => {
    const config = JSON.parse(readFileSync(new URL("./wrangler.jsonc", import.meta.url)));
    for (const env of [config, config.env.staging]) {
        assert.equal(env.workers_dev, false);
        assert.equal(env.preview_urls, false);
        assert.deepEqual(env.routes, []);
    }
    assert.ok(config.compatibility_flags.includes("global_fetch_strictly_public"));
    for (const path of ["/health", "/unknown"])
        assert.equal(worker.fetch(new Request(`https://solana.invalid${path}`)).status, 404);
});

for (const modern of [false, true]) {
    test(`stateless MCP transport (${modern ? "modern" : "legacy"}) exposes six tools`, async (t) => {
        const client = await clientFor(t, modern);
        assert.equal(client.getProtocolEra(), modern ? "modern" : "legacy");
        assert.deepEqual((await client.listTools()).tools.map((tool) => tool.name).sort(), [
            "get_liquidity_metrics", "get_price_changes", "get_token_activity",
            "get_token_info", "get_token_pairs", "search_solana_tokens",
        ]);
    });
}

test("token info uses fixed Solana DexScreener endpoint and never forwards caller credentials", async (t) => {
    t.mock.method(globalThis, "fetch", async (input, init) => {
        const url = new URL(input);
        assert.equal(url.origin, "https://api.dexscreener.com");
        assert.equal(url.pathname, `/token-pairs/v1/solana/${MINT}`);
        const headers = new Headers(init.headers);
        assert.equal(headers.has("authorization"), false);
        assert.equal(headers.has("cookie"), false);
        assert.equal(headers.get("user-agent"), "Pollinations-Solana-MCP/0.1 (hello@pollinations.ai)");
        assert.equal(init.redirect, "error");
        assert.equal(init.cf.cacheTtl, 10);
        return Response.json([PAIR]);
    });
    const client = await clientFor(t);
    const result = await client.callTool({ name: "get_token_info", arguments: { mint: MINT } });
    assert.notEqual(result.isError, true, JSON.stringify(result));
    const data = JSON.parse(result.content[0].text);
    assert.equal(data.found, true);
    assert.equal(data.token.symbol, "SOL");
    assert.equal(data.pairCount, 1);
    assert.equal(data.bestLiquidityPair.liquidity.usd, 500000);
});

test("search filters non-Solana results and returns unique token candidates", async (t) => {
    t.mock.method(globalThis, "fetch", async (input) => {
        assert.equal(new URL(input).pathname, "/latest/dex/search");
        return Response.json({ pairs: [
            PAIR,
            { ...PAIR, chainId: "ethereum", pairAddress: "eth-pair" },
            { ...PAIR, pairAddress: "pair-2", liquidity: { usd: 1000 } },
        ] });
    });
    const client = await clientFor(t);
    const result = await client.callTool({ name: "search_solana_tokens", arguments: { query: "SOL", limit: 10 } });
    assert.notEqual(result.isError, true, JSON.stringify(result));
    const data = JSON.parse(result.content[0].text);
    assert.equal(data.chain, "solana");
    assert.equal(data.count, 1);
    assert.equal(data.results[0].token.address, MINT);
    assert.equal(data.results[0].bestPair.pairAddress, "pair-1");
});

test("pair, liquidity, price and activity tools preserve source fields", async (t) => {
    t.mock.method(globalThis, "fetch", async () => Response.json([PAIR]));
    const client = await clientFor(t);
    const pairs = await client.callTool({ name: "get_token_pairs", arguments: { mint: MINT } });
    assert.equal(JSON.parse(pairs.content[0].text).pairs[0].pairAddress, "pair-1");
    const liquidity = await client.callTool({ name: "get_liquidity_metrics", arguments: { mint: MINT } });
    assert.equal(JSON.parse(liquidity.content[0].text).pools[0].liquidityUsd, 500000);
    const prices = await client.callTool({ name: "get_price_changes", arguments: { mint: MINT } });
    assert.equal(JSON.parse(prices.content[0].text).prices[0].priceChangePercent.h24, 4.2);
    const activity = await client.callTool({ name: "get_token_activity", arguments: { mint: MINT } });
    const data = JSON.parse(activity.content[0].text);
    assert.equal(data.pools[0].transactions.h24.buys, 800);
    assert.match(data.activityScope, /not wallet-level/);
});

test("invalid mint is rejected before an upstream request", async (t) => {
    const fetch = t.mock.method(globalThis, "fetch", () => assert.fail("must not fetch"));
    const client = await clientFor(t);
    const result = await client.callTool({ name: "get_token_info", arguments: { mint: "not-a-solana-mint" } });
    assert.equal(result.isError, true);
    assert.equal(fetch.mock.callCount(), 0);
});

test("upstream 429 is explicit and retryable", async (t) => {
    t.mock.method(globalThis, "fetch", async () =>
        new Response("rate limited", { status: 429, headers: { "retry-after": "12" } }),
    );
    const client = await clientFor(t);
    const result = await client.callTool({ name: "get_token_info", arguments: { mint: MINT } });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /HTTP 429/);
    assert.match(result.content[0].text, /Retry-After: 12/);
});
