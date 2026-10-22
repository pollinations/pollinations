import assert from "node:assert/strict";
import test from "node:test";
import {
    Client,
    StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import worker from "./worker.js";

const TOKEN = "sk_test_request_scoped";
const EXPECTED_TOOLS = ["model_report", "plan_request"];

const CATALOG = {
    data: [
        {
            id: "openai/gpt-5.4-nano",
            object: "model",
            owned_by: "OpenAI",
            aliases: ["gpt-5.4-nano", "openai"],
            category: "text",
            community: false,
            title: "GPT-5.4 Nano",
            description: "Fast, affordable all-rounder",
            input_modalities: ["text", "image"],
            output_modalities: ["text"],
            supported_endpoints: [
                "/v1/chat/completions",
                "/text",
                "/v1/responses",
            ],
            supported_parameters: [
                "max_tokens",
                "stream",
                "tools",
                "tool_choice",
                "response_format",
                "reasoning_effort",
            ],
            tools: true,
            reasoning: true,
            context_length: 400000,
            health: { status: "healthy", success_rate: 99.9 },
            pricing: {
                currency: "pollen",
                promptTextTokens: "0.00000015",
                completionTextTokens: "0.0000009375",
            },
        },
        {
            id: "community/cheap-model",
            object: "model",
            owned_by: "Someone",
            aliases: ["cheap-model"],
            category: "text",
            community: true,
            title: "Cheap Model",
            description: "Cheapest text model",
            input_modalities: ["text"],
            output_modalities: ["text"],
            supported_endpoints: ["/v1/chat/completions"],
            supported_parameters: ["max_tokens", "stream"],
            tools: false,
            reasoning: false,
            context_length: 8000,
            health: { status: "degraded", success_rate: 70 },
            pricing: {
                currency: "pollen",
                promptTextTokens: "0.00000001",
                completionTextTokens: "0.00000002",
            },
        },
    ],
};

function localFetch(input, init) {
    const request = input instanceof Request ? input : new Request(input, init);
    return worker.fetch(request);
}

async function connectClient(options = {}, token = TOKEN) {
    const client = new Client(
        { name: "call-shapes-mcp-worker-test", version: "0.0.1" },
        { capabilities: {}, ...options },
    );
    const transport = new StreamableHTTPClientTransport(
        new URL("https://call-shapes-mcp.pollinations.ai"),
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

function mockCatalog(t, catalog = CATALOG) {
    return t.mock.method(globalThis, "fetch", async (input, init) => {
        assert.equal(String(input), "https://gen.pollinations.ai/v1/models");
        assert.equal(
            new Headers(init.headers).get("authorization"),
            `Bearer ${TOKEN}`,
        );
        return Response.json(catalog);
    });
}

test("serves health and requires bearer auth", async () => {
    const health = await worker.fetch(
        new Request("https://call-shapes-mcp.pollinations.ai/health"),
    );
    assert.equal(health.status, 200);
    assert.equal((await health.json()).endpoint, "/");

    const unauthorized = await worker.fetch(
        new Request("https://call-shapes-mcp.pollinations.ai", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
        }),
    );
    assert.equal(unauthorized.status, 401);
    assert.equal(
        unauthorized.headers.get("www-authenticate"),
        'Bearer realm="call-shapes-mcp.pollinations.ai"',
    );
});

test("rejects JSON-RPC batches", async () => {
    const response = await worker.fetch(
        new Request("https://call-shapes-mcp.pollinations.ai", {
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

test("exposes exactly the two planning tools", async () => {
    const client = await connectClient({
        versionNegotiation: { mode: "auto" },
    });
    const tools = (await client.listTools()).tools;
    assert.deepEqual(tools.map(({ name }) => name).sort(), EXPECTED_TOOLS);
    await client.close();
});

test("plans a request with only supported parameters", async (t) => {
    mockCatalog(t);
    const client = await connectClient();
    t.after(() => client.close());
    const result = await client.callTool({
        name: "plan_request",
        arguments: {
            model: "gpt-5.4-nano",
            needs: ["streaming"],
            prompt: "Summarise this",
            promptChars: 400,
            outputTokens: 100,
        },
    });
    assert.notEqual(result.isError, true);
    const plan = JSON.parse(result.content[0].text);
    assert.equal(plan.model, "openai/gpt-5.4-nano");
    assert.equal(plan.endpoint, "/v1/chat/completions");
    assert.equal(plan.request_body.model, "openai/gpt-5.4-nano");
    assert.equal(plan.request_body.stream, true);
    assert.equal(plan.request_body.max_tokens, 100);
    assert.deepEqual(plan.request_body.messages, [
        { role: "user", content: "Summarise this" },
    ]);
    assert.equal(plan.estimated_cost.prompt_tokens, 100);
    assert.equal(plan.estimated_cost.currency, "pollen");
    assert.ok(plan.estimated_cost.total_cost > 0);
});

test("uses the responses endpoint when tools are required", async (t) => {
    mockCatalog(t);
    const client = await connectClient();
    t.after(() => client.close());
    const result = await client.callTool({
        name: "plan_request",
        arguments: {
            model: "openai",
            needs: ["tools"],
            tools: [{ type: "function", name: "ping" }],
        },
    });
    assert.notEqual(result.isError, true);
    const plan = JSON.parse(result.content[0].text);
    assert.equal(plan.endpoint, "/v1/responses");
    assert.ok(plan.request_body.input);
    assert.deepEqual(plan.request_body.tools, [
        { type: "function", name: "ping" },
    ]);
    assert.equal(plan.request_body.tool_choice, "auto");
});

test("warns when the model cannot do what the caller needs", async (t) => {
    mockCatalog(t);
    const client = await connectClient();
    t.after(() => client.close());
    const result = await client.callTool({
        name: "plan_request",
        arguments: {
            model: "cheap-model",
            needs: ["tools", "reasoning"],
        },
    });
    assert.notEqual(result.isError, true);
    const plan = JSON.parse(result.content[0].text);
    assert.equal(plan.notes.length, 4);
    assert.ok(plan.notes.some((note) => note.includes("tools")));
    assert.ok(plan.notes.some((note) => note.includes("reasoning")));
    assert.ok(plan.notes.some((note) => note.includes("health")));
    assert.ok(plan.notes.some((note) => note.includes("Community model")));
});

test("suggests cheaper models that fit the same needs", async (t) => {
    mockCatalog(t);
    const client = await connectClient();
    t.after(() => client.close());
    const result = await client.callTool({
        name: "plan_request",
        arguments: { model: "gpt-5.4-nano" },
    });
    assert.notEqual(result.isError, true);
    const plan = JSON.parse(result.content[0].text);
    assert.deepEqual(
        plan.cheaper_models_with_same_needs.map(({ id }) => id),
        ["community/cheap-model"],
    );
});

test("reports an unknown model with close matches", async (t) => {
    mockCatalog(t);
    const client = await connectClient();
    t.after(() => client.close());
    const result = await client.callTool({
        name: "plan_request",
        arguments: { model: "cheap" },
    });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /community\/cheap-model/);
});

test("model_report returns the full single-model facts", async (t) => {
    mockCatalog(t);
    const client = await connectClient();
    t.after(() => client.close());
    const result = await client.callTool({
        name: "model_report",
        arguments: { model: "gpt-5.4-nano" },
    });
    assert.notEqual(result.isError, true);
    const report = JSON.parse(result.content[0].text);
    assert.equal(report.id, "openai/gpt-5.4-nano");
    assert.deepEqual(report.aliases, ["gpt-5.4-nano", "openai"]);
    assert.equal(report.context_length, 400000);
    assert.equal(report.pricing.prompt_per_million_tokens, 0.15);
    assert.equal(report.health.status, "healthy");
});

test("keeps bearer tokens scoped to concurrent requests", async (t) => {
    const seen = new Set();
    t.mock.method(globalThis, "fetch", async (_input, init) => {
        seen.add(new Headers(init.headers).get("authorization"));
        return Response.json(CATALOG);
    });
    const options = { versionNegotiation: { mode: "auto" } };
    const first = await connectClient(options, "pk_first");
    const second = await connectClient(options, "sk_second");
    t.after(() => Promise.all([first.close(), second.close()]));
    await Promise.all([
        first.callTool({
            name: "model_report",
            arguments: { model: "gpt-5.4-nano" },
        }),
        second.callTool({
            name: "model_report",
            arguments: { model: "gpt-5.4-nano" },
        }),
    ]);
    assert.deepEqual(seen, new Set(["Bearer pk_first", "Bearer sk_second"]));
});
