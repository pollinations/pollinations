import assert from "node:assert/strict";
import test from "node:test";
import {
    Client,
    StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import worker from "./worker.js";

const TOKEN = "sk_tes...oped";
const EXPECTED_TOOLS = ["search_tokens", "token_info"];

function localFetch(input, init) {
    const request = input instanceof Request ? input : new Request(input, init);
    return worker.fetch(request);
}

async function connectClient(options = {}, token = TOKEN) {
    const client = new Client(
        { name: "crypto-tokens-mcp-worker-test", version: "0.0.1" },
        { capabilities: {}, ...options },
    );
    const transport = new StreamableHTTPClientTransport(
        new URL("https://crypto-tokens-mcp.pollinations.ai"),
        {
            fetch: localFetch,
            requestInit: {
                headers: { Authorization: `Bearer ${token}` },
            },
        },
    );
    await client.connect(transport);
    return client;
}

test("serves health and requires bearer auth", async () => {
    const health = await worker.fetch(
        new Request("https://crypto-tokens-mcp.pollinations.ai/health"),
    );
    assert.equal(health.status, 200);
    assert.equal((await health.json()).endpoint, "/");

    const unauthorized = await worker.fetch(
        new Request("https://crypto-tokens-mcp.pollinations.ai", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
        }),
    );
    assert.equal(unauthorized.status, 401);
    assert.equal(
        unauthorized.headers.get("www-authenticate"),
        'Bearer realm="crypto-tokens-mcp.pollinations.ai"',
    );

    const oldEndpoint = await worker.fetch(
        new Request("https://crypto-tokens-mcp.pollinations.ai/mcp"),
    );
    assert.equal(oldEndpoint.status, 404);
});

test("serves current and 2025 Streamable HTTP without sessions", async () => {
    const modern = await connectClient({
        versionNegotiation: { mode: "auto" },
    });
    assert.equal(modern.getProtocolEra(), "modern");
    const modernTools = (await modern.listTools()).tools;
    assert.deepEqual(
        modernTools.map(({ name }) => name).sort(),
        EXPECTED_TOOLS,
    );
    await modern.close();

    const legacy = await connectClient();
    assert.equal(legacy.getProtocolEra(), "legacy");
    assert.deepEqual(
        (await legacy.listTools()).tools.map(({ name }) => name).sort(),
        EXPECTED_TOOLS,
    );
    await legacy.close();
});

test("rejects JSON-RPC batches", async () => {
    const response = await worker.fetch(
        new Request("https://crypto-tokens-mcp.pollinations.ai", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${TOKEN}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify([
                { jsonrpc: "2.0", id: 1, method: "tools/list" },
            ]),
        }),
    );
    assert.equal(response.status, 400);
});

test("token_info fetches DexScreener by address and returns formatted pairs", async (t) => {
    const expectedUrl =
        "https://api.dexscreener.com/latest/dex/tokens/0x6B175474E89094C44Da98b954EedeAC495271d0F";
    let calls = 0;
    t.mock.method(globalThis, "fetch", async (input) => {
        calls++;
        assert.equal(String(input), expectedUrl);
        return Response.json({
            pairs: [
                {
                    chainId: "ethereum",
                    dexId: "uniswap",
                    pairAddress: "0xpair",
                    baseToken: { symbol: "DAI" },
                    quoteToken: { symbol: "USDC" },
                    priceUsd: "0.9998",
                    priceChange: { h24: 0.01 },
                    liquidity: { usd: 1234567 },
                    volume: { h24: 8900000 },
                    fdv: 5000000000,
                    marketCap: 5100000000,
                    txns: { h24: { buys: 1234, sells: 234 } },
                    pairCreatedAt: 1597026383,
                    url: "https://dexscreener.com/ethereum/0xpair",
                },
            ],
        });
    });
    const client = await connectClient();
    t.after(() => client.close());
    const result = await client.callTool({
        name: "token_info",
        arguments: { address: "0x6B175474E89094C44Da98b954EedeAC495271d0F" },
    });
    assert.equal(calls, 1);
    assert.notEqual(result.isError, true);
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.length, 1);
    assert.equal(parsed[0].chain, "ethereum");
    assert.equal(parsed[0].baseToken, "DAI");
    assert.equal(parsed[0].priceUsd, "0.9998");
    assert.equal(parsed[0].liquidityUsd, 1234567);
});

test("token_info reports no pairs for unknown address", async (t) => {
    t.mock.method(globalThis, "fetch", async () =>
        Response.json({ pairs: [] }),
    );
    const client = await connectClient();
    t.after(() => client.close());
    const result = await client.callTool({
        name: "token_info",
        arguments: { address: "0xdeadbeef" },
    });
    assert.notEqual(result.isError, true);
    assert.match(result.content[0].text, /No pairs found/);
});

test("search_tokens queries DexScreener and caps results", async (t) => {
    const expectedUrl = "https://api.dexscreener.com/latest/dex/search?q=pepe";
    let calls = 0;
    t.mock.method(globalThis, "fetch", async (input) => {
        calls++;
        assert.equal(String(input), expectedUrl);
        const pairs = Array.from({ length: 25 }, (_, i) => ({
            chainId: "ethereum",
            dexId: "uniswap",
            baseToken: { symbol: `PEPE${i}` },
            quoteToken: { symbol: "WETH" },
            priceUsd: `${i}.5`,
            liquidity: { usd: i * 1000 },
            volume: { h24: i * 5000 },
        }));
        return Response.json({ pairs });
    });
    const client = await connectClient();
    t.after(() => client.close());
    const result = await client.callTool({
        name: "search_tokens",
        arguments: { query: "pepe" },
    });
    assert.equal(calls, 1);
    assert.notEqual(result.isError, true);
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.length, 10);
    assert.equal(parsed[0].baseToken, "PEPE0");
});

test("search_tokens reports no results for empty search", async (t) => {
    t.mock.method(globalThis, "fetch", async () =>
        Response.json({ pairs: [] }),
    );
    const client = await connectClient();
    t.after(() => client.close());
    const result = await client.callTool({
        name: "search_tokens",
        arguments: { query: "zzzzzznonexistent" },
    });
    assert.notEqual(result.isError, true);
    assert.match(result.content[0].text, /No results/);
});

test("surfaces DexScreener errors", async (t) => {
    t.mock.method(
        globalThis,
        "fetch",
        async () => new Response("rate limited", { status: 429 }),
    );
    const client = await connectClient();
    t.after(() => client.close());
    const result = await client.callTool({
        name: "token_info",
        arguments: { address: "0x1234" },
    });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /429/);
});
