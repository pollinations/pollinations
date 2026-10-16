import assert from "node:assert/strict";
import test from "node:test";
import {
    Client,
    StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { MCP_USAGE_HEADERS } from "../../shared/registry/mcp.ts";
import { createWorker } from "./worker.js";

function createHarness() {
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
                    results: [{ url: "https://api.example.com/one" }],
                });
            }
            return Response.json({
                status: 200,
                headers: { "content-type": "text/plain" },
                body_base64: btoa("paid result"),
                paid_usd: "0.00",
                held_usd: "0.002",
                payment_status: "pending",
            });
        },
    });
    return {
        calls,
        worker,
        env: {
            WEFT_BUYER_API_KEY: "test-weft-key",
            WEFT_API_URL: "https://staging.weft.network/api/v1",
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

test("searches only GET fetch-compatible APIs for free", async () => {
    const { calls, env, worker } = createHarness();
    const responses = [];
    const client = await connect(worker, env, responses);
    const result = await client.callTool({
        name: "weft_search",
        arguments: { query: "weather", maxResults: 3 },
    });
    assert.match(result.content[0].text, /api.example.com/);
    assert.deepEqual(calls[0].body, {
        query: "weather",
        max_results: 3,
        filters: { method: { eq: "GET" }, weft_fetch_compatible: true },
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
        arguments: { url: "https://api.example.com/one", maxCostUsd: 0.01 },
    });
    assert.match(result.content[0].text, /paid result/);
    assert.equal(calls[0].url, "https://staging.weft.network/api/v1/fetch");
    assert.deepEqual(calls[0].body, {
        url: "https://api.example.com/one",
        max_cost_usd: "0.01",
        method: "GET",
        allow_tempo_refill: false,
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
