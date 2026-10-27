import assert from "node:assert/strict";
import test from "node:test";
import {
    Client,
    StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { MCP_USAGE_HEADERS } from "../../shared/registry/mcp.ts";
import { createWorker } from "./worker.js";

const API_URL = "https://oreolook.test";

function createHarness() {
    const calls = [];
    const worker = createWorker({
        fetchImpl: async (url, init) => {
            calls.push({
                url,
                init,
                body: init.body ? JSON.parse(init.body) : undefined,
            });
            assert.equal(init.headers.Authorization, "Bearer test-lix-key");
            const path = new URL(url).pathname;
            if (path === "/v1/search") {
                return Response.json({
                    success: true,
                    data: [
                        {
                            url: "https://pollinations.ai",
                            title: "Pollinations",
                            description: "Open-source generative AI.",
                        },
                    ],
                });
            }
            if (path === "/v1/scrape") {
                return Response.json({
                    success: true,
                    data: {
                        markdown: "Hello page",
                        metadata: {
                            title: "Example",
                            sourceURL: "https://example.com",
                        },
                    },
                });
            }
            if (path === "/v1/crawl") {
                return Response.json({ success: true, id: "job-1" });
            }
            if (path === "/v1/crawl/job-1") {
                return Response.json({
                    success: true,
                    status: "completed",
                    total: 1,
                    completed: 1,
                    data: [{ markdown: "Crawled", metadata: { url: "x" } }],
                });
            }
            if (path === "/v1/extract") {
                return Response.json(
                    { success: false, error: "Upstream timeout" },
                    { status: 504 },
                );
            }
            if (path === "/v1/chat/completions") {
                return Response.json({
                    choices: [
                        { message: { content: "Answer [1]\n\n[1] source" } },
                    ],
                });
            }
            return new Response("Not found", { status: 404 });
        },
    });
    return {
        calls,
        env: { OREOLOOK_API_URL: API_URL, OREOLOOK_API_KEY: "test-lix-key" },
        worker,
    };
}

async function connect(worker, env, responses) {
    const client = new Client(
        { name: "oreolook-mcp-test", version: "0.0.1" },
        { capabilities: {} },
    );
    const transport = new StreamableHTTPClientTransport(
        new URL("https://oreolook.internal"),
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

function usage(response) {
    return Object.fromEntries(
        Object.entries(MCP_USAGE_HEADERS).map(([key, header]) => [
            key,
            response.headers.get(header),
        ]),
    );
}

test("lists OreoLook tools without usage", async () => {
    const { calls, env, worker } = createHarness();
    const responses = [];
    const client = await connect(worker, env, responses);
    const { tools } = await client.listTools();
    assert.deepEqual(
        tools.map(({ name }) => name),
        [
            "oreolook_search",
            "oreolook_scrape",
            "oreolook_map",
            "oreolook_crawl",
            "oreolook_crawl_status",
            "oreolook_extract",
            "oreolook_research",
        ],
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

test("searches and reports a search request", async () => {
    const { calls, env, worker } = createHarness();
    const responses = [];
    const client = await connect(worker, env, responses);
    const result = await client.callTool({
        name: "oreolook_search",
        arguments: { query: "Pollinations", limit: 3 },
    });
    assert.match(result.content[0].text, /https:\/\/pollinations\.ai/);
    assert.equal(calls[0].url, `${API_URL}/v1/search`);
    assert.deepEqual(calls[0].body, { query: "Pollinations", limit: 3 });
    assert.deepEqual(usage(responses.at(-1)), {
        cost: "0.003",
        tool: "oreolook_search",
        status: "200",
        adjustmentId: "oreolook.search.v1",
        adjustmentUnits: "1",
        error: null,
    });
    await client.close();
});

test("scrapes a page as markdown", async () => {
    const { calls, env, worker } = createHarness();
    const responses = [];
    const client = await connect(worker, env, responses);
    const result = await client.callTool({
        name: "oreolook_scrape",
        arguments: { url: "https://example.com" },
    });
    assert.match(result.content[0].text, /Hello page/);
    assert.deepEqual(calls[0].body, {
        url: "https://example.com",
        formats: ["markdown"],
        onlyMainContent: true,
    });
    assert.equal(usage(responses.at(-1)).adjustmentId, "oreolook.scrape.v1");
    await client.close();
});

test("bills a crawl by its page limit and polls status for free", async () => {
    const { calls, env, worker } = createHarness();
    const responses = [];
    const client = await connect(worker, env, responses);
    const started = await client.callTool({
        name: "oreolook_crawl",
        arguments: { url: "https://example.com", limit: 5 },
    });
    assert.match(started.content[0].text, /job-1/);
    const crawlUsage = usage(responses.at(-1));
    assert.equal(crawlUsage.adjustmentId, "oreolook.crawl.page.v1");
    assert.equal(crawlUsage.adjustmentUnits, "5");
    assert.equal(crawlUsage.cost, "0.005");

    const status = await client.callTool({
        name: "oreolook_crawl_status",
        arguments: { id: "job-1" },
    });
    assert.match(status.content[0].text, /completed[\s\S]*Crawled/);
    assert.equal(calls[1].init.method, "GET");
    assert.equal(responses.at(-1).headers.has(MCP_USAGE_HEADERS.cost), false);
    await client.close();
});

test("runs deep research through chat completions", async () => {
    const { calls, env, worker } = createHarness();
    const responses = [];
    const client = await connect(worker, env, responses);
    const result = await client.callTool({
        name: "oreolook_research",
        arguments: { question: "What is Pollinations?" },
    });
    assert.match(result.content[0].text, /Answer \[1\]/);
    assert.deepEqual(calls[0].body, {
        model: "oreolook",
        stream: false,
        messages: [{ role: "user", content: "What is Pollinations?" }],
    });
    assert.equal(usage(responses.at(-1)).cost, "0.025");
    await client.close();
});

test("reports upstream failures at no cost", async () => {
    const { env, worker } = createHarness();
    const responses = [];
    const client = await connect(worker, env, responses);
    const result = await client.callTool({
        name: "oreolook_extract",
        arguments: { urls: ["https://example.com"], prompt: "Get the title" },
    });
    assert.equal(result.isError, true);
    assert.deepEqual(usage(responses.at(-1)), {
        cost: "0",
        tool: "oreolook_extract",
        status: "502",
        adjustmentId: "oreolook.scrape.v1",
        adjustmentUnits: "1",
        error: "Upstream timeout",
    });
    await client.close();
});

test("rejects JSON-RPC batches", async () => {
    const { calls, env, worker } = createHarness();
    const response = await worker.fetch(
        new Request("https://oreolook.internal", {
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
