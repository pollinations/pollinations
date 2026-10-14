import assert from "node:assert/strict";
import test from "node:test";
import {
    Client,
    StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { MCP_USAGE_HEADERS } from "../../shared/registry/mcp.ts";
import { createWorker } from "./worker.js";

const SEARCH_ID = "11111111-1111-4111-8111-111111111111";

function pendingFetch() {
    return Response.json({
        status: 200,
        headers: { "content-type": "text/plain" },
        body_base64: btoa("paid result"),
        paid_usd: "0.00",
        held_usd: "0.002",
        payment_status: "pending",
    });
}

function createHarness(fetchResponse = pendingFetch) {
    const calls = [];
    const worker = createWorker({
        fetchImpl: async (url, init) => {
            calls.push({
                url,
                body: JSON.parse(init.body),
                headers: init.headers,
            });
            assert.equal(init.headers.Authorization, "Bearer test-weft-key");
            if (url.endsWith("/search")) {
                return Response.json({
                    query_trace_id: SEARCH_ID,
                    query: "weather",
                    embedder_model: "test",
                    candidates_considered: 1,
                    warnings: [],
                    results: [
                        {
                            provider: {
                                provider_id: "example",
                                display_name: "Example",
                                origin_domains: ["api.example.com"],
                            },
                            capability: {
                                capability_id: "one",
                                capability_type: "api",
                            },
                            endpoints: [{ url: "https://api.example.com/one" }],
                            score: 1,
                        },
                    ],
                });
            }
            return fetchResponse();
        },
    });
    return {
        calls,
        worker,
        env: {
            WEFT_BUYER_API_KEY: "test-weft-key",
            WEFT_BASE_URL: "https://staging.weft.network",
        },
    };
}

async function connect(worker, env, responses) {
    const client = new Client(
        { name: "weft-mcp-test", version: "0.0.1" },
        { capabilities: {} },
    );
    const transport = new StreamableHTTPClientTransport(
        new URL("https://weft.internal"),
        {
            fetch: async (input, init) => {
                const request =
                    input instanceof Request ? input : new Request(input, init);
                const response = await worker.fetch(request, env);
                responses.push(response.clone());
                return response;
            },
        },
    );
    await client.connect(transport);
    return client;
}

test("lists search and capped read-only fetch without spending", async () => {
    const { calls, env, worker } = createHarness();
    const responses = [];
    const client = await connect(worker, env, responses);
    const { tools } = await client.listTools();
    assert.deepEqual(
        tools.map(({ name }) => name),
        ["weft_search", "weft_fetch"],
    );
    assert.equal(tools[1].inputSchema.properties.maxCostUsd.maximum, 0.05);
    assert.equal(calls.length, 0);
    assert.equal(
        responses.some((response) =>
            response.headers.has(MCP_USAGE_HEADERS.cost),
        ),
        false,
    );
    await client.close();
});

test("searches only GET fetch-compatible APIs within the cap for free", async () => {
    const { calls, env, worker } = createHarness();
    const responses = [];
    const client = await connect(worker, env, responses);
    const result = await client.callTool({
        name: "weft_search",
        arguments: { query: "weather", maxResults: 3 },
    });
    assert.match(result.content[0].text, /api\.example\.com/);
    assert.match(result.content[0].text, new RegExp(SEARCH_ID));
    assert.equal(calls[0].url, "https://staging.weft.network/api/v1/search");
    assert.deepEqual(calls[0].body, {
        query: "weather",
        max_results: 3,
        filters: {
            method: { eq: "GET" },
            weft_fetch_compatible: true,
            price: { lte: "0.05" },
        },
    });
    assert.equal(responses.at(-1).headers.has(MCP_USAGE_HEADERS.cost), false);
    await client.close();
});

test("fetches with an idempotency key and reports the pending hold", async () => {
    const { calls, env, worker } = createHarness();
    const responses = [];
    const client = await connect(worker, env, responses);
    const result = await client.callTool({
        name: "weft_fetch",
        arguments: {
            url: "https://api.example.com/one",
            maxCostUsd: 0.01,
            searchId: SEARCH_ID,
        },
    });
    assert.match(result.content[0].text, /paid result/);
    assert.equal(calls[0].url, "https://staging.weft.network/api/v1/fetch");
    assert.deepEqual(calls[0].body, {
        url: "https://api.example.com/one",
        max_cost_usd: "0.01",
        method: "GET",
        allow_tempo_refill: false,
        search_id: SEARCH_ID,
    });
    assert.match(calls[0].headers["Idempotency-Key"], /^[0-9a-f-]{36}$/);
    assert.equal(responses.at(-1).headers.get(MCP_USAGE_HEADERS.cost), "0.002");
    await client.close();
});

test("rejects spending above the hard cap before calling Weft", async () => {
    const { calls, env, worker } = createHarness();
    const client = await connect(worker, env, []);
    const result = await client.callTool({
        name: "weft_fetch",
        arguments: { url: "https://api.example.com/one", maxCostUsd: 0.06 },
    });
    assert.equal(result.isError, true);
    assert.equal(calls.length, 0);
    await client.close();
});

test("tells the agent which Weft error stopped a fetch", async () => {
    const { env, worker } = createHarness(() =>
        Response.json(
            { error: "INSUFFICIENT_BALANCE", details: {} },
            { status: 402 },
        ),
    );
    const responses = [];
    const client = await connect(worker, env, responses);
    const result = await client.callTool({
        name: "weft_fetch",
        arguments: { url: "https://api.example.com/one", maxCostUsd: 0.01 },
    });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /INSUFFICIENT_BALANCE/);
    assert.equal(responses.at(-1).headers.get(MCP_USAGE_HEADERS.cost), "0");
    await client.close();
});

test("refuses fetch when no buyer key is configured", async () => {
    const { calls, worker } = createHarness();
    const responses = [];
    const client = await connect(worker, {}, responses);
    const result = await client.callTool({
        name: "weft_fetch",
        arguments: { url: "https://api.example.com/one", maxCostUsd: 0.01 },
    });
    assert.equal(result.isError, true);
    assert.equal(calls.length, 0);
    assert.equal(responses.at(-1).headers.get(MCP_USAGE_HEADERS.cost), "0");
    await client.close();
});
