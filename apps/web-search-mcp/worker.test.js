import assert from "node:assert/strict";
import test from "node:test";
import {
    Client,
    StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { createWorker } from "./worker.js";

function createHarness(options = {}) {
    const calls = [];
    const fetchGen = async (url, init) => {
        calls.push({ url, init, body: JSON.parse(init.body) });
        if (options.response) return options.response;
        return Response.json({
            choices: [
                {
                    message: {
                        content: "The current answer.",
                        annotations: [
                            {
                                type: "url_citation",
                                url_citation: {
                                    title: "Primary source",
                                    url: "https://example.com/source",
                                },
                            },
                        ],
                    },
                },
            ],
        });
    };
    return {
        calls,
        worker: createWorker(),
        env: { GEN: { fetch: fetchGen } },
    };
}

async function connect(worker, env, authorization = "Bearer test-key") {
    const client = new Client(
        { name: "web-search-mcp-test", version: "0.0.1" },
        { capabilities: {} },
    );
    const transport = new StreamableHTTPClientTransport(
        new URL("https://search.internal"),
        {
            requestInit: { headers: { Authorization: authorization } },
            fetch: (input, init) => {
                const request =
                    input instanceof Request ? input : new Request(input, init);
                return worker.fetch(request, env);
            },
        },
    );
    await client.connect(transport);
    return client;
}

test("lists one focused web-search tool", async () => {
    const { worker, env } = createHarness();
    const client = await connect(worker, env);
    assert.deepEqual(
        (await client.listTools()).tools.map(({ name }) => name),
        ["searchWeb"],
    );
    await client.close();
});

test("forwards caller billing auth and returns cited search output", async () => {
    const { calls, worker, env } = createHarness();
    const client = await connect(worker, env);
    const result = await client.callTool({
        name: "searchWeb",
        arguments: { query: "What changed today?", searchContextSize: "high" },
    });

    assert.equal(result.isError, undefined);
    assert.match(result.content[0].text, /The current answer/);
    assert.match(
        result.content[0].text,
        /\[Primary source\]\(https:\/\/example\.com\/source\)/,
    );
    assert.equal(
        calls[0].url,
        "https://gen.pollinations.ai/v1/chat/completions",
    );
    assert.equal(calls[0].init.headers.Authorization, "Bearer test-key");
    assert.deepEqual(calls[0].body, {
        model: "openai-search",
        messages: [{ role: "user", content: "What changed today?" }],
        web_search_options: { search_context_size: "high" },
    });
    await client.close();
});

test("does not repeat citations already linked in the answer", async () => {
    const url = "https://example.com/news";
    const { worker, env } = createHarness({
        response: Response.json({
            choices: [
                {
                    message: {
                        content: `Latest update ([Example](${url}))`,
                        annotations: [
                            {
                                type: "url_citation",
                                url_citation: { title: "Example", url },
                            },
                        ],
                    },
                },
            ],
        }),
    });
    const client = await connect(worker, env);
    const result = await client.callTool({
        name: "searchWeb",
        arguments: { query: "latest update" },
    });
    assert.equal(result.content[0].text, `Latest update ([Example](${url}))`);
    await client.close();
});

test("returns upstream failures as tool errors", async () => {
    const { worker, env } = createHarness({
        response: new Response("search unavailable", { status: 503 }),
    });
    const client = await connect(worker, env);
    const result = await client.callTool({
        name: "searchWeb",
        arguments: { query: "latest news" },
    });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /search unavailable/);
    await client.close();
});

test("rejects JSON-RPC batches", async () => {
    const { calls, worker, env } = createHarness();
    const response = await worker.fetch(
        new Request("https://search.internal", {
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
