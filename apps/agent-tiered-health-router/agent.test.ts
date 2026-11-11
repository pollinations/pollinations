import assert from "node:assert/strict";
import { test } from "node:test";
import agent from "./agent.ts";

const model = {
    id: "test-model",
    category: "text",
    supported_endpoints: ["/v1/responses"],
    input_modalities: ["text"],
    pricing: { promptTextTokens: "1", completionTextTokens: "1" },
};

async function run(
    models: Record<string, unknown>[],
    body: Record<string, unknown> = { input: "Hello" },
    tier = "FAST",
) {
    let forwarded: unknown;
    const response = await agent({
        request: new Request("https://example.com/v1/responses", {
            method: "POST",
            body: JSON.stringify(body),
        }),
        pollinations: async (path, init) => {
            if (path === "/v1/models") return Response.json({ data: models });
            if (path.startsWith("/models/status"))
                return Response.json({ data: [] });
            assert.equal(path, "/v1/responses");
            const sent = JSON.parse(String(init?.body));
            if (sent.model === "openai/gpt-5.4-nano") {
                return Response.json({
                    output: [
                        { content: [{ type: "output_text", text: tier }] },
                    ],
                });
            }
            forwarded = sent;
            return new Response("answer", {
                status: 201,
                headers: { "content-type": "text/event-stream" },
            });
        },
    });
    return { response, forwarded };
}

test("agents cannot be selected as downstream models", async () => {
    const { forwarded } = await run([
        { ...model, id: "community/user/router", agent: true, pricing: {} },
        model,
    ]);
    assert.deepEqual(forwarded, { input: "Hello", model: model.id });
});

test("does not discard image requirements when no model supports them", async () => {
    await assert.rejects(
        run([model], {
            input: [
                {
                    role: "user",
                    content: [
                        {
                            type: "input_image",
                            image_url: "https://example.com/image.png",
                        },
                    ],
                },
            ],
        }),
        /No compatible model/,
    );
});

test("tool requests only select models that support tools", async () => {
    const tools = [
        { type: "function", name: "lookup", parameters: { type: "object" } },
    ];
    const { forwarded } = await run(
        [model, { ...model, id: "tool-model", capabilities: ["tool_calling"] }],
        { input: "Look this up", tools },
    );
    assert.deepEqual(forwarded, {
        input: "Look this up",
        tools,
        model: "tool-model",
    });
});

test("empty catalog produces a clear error", async () => {
    await assert.rejects(run([]), /No compatible model/);
});

test("a small catalog still serves a deep request", async () => {
    const { forwarded } = await run([model], { input: "Prove it" }, "DEEP");
    assert.deepEqual(forwarded, { input: "Prove it", model: model.id });
});

test("preserves the request and streams the downstream response unchanged", async () => {
    const body = {
        input: [{ role: "user", content: "Hello" }],
        instructions: "Be concise",
        stream: true,
        max_output_tokens: 100,
    };
    const { response, forwarded } = await run([model], body);
    assert.deepEqual(forwarded, { ...body, model: model.id });
    assert.equal(response.status, 201);
    assert.equal(response.headers.get("content-type"), "text/event-stream");
    assert.equal(await response.text(), "answer");
});
