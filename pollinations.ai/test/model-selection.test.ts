import assert from "node:assert/strict";
import { test } from "node:test";
import { findModelById } from "../src/ui/components/play/model-selection.ts";

const models = [
    {
        id: "black-forest-labs/flux.1-schnell",
        aliases: ["flux"],
        type: "image",
    },
    { id: "google/veo-3.1-fast", aliases: ["veo"], type: "video" },
    { id: "openai/gpt-audio-mini", aliases: ["openai-audio"], type: "audio" },
    { id: "openai/gpt-5-nano", aliases: ["openai"], type: "text" },
];

test("old links resolve to the same model and category as canonical links", () => {
    for (const model of models) {
        assert.equal(findModelById(models, model.aliases[0]), model);
        assert.equal(findModelById(models, model.id), model);
    }
});

test("an exact ID takes precedence over an earlier alias", () => {
    const catalog = [
        { id: "publisher/image", aliases: ["chosen"] },
        { id: "chosen" },
    ];
    assert.equal(findModelById(catalog, "chosen"), catalog[1]);
});

test("catalogs without aliases and unknown models keep their existing behavior", () => {
    const catalog = [{ id: "flux" }, { id: "owner/community-model" }];
    assert.equal(findModelById(catalog, "flux"), catalog[0]);
    assert.equal(findModelById(catalog, "owner/community-model"), catalog[1]);
    assert.equal(findModelById(catalog, "missing"), undefined);
    assert.equal(findModelById([], "flux"), undefined);
});
