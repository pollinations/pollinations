import assert from "node:assert/strict";
import test from "node:test";
import {
    Client,
    StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import worker from "./worker.js";

const TOKEN = "sk_test_token";
const EXPECTED_TOOLS = ["edit_image", "list_image_edit_models"];

function localFetch(input, init) {
    const request = input instanceof Request ? input : new Request(input, init);
    return worker.fetch(request);
}

async function connectClient(options = {}, token = TOKEN) {
    const client = new Client(
        { name: "image-edit-mcp-worker-test", version: "0.0.1" },
        { capabilities: {}, ...options },
    );
    const transport = new StreamableHTTPClientTransport(
        new URL("https://image-edit-mcp.pollinations.ai"),
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
        new Request("https://image-edit-mcp.pollinations.ai/health"),
    );
    assert.equal(health.status, 200);
    assert.equal((await health.json()).endpoint, "/");

    const unauthorized = await worker.fetch(
        new Request("https://image-edit-mcp.pollinations.ai", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
        }),
    );
    assert.equal(unauthorized.status, 401);
    assert.equal(
        unauthorized.headers.get("www-authenticate"),
        'Bearer realm="image-edit-mcp.pollinations.ai"',
    );

    const oldEndpoint = await worker.fetch(
        new Request("https://image-edit-mcp.pollinations.ai/mcp"),
    );
    assert.equal(oldEndpoint.status, 404);
});

test("serves current and 2025 Streamable HTTP without sessions", async () => {
    const modern = await connectClient({
        versionNegotiation: { mode: "auto" },
    });
    assert.equal(modern.getProtocolEra(), "modern");
    assert.deepEqual(
        (await modern.listTools()).tools.map(({ name }) => name).sort(),
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
        new Request("https://image-edit-mcp.pollinations.ai", {
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

const EDIT_RESPONSE = {
    created: 1793000000,
    data: [
        {
            url: "https://media.pollinations.ai/edited.png",
            revised_prompt: "a red bicycle",
        },
    ],
    usage: { input_tokens: 12, output_tokens: 1 },
};

test("sends a JSON edit request with the caller's key", async (t) => {
    let calls = 0;
    t.mock.method(globalThis, "fetch", async (input, init) => {
        calls++;
        assert.equal(
            String(input),
            "https://gen.pollinations.ai/v1/images/edits",
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
            prompt: "make the bicycle red",
            model: "black-forest-labs/flux.1-kontext-pro",
            image: [{ image_url: "https://example.com/bike.png" }],
            response_format: "url",
        });
        return Response.json(EDIT_RESPONSE);
    });

    const client = await connectClient({
        versionNegotiation: { mode: "auto" },
    });
    t.after(() => client.close());
    const result = await client.callTool({
        name: "edit_image",
        arguments: {
            prompt: "make the bicycle red",
            image: "https://example.com/bike.png",
        },
    });
    assert.notEqual(result.isError, true);
    assert.equal(calls, 1);
    assert.deepEqual(JSON.parse(result.content[0].text), {
        model: "black-forest-labs/flux.1-kontext-pro",
        images: [
            {
                url: "https://media.pollinations.ai/edited.png",
                revised_prompt: "a red bicycle",
            },
        ],
        usage: EDIT_RESPONSE.usage,
    });
});

test("forwards multiple references and generation options", async (t) => {
    let seen;
    t.mock.method(globalThis, "fetch", async (_input, init) => {
        seen = JSON.parse(init.body);
        return Response.json(EDIT_RESPONSE);
    });
    const client = await connectClient();
    t.after(() => client.close());
    const result = await client.callTool({
        name: "edit_image",
        arguments: {
            prompt: "put both objects on one table",
            image: ["https://example.com/a.png", "data:image/png;base64,AAAA"],
            model: "google/gemini-2.5-flash-image",
            size: "1024x1024",
            quality: "high",
            seed: 42,
            safe: false,
        },
    });
    assert.notEqual(result.isError, true);
    assert.deepEqual(seen, {
        prompt: "put both objects on one table",
        model: "google/gemini-2.5-flash-image",
        image: [
            { image_url: "https://example.com/a.png" },
            { image_url: "data:image/png;base64,AAAA" },
        ],
        response_format: "url",
        size: "1024x1024",
        quality: "high",
        seed: 42,
        safe: false,
    });
});

test("lists only models that support image edits", async (t) => {
    t.mock.method(globalThis, "fetch", async (input) => {
        assert.equal(String(input), "https://gen.pollinations.ai/v1/models");
        return Response.json({
            data: [
                {
                    id: "black-forest-labs/flux.1-kontext-pro",
                    description: "Edit images with a prompt",
                    paid_only: false,
                    supported_endpoints: ["/v1/images/edits"],
                },
                {
                    id: "openai/gpt-5.4-nano",
                    description: "Text model",
                    paid_only: false,
                    supported_endpoints: ["/v1/chat/completions"],
                },
            ],
        });
    });
    const client = await connectClient();
    t.after(() => client.close());
    const result = await client.callTool({
        name: "list_image_edit_models",
        arguments: {},
    });
    assert.notEqual(result.isError, true);
    assert.deepEqual(JSON.parse(result.content[0].text), {
        models: [
            {
                id: "black-forest-labs/flux.1-kontext-pro",
                description: "Edit images with a prompt",
                paid_only: false,
            },
        ],
    });
});
