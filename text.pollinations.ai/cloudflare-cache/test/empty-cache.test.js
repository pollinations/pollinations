import assert from "node:assert/strict";
import { test } from "vitest";
import { getCachedResponse } from "../src/index.js";

test("treats an empty cached object as a miss", async () => {
    const env = {
        TEXT_BUCKET: {
            get: async () => ({
                size: 0,
                uploaded: new Date(),
                customMetadata: {},
                body: null,
            }),
        },
    };

    assert.equal(await getCachedResponse(env, "key"), null);
});
