import assert from "node:assert/strict";
import { test } from "vitest";
import { call, storedAt } from "./helpers.js";

test("a cache miss stores only the response, without the request URL", async () => {
    await call("/a%20private%20prompt?token=secret");
    // The token is not part of the cache key
    const { customMetadata } = await storedAt("/a%20private%20prompt");

    assert.equal(customMetadata.originalUrl, undefined);
    assert.equal(customMetadata.hasRequestBody, undefined);
    assert.equal(customMetadata.status, "200");
});
