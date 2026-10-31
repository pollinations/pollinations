import assert from "node:assert/strict";
import test, { afterEach, beforeEach } from "node:test";
import {
    Client,
    StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import worker from "./worker.js";

const TOKEN = "sk_test";
const BASE_URL = "https://pollen-cost-mcp.pollinations.ai";

const CATALOG = {
    object: "list",
    data: [
        {
            id: "acme/cheap-text",
            title: "Cheap Text",
            category: "text",
            aliases: ["cheap"],
            capabilities: ["tool_calling"],
            context_length: 128000,
            paid_only: false,
            health: { status: "healthy" },
            pricing: {
                currency: "pollen",
                promptTextTokens: "0.000001",
                completionTextTokens: "0.000002",
            },
        },
        {
            id: "acme/smart-text",
            title: "Smart Text",
            category: "text",
            aliases: [],
            capabilities: ["tool_calling", "reasoning"],
            context_length: 400000,
            paid_only: true,
            health: { status: "healthy" },
            pricing: {
                currency: "pollen",
                promptTextTokens: "0.00001",
                completionTextTokens: "0.00002",
            },
        },
        {
            id: "acme/picture",
            title: "Picture",
            category: "image",
            aliases: [],
            capabilities: [],
            paid_only: false,
            health: { status: "healthy" },
            pricing: { currency: "pollen", completionImageTokens: "0.03" },
        },
        {
            id: "acme/old-picture",
            title: "Old Picture",
            category: "image",
            aliases: [],
            capabilities: [],
            paid_only: false,
            health: { status: "unhealthy" },
            pricing: { currency: "pollen", completionImageTokens: "0.01" },
        },
    ],
};

const originalFetch = globalThis.fetch;

beforeEach(() => {
    globalThis.fetch = async () =>
        new Response(JSON.stringify(CATALOG), {
            headers: { "content-type": "application/json" },
        });
});

afterEach(() => {
    globalThis.fetch = originalFetch;
});

function localFetch(input, init) {
    const request = input instanceof Request ? input : new Request(input, init);
    return worker.fetch(request);
}

async function connectClient() {
    const client = new Client(
        { name: "pollen-cost-mcp-worker-test", version: "0.0.1" },
        { capabilities: {} },
    );
    const transport = new StreamableHTTPClientTransport(new URL(BASE_URL), {
        fetch: localFetch,
        requestInit: { headers: { Authorization: `Bearer ${TOKEN}` } },
    });
    await client.connect(transport);
    return client;
}

async function callTool(client, name, args) {
    const result = await client.callTool({ name, arguments: args });
    const text = result.content?.find((item) => item.type === "text")?.text;
    let payload = null;
    try {
        payload = text ? JSON.parse(text) : null;
    } catch {
        payload = text ?? null;
    }
    return { result, payload };
}

test("serves health and requires bearer auth", async () => {
    const health = await worker.fetch(new Request(`${BASE_URL}/health`));
    assert.equal(health.status, 200);
    assert.equal((await health.json()).endpoint, "/");

    const unauthorized = await worker.fetch(
        new Request(BASE_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
        }),
    );
    assert.equal(unauthorized.status, 401);
    assert.equal(
        unauthorized.headers.get("www-authenticate"),
        'Bearer realm="pollen-cost-mcp.pollinations.ai"',
    );
});

test("lists the expected tools", async () => {
    const client = await connectClient();
    const names = (await client.listTools()).tools.map(({ name }) => name);
    assert.deepEqual(names.sort(), [
        "cheapest_models",
        "estimate_cost",
        "list_models",
    ]);
    await client.close();
});

test("list_models filters by category and hides unhealthy models", async () => {
    const client = await connectClient();

    const { payload: all } = await callTool(client, "list_models", {
        category: "image",
    });
    assert.equal(all.total, 1);
    assert.equal(all.models[0].id, "acme/picture");

    const { payload: unhealthy } = await callTool(client, "list_models", {
        category: "image",
        include_unhealthy: true,
    });
    assert.equal(unhealthy.total, 2);

    await client.close();
});

test("estimate_cost multiplies token rates and image counts", async () => {
    const client = await connectClient();

    const { payload: text } = await callTool(client, "estimate_cost", {
        model: "cheap",
        usage: {
            prompt_text_tokens: 1000,
            completion_text_tokens: 500,
        },
    });
    assert.equal(text.model, "acme/cheap-text");
    assert.equal(text.totalCost, 0.002);
    assert.equal(text.breakdown.promptTextTokens.cost, 0.001);
    assert.equal(text.breakdown.completionTextTokens.cost, 0.001);

    const { payload: image } = await callTool(client, "estimate_cost", {
        model: "acme/picture",
        usage: { images: 3 },
    });
    assert.equal(image.totalCost, 0.09);

    await client.close();
});

test("estimate_cost approximates raw prompt text", async () => {
    const client = await connectClient();
    const { payload } = await callTool(client, "estimate_cost", {
        model: "acme/cheap-text",
        usage: {},
        prompt_text: "abcd".repeat(10),
    });
    assert.equal(payload.breakdown.promptTextTokens.quantity, 10);
    assert.equal(payload.totalCost, 0.00001);
    await client.close();
});

test("cheapest_models ranks by price and honors capabilities", async () => {
    const client = await connectClient();

    const { payload: ranked } = await callTool(client, "cheapest_models", {
        category: "text",
        usage: { prompt_text_tokens: 1000, completion_text_tokens: 500 },
    });
    assert.equal(ranked.models.length, 2);
    assert.equal(ranked.models[0].model, "acme/cheap-text");
    assert.equal(ranked.models[1].model, "acme/smart-text");

    const { payload: reasoning } = await callTool(client, "cheapest_models", {
        category: "text",
        usage: { prompt_text_tokens: 1000 },
        required_capabilities: ["reasoning"],
    });
    assert.equal(reasoning.models.length, 1);
    assert.equal(reasoning.models[0].model, "acme/smart-text");

    const { payload: freeOnly } = await callTool(client, "cheapest_models", {
        category: "text",
        usage: { prompt_text_tokens: 1000 },
        include_paid_only: false,
    });
    assert.deepEqual(
        freeOnly.models.map((model) => model.model),
        ["acme/cheap-text"],
    );

    await client.close();
});

test("estimate_cost rejects an unknown model", async () => {
    const client = await connectClient();
    const { result } = await callTool(client, "estimate_cost", {
        model: "acme/missing",
        usage: { prompt_text_tokens: 1 },
    });
    assert.equal(result.isError, true);
    await client.close();
});
