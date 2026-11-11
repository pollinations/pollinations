import assert from "node:assert/strict";
import test from "node:test";
import { validateVideoModel } from "../src/utils/models.js";

const CONTEXT = { http: { authInfo: { token: "sk_test" } } };
const PAID_VIDEO = {
    name: "prunaai/p-video",
    aliases: ["p-video"],
    paid_only: true,
};

// Gen hides paid-only models from the keyed list of a Quest Pollen key.
function mockRegistry(t) {
    const originalFetch = globalThis.fetch;
    t.after(() => {
        globalThis.fetch = originalFetch;
    });
    globalThis.fetch = async (_input, init = {}) =>
        Response.json(init.headers?.Authorization ? [] : [PAID_VIDEO]);
}

test("a model missing from the key's list but public is left for Gen to judge", async (t) => {
    mockRegistry(t);

    const result = await validateVideoModel("p-video", CONTEXT);

    assert.equal(result.valid, true);
    assert.equal(result.model.name, "prunaai/p-video");
});

test("a model missing from both lists is still unknown", async (t) => {
    mockRegistry(t);

    const result = await validateVideoModel("no-such-video-model", CONTEXT);

    assert.equal(result.valid, false);
    assert.equal(result.error, 'Unknown video model "no-such-video-model".');
});
