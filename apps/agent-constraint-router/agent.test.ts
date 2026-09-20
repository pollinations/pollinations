import assert from "node:assert/strict";
import test from "node:test";
import agent from "./agent.ts";

const models = [
    {
        id: "speed/flash",
        category: "text",
        community: false,
        input_modalities: ["text"],
        supported_endpoints: ["/v1/responses"],
        supported_parameters: [],
        capabilities: [],
        context_length: 100_000,
        pricing: {
            promptTextTokens: "0.000001",
            completionTextTokens: "0.000001",
        },
        health: { status: "healthy" },
    },
    {
        id: "format/json",
        category: "text",
        community: false,
        input_modalities: ["text"],
        supported_endpoints: ["/v1/responses"],
        supported_parameters: ["structured_outputs"],
        capabilities: [],
        context_length: 100_000,
        pricing: {
            promptTextTokens: "0.000002",
            completionTextTokens: "0.000002",
        },
        health: { status: "healthy" },
    },
    {
        id: "reason/deep",
        category: "text",
        community: false,
        input_modalities: ["text"],
        supported_endpoints: ["/v1/responses"],
        supported_parameters: [],
        capabilities: ["reasoning"],
        context_length: 1_000_000,
        pricing: {
            promptTextTokens: "0.000003",
            completionTextTokens: "0.000006",
        },
        health: { status: "healthy" },
    },
];

const statuses = [
    {
        model: "speed/flash",
        event_type: "generate.text",
        is_rollup: 1,
        total_requests: 100,
        errors_5xx: 0,
        latency_p95_ms: 300,
    },
    {
        model: "format/json",
        event_type: "generate.text",
        is_rollup: 1,
        total_requests: 100,
        errors_5xx: 0,
        latency_p95_ms: 900,
    },
    {
        model: "reason/deep",
        event_type: "generate.text",
        is_rollup: 1,
        total_requests: 100,
        errors_5xx: 1,
        latency_p95_ms: 1800,
    },
];

async function run(body: Record<string, unknown>) {
    const calls: Array<{ path: string; body?: Record<string, unknown> }> = [];
    const downstream = new Response("chosen model answer");
    const result = await agent({
        request: new Request("https://example.com/v1/responses", {
            method: "POST",
            body: JSON.stringify(body),
        }),
        pollinations: async (path, init) => {
            calls.push({
                path,
                body: init?.body ? JSON.parse(init.body as string) : undefined,
            });
            if (path === "/v1/models") return Response.json({ data: models });
            if (path.startsWith("/models/status")) {
                return Response.json({ data: statuses });
            }
            return downstream;
        },
    });
    return { calls, result };
}

test("routes a short urgent answer to the live-latency winner", async () => {
    const { calls, result } = await run({
        input: "Reply quickly with one word: ready?",
        max_output_tokens: 16,
    });
    const forwarded = calls.find((call) => call.body)?.body;
    assert.equal(forwarded?.model, "speed/flash");
    assert.match(forwarded?.instructions as string, /speed\/flash \| speed/);
    assert.equal(result.bodyUsed, false);
});

test("normalizes an OpenWebUI-style text history to provider-safe input", async () => {
    const { calls } = await run({
        input: [
            {
                role: "system",
                content: [{ type: "input_text", text: "Be concise." }],
            },
            {
                role: "user",
                content: [
                    { type: "input_text", text: "Reply quickly: ready?" },
                ],
            },
        ],
        max_output_tokens: 16,
    });
    const forwarded = calls.find((call) => call.body)?.body;
    assert.equal(
        forwarded?.input,
        "system: Be concise.\n\nuser: Reply quickly: ready?",
    );
});

test("routes a strict JSON request to a structured-output model", async () => {
    const { calls } = await run({
        input: "Return a valid JSON object with a single ok field.",
        response_format: { type: "json_schema" },
    });
    const forwarded = calls.find((call) => call.body)?.body;
    assert.equal(forwarded?.model, "format/json");
    assert.match(forwarded?.instructions as string, /format\/json \| format/);
});

test("routes a complex architecture request to a reasoning model", async () => {
    const { calls } = await run({
        input: "Analyze architecture trade-offs for a distributed system under clock skew.",
        instructions: "Be precise.",
    });
    const forwarded = calls.find((call) => call.body)?.body;
    assert.equal(forwarded?.model, "reason/deep");
    assert.match(forwarded?.instructions as string, /^Be precise\./);
    assert.match(forwarded?.instructions as string, /reason\/deep \| deep/);
});
