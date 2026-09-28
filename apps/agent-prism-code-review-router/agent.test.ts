import assert from "node:assert/strict";
import test from "node:test";
import agent, { choose } from "./agent.ts";

const model = (id: string, extra = {}) => ({
    id,
    category: "text",
    context_length: 100000,
    input_modalities: ["text"],
    supported_endpoints: ["/v1/responses"],
    pricing: { promptTextTokens: "0.000001", completionTextTokens: "0.000002" },
    ...extra,
});

test("images and tools are detected from the request, not keywords", () => {
    const body = {
        input: [
            {
                role: "user",
                content: [
                    {
                        type: "input_image",
                        image_url: "https://example.com/a.png",
                    },
                ],
            },
        ],
        tools: [{ type: "function", name: "lookup" }],
    };
    const capable = model("capable", {
        input_modalities: ["text", "image"],
        capabilities: ["tool_calling"],
    });
    assert.equal(
        choose([model("plain"), capable], [], "fast", body).id,
        "capable",
    );
    assert.throws(
        () => choose([model("plain")], [], "fast", body),
        /no eligible/,
    );
});

test("unknown prices and agents cannot masquerade as free models", () => {
    const real = model("real");
    assert.equal(
        choose(
            [
                model("unknown", { pricing: {} }),
                model("agent", { agent: true }),
                real,
            ],
            [],
            "fast",
            { input: "hello" },
        ).id,
        "real",
    );
});

test("output context is checked even when the wallet is private", () => {
    assert.throws(
        () =>
            choose([model("small", { context_length: 600 })], [], "fast", {
                input: "hello",
                max_output_tokens: 1000,
            }),
        /no eligible/,
    );
});

test("wallet estimate limits deep selection to affordable candidates", () => {
    const expensive = model("expensive", {
        capabilities: ["reasoning"],
        pricing: { promptTextTokens: "1", completionTextTokens: "1" },
    });
    assert.equal(
        choose(
            [expensive, model("cheap")],
            [],
            "deep",
            { input: "audit" },
            {
                balance: 1,
                maxCost: 0.5,
                promptTokens: 100,
                completionTokens: 500,
            },
        ).id,
        "cheap",
    );
});

test("known free community providers are allowed, unhealthy ones are skipped", () => {
    const free = model("community/free", {
        pricing: { promptTextTokens: "0", completionTextTokens: "0" },
    });
    assert.equal(
        choose([free, model("paid")], [], "fast", { input: "hello" }).id,
        free.id,
    );
    assert.equal(
        choose(
            [free, model("paid")],
            [
                {
                    model: free.id,
                    is_rollup: 1,
                    total_requests: 40,
                    status_2xx: 0,
                    errors_5xx: 40,
                },
            ],
            "fast",
            { input: "hello" },
        ).id,
        "paid",
    );
});

test("private balance and unavailable status preserve structured history and SSE", async () => {
    const body = {
        input: [
            {
                type: "function_call",
                call_id: "c1",
                name: "lookup",
                arguments: "{}",
            },
            { type: "function_call_output", call_id: "c1", output: "sunny" },
        ],
        tools: [{ type: "function", name: "lookup" }],
        stream: true,
    };
    let forwarded: Record<string, unknown> = {};
    const response = await agent({
        request: new Request("https://example.com", {
            method: "POST",
            body: JSON.stringify(body),
        }),
        pollinations: async (path, init) => {
            if (path === "/account/balance")
                return new Response("private", { status: 403 });
            if (path === "/v1/models")
                return Response.json({
                    data: [
                        model("capable", { capabilities: ["tool_calling"] }),
                    ],
                });
            if (path.startsWith("/models/status")) throw new Error("offline");
            forwarded = JSON.parse(init?.body as string);
            return new Response("data: unchanged\n\n", {
                headers: { "content-type": "text/event-stream" },
            });
        },
    });
    assert.deepEqual(forwarded.input, body.input);
    assert.deepEqual(forwarded.tools, body.tools);
    assert.equal(await response.text(), "data: unchanged\n\n");
});

test("an empty catalog never dispatches an unchecked fallback", async () => {
    await assert.rejects(
        agent({
            request: new Request("https://example.com", {
                method: "POST",
                body: JSON.stringify({ input: "hello" }),
            }),
            pollinations: async (path) => {
                if (path === "/account/balance")
                    return new Response("private", { status: 403 });
                return Response.json({ data: [] });
            },
        }),
        /no eligible/,
    );
});
