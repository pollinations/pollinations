import assert from "node:assert/strict";
import test from "node:test";
import {
    Client,
    StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import worker from "./worker.js";

const TOKEN = "sk_tes...oped";
const EXPECTED_TOOLS = ["embed"];

function localFetch(input, init) {
    const request = input instanceof Request ? input : new Request(input, init);
    return worker.fetch(request);
}

async function connectClient(options = {}, token = TOKEN) {
    const client = new Client(
        { name: "embeddings-mcp-worker-test", version: "0.0.1" },
        { capabilities: {}, ...options },
    );
    const transport = new StreamableHTTPClientTransport(
        new URL("https://embeddings-mcp.pollinations.ai"),
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
        new Request("https://embeddings-mcp.pollinations.ai/health"),
    );
    assert.equal(health.status, 200);
    assert.equal((await health.json()).endpoint, "/");

    const unauthorized = await worker.fetch(
        new Request("https://embeddings-mcp.pollinations.ai", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
        }),
    );
    assert.equal(unauthorized.status, 401);
    assert.equal(
        unauthorized.headers.get("www-authenticate"),
        'Bearer realm="embeddings-mcp.pollinations.ai"',
    );

    const oldEndpoint = await worker.fetch(
        new Request("https://embeddings-mcp.pollinations.ai/mcp"),
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
        new Request("https://embeddings-mcp.pollinations.ai", {
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

const EMBEDDING_RESPONSE = {
    data: [
        { object: "embedding", index: 0, embedding: [0.1, -0.2, 0.3] },
        { object: "embedding", index: 1, embedding: [0.4, 0.5, -0.6] },
    ],
    model: "openai/text-embedding-3-small",
    usage: { prompt_tokens: 12, total_tokens: 12 },
};

test("embeds a single text with the default model", async (t) => {
    let calls = 0;
    t.mock.method(globalThis, "fetch", async (input, init) => {
        calls++;
        assert.equal(
            String(input),
            "https://gen.pollinations.ai/v1/embeddings",
        );
        assert.equal(init.method, "POST");
        assert.equal(
            new Headers(init.headers).get("authorization"),
            `Bearer ${TOKEN}`,
        );
        assert.equal(
            new Headers(init.headers).get("content-type"),
            "application/json",
        );
        assert.deepEqual(JSON.parse(init.body), {
            model: "openai/text-embedding-3-small",
            input: "hello world",
        });
        return Response.json(EMBEDDING_RESPONSE);
    });
    const client = await connectClient({
        versionNegotiation: { mode: "auto" },
    });
    t.after(() => client.close());
    const result = await client.callTool({
        name: "embed",
        arguments: { input: "hello world" },
    });
    assert.notEqual(result.isError, true);
    assert.equal(calls, 1);
    assert.equal(result.content.length, 1);
    assert.equal(result.content[0].type, "text");
    assert.deepEqual(JSON.parse(result.content[0].text), EMBEDDING_RESPONSE);
});

test("embeds a batch with explicit model and dimensions", async (t) => {
    let calls = 0;
    t.mock.method(globalThis, "fetch", async (_input, init) => {
        calls++;
        const body = JSON.parse(init.body);
        assert.deepEqual(body, {
            model: "openai/text-embedding-3-small",
            input: ["one", "two"],
            dimensions: 512,
        });
        return Response.json({
            ...EMBEDDING_RESPONSE,
            model: body.model,
        });
    });
    const client = await connectClient();
    t.after(() => client.close());
    const result = await client.callTool({
        name: "embed",
        arguments: {
            input: ["one", "two"],
            model: "openai/text-embedding-3-small",
            dimensions: 512,
        },
    });
    assert.notEqual(result.isError, true);
    assert.equal(calls, 1);
    assert.deepEqual(JSON.parse(result.content[0].text).data.length, 2);
});
