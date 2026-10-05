import assert from "node:assert/strict";
import { test } from "node:test";
import { fetchPiModels, pickPiModels } from "../src/catalog.js";

/** Model entries shaped like GET /v1/models from the gateway. */
const fixture = [
    {
        id: "openai/gpt-5.4-nano",
        title: "GPT-5.4 Nano",
        tools: true,
        output_modalities: ["text"],
        supported_endpoints: ["/v1/chat/completions"],
        context_length: 400_000,
        input_modalities: ["text", "image"],
    },
    {
        // No tool calling: Pi cannot drive it.
        id: "nontool/text",
        tools: false,
        output_modalities: ["text"],
        supported_endpoints: ["/v1/chat/completions"],
        context_length: 1000,
    },
    {
        // Community model: excluded, same rule as polli-cli.
        id: "community/model",
        tools: true,
        community: true,
        output_modalities: ["text"],
        supported_endpoints: ["/v1/chat/completions"],
        context_length: 1000,
    },
    {
        // Agent models are excluded too.
        id: "agent/model",
        tools: true,
        agent: true,
        output_modalities: ["text"],
        supported_endpoints: ["/v1/chat/completions"],
        context_length: 1000,
    },
    {
        // No chat-completions endpoint.
        id: "embed/model",
        tools: true,
        output_modalities: ["text"],
        supported_endpoints: ["/v1/embeddings"],
        context_length: 1000,
    },
];

test("pickPiModels keeps only first-party tool-calling text models", () => {
    const picked = pickPiModels(fixture);
    assert.deepEqual(
        picked.map((model) => model.id),
        ["openai/gpt-5.4-nano"],
    );
});

test("pickPiModels normalises fields and sorts by id", () => {
    const picked = pickPiModels([
        ...fixture,
        {
            id: "alpha/model",
            tools: true,
            output_modalities: ["text", "image"],
            supported_endpoints: ["/v1/chat/completions"],
            context_length: 128_000,
            input_modalities: ["text", "image", "audio"],
        },
    ]);
    assert.deepEqual(
        picked.map((model) => model.id),
        ["alpha/model", "openai/gpt-5.4-nano"],
    );
    assert.deepEqual(picked[0], {
        id: "alpha/model",
        title: "alpha/model",
        contextWindow: 128_000,
        input: ["text", "image"],
    });
});

test("fetchPiModels returns the picked models", async () => {
    const models = await fetchPiModels({
        origin: "https://example.test",
        fetchImpl: async (url) => {
            assert.equal(url, "https://example.test/v1/models");
            return new Response(JSON.stringify({ data: fixture }), {
                status: 200,
                headers: { "content-type": "application/json" },
            });
        },
    });
    assert.deepEqual(
        models.map((model) => model.id),
        ["openai/gpt-5.4-nano"],
    );
});

test("fetchPiModels surfaces catalog failures", async () => {
    await assert.rejects(
        fetchPiModels({
            origin: "https://example.test",
            fetchImpl: async () => new Response("nope", { status: 503 }),
        }),
        /model catalog 503/,
    );
});
