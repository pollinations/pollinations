import assert from "node:assert/strict";
import { test } from "node:test";
import {
    bridgeRequest,
    COMPLETIONS,
    EXTENSION,
    providerConfig,
    toolModels,
} from "../src/core.js";

test("the bridge only forwards chat completions and owns the credential", () => {
    const request = {
        url: COMPLETIONS,
        method: "POST",
        body: '{"model":"openai/gpt-5.4-nano"}',
        headers: { Authorization: "Bearer guest-chosen" },
    };
    assert.deepEqual(bridgeRequest(request, "sk_visitor"), {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer sk_visitor",
        },
        body: request.body,
    });
    for (const url of [
        "https://evil.example/v1/chat/completions",
        "https://gen.pollinations.ai/account/keys",
        `${COMPLETIONS}?x=1`,
        "https://gen.pollinations.ai.evil.example/v1/chat/completions",
    ])
        assert.throws(() => bridgeRequest({ ...request, url }, "sk_visitor"));
    assert.throws(() =>
        bridgeRequest({ ...request, method: "GET" }, "sk_visitor"),
    );
});

test("model picker keeps first-party tool-calling chat models with Pi prices", () => {
    const base = {
        tools: true,
        output_modalities: ["text"],
        supported_endpoints: ["/v1/chat/completions"],
        context_length: 400000,
    };
    const models = toolModels([
        {
            ...base,
            id: "openai/gpt-5.4-nano",
            title: "GPT-5.4 Nano",
            input_modalities: ["text", "image", "audio"],
            reasoning: true,
            pricing: {
                promptTextTokens: "0.00000015",
                completionTextTokens: "0.0000009375",
            },
        },
        { ...base, id: "no-tools", tools: false },
        { ...base, id: "community", community: true },
        { ...base, id: "agent", agent: { id: "x" } },
        { ...base, id: "images-only", output_modalities: ["image"] },
    ]);
    assert.deepEqual(models, [
        {
            id: "openai/gpt-5.4-nano",
            name: "GPT-5.4 Nano",
            contextWindow: 400000,
            input: ["text", "image"],
            reasoning: true,
            cost: { input: 0.15, output: 0.9375, cacheRead: 0, cacheWrite: 0 },
        },
    ]);
});

test("Pi configuration carries no credential and loads only our extension", () => {
    const config = providerConfig([]);
    assert.equal(config.baseUrl, "https://gen.pollinations.ai/v1");
    assert.doesNotMatch(JSON.stringify(config), /sk_/);
    assert.ok(EXTENSION.startsWith("/workspace/.pi/"));
});
