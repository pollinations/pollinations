import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { filterToolModels, isToolChatModel } from "../src/models.js";

const fixture = JSON.parse(
    readFileSync(new URL("./fixtures/v1-models.json", import.meta.url), "utf8"),
);

test("filter on the real captured /v1/models fixture", () => {
    const models = filterToolModels(fixture);
    assert.ok(
        models.length > 0,
        "expected at least one tool model in the real catalog",
    );
    assert.ok(
        models.some((m) => m.id === "openai/gpt-5.4-nano"),
        "gpt-5.4-nano must be selectable",
    );
    for (const m of models) {
        const raw = fixture.data.find((e) => e.id === m.id);
        assert.notEqual(raw.community, true);
        assert.equal(raw.tools, true);
        assert.ok(raw.supported_endpoints.includes("/v1/chat/completions"));
    }
});

test("rejects community models", () => {
    assert.equal(
        isToolChatModel({
            id: "c1",
            community: true,
            tools: true,
            supported_endpoints: ["/v1/chat/completions"],
        }),
        false,
    );
});

test("rejects models without tool calling", () => {
    assert.equal(
        isToolChatModel({
            id: "x",
            community: false,
            tools: false,
            supported_endpoints: ["/v1/chat/completions"],
        }),
        false,
    );
    assert.equal(
        isToolChatModel({
            id: "x",
            community: false,
            supported_endpoints: ["/v1/chat/completions"],
        }),
        false,
    );
});

test("rejects models not served on /v1/chat/completions", () => {
    assert.equal(
        isToolChatModel({
            id: "x",
            community: false,
            tools: true,
            supported_endpoints: ["/v1/images/generations"],
        }),
        false,
    );
});

test("rejects non-text-output models", () => {
    assert.equal(
        isToolChatModel({
            id: "x",
            community: false,
            tools: true,
            supported_endpoints: ["/v1/chat/completions"],
            output_modalities: ["image"],
        }),
        false,
    );
});

test("malformed and missing fields are rejected, not crashing", () => {
    for (const bad of [null, undefined, {}, { id: 5 }, { id: "" }, "x", []]) {
        assert.equal(isToolChatModel(bad), false);
    }
    assert.deepEqual(filterToolModels(null), []);
    assert.deepEqual(filterToolModels({}), []);
    assert.deepEqual(filterToolModels({ data: "nope" }), []);
});
