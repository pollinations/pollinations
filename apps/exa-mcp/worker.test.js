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
            calls.push({ url, init, body: JSON.parse(init.body) });
            assert.equal(init.headers["x-api-key"], "test-exa-key");
            if (url.endsWith("/search")) {
                return Response.json({
                    costDollars: { total: 0.007 },
                    results: [
                        {
                            title: "Pollinations",
                            url: "https://pollinations.ai",
                            highlights: ["Open-source generative AI."],
                        },
                    ],
                });
            }
            if (url.endsWith("/contents")) {
                return Response.json({
                    costDollars: { total: 0.002 },
                    results: [
                        {
                            title: "One",
                            url: "https://example.com/one",
                            text: "First page",
                        },
                        {
                            title: "Two",
                            url: "https://example.com/two",
                            text: "Second page",
                        },
                    ],
                });
            }
            return new Response("Not found", { status: 404 });
        },
    });
    return { calls, env: { EXA_API_KEY: "test-exa-key" }, worker };
}

async function connect(worker, env, responses) {
    const client = new Client(
        { name: "exa-mcp-test", version: "0.0.1" },
        { capabilities: {} },
    );
    const transport = new StreamableHTTPClientTransport(
        new URL("https://exa.internal"),
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

test("lists Exa's default tools without usage", async () => {
    const { calls, env, worker } = createHarness();
    const responses = [];
    const client = await connect(worker, env, responses);
    assert.deepEqual(
        (await client.listTools()).tools.map(({ name }) => name),
        ["web_search_exa", "web_fetch_exa"],
    );
    assert.equal(calls.length, 0);
    assert.equal(
        responses.some((response) =>
            response.headers.has(MCP_USAGE_HEADERS.cost),
        ),
        false,
    );
    await client.close();
});

test("searches Exa and reports exact API cost", async () => {
    const { calls, env, worker } = createHarness();
    const responses = [];
    const client = await connect(worker, env, responses);
    const result = await client.callTool({
        name: "web_search_exa",
        arguments: { query: "Pollinations", numResults: 5 },
    });
    assert.match(result.content[0].text, /https:\/\/pollinations\.ai/);
    assert.deepEqual(calls[0].body, {
        query: "Pollinations",
        type: "auto",
        numResults: 5,
        contents: { highlights: true },
    });
    const response = responses.at(-1);
    assert.equal(response.headers.get(MCP_USAGE_HEADERS.cost), "0.007");
    assert.equal(response.headers.get(MCP_USAGE_HEADERS.tool), "web_search_exa");
    assert.equal(response.headers.get(MCP_USAGE_HEADERS.status), "200");
    assert.equal(
        response.headers.get(MCP_USAGE_HEADERS.adjustmentId),
        "exa.search.v1",
    );
    assert.equal(response.headers.get(MCP_USAGE_HEADERS.adjustmentUnits), "1");
    await client.close();
});

test("fetches multiple pages and reports per-page usage", async () => {
    const { calls, env, worker } = createHarness();
    const responses = [];
    const client = await connect(worker, env, responses);
    const urls = ["https://example.com/one", "https://example.com/two"];
    const result = await client.callTool({
        name: "web_fetch_exa",
        arguments: { urls },
    });
    assert.match(result.content[0].text, /First page/);
    assert.deepEqual(calls[0].body, {
        urls,
        text: { maxCharacters: 3000 },
    });
    const response = responses.at(-1);
    assert.equal(response.headers.get(MCP_USAGE_HEADERS.cost), "0.002");
    assert.equal(
        response.headers.get(MCP_USAGE_HEADERS.adjustmentUnits),
        "2",
    );
    await client.close();
});

test("rejects JSON-RPC batches", async () => {
    const { calls, env, worker } = createHarness();
    const response = await worker.fetch(
        new Request("https://exa.internal", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify([
                { jsonrpc: "2.0", id: 1, method: "tools/list" },
            ]),
        }),
        env,
    );
    assert.equal(response.status, 400);
    assert.equal(calls.length, 0);
});
