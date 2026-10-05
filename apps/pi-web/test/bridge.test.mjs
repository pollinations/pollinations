import assert from "node:assert/strict";
import test from "node:test";
import { forwardRequest, fromBase64, toBase64 } from "../src/bridge.js";

test("base64 round-trips binary payloads", () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 255]);
    assert.deepEqual(fromBase64(toBase64(bytes)), bytes);
});

test("the bridge refuses to proxy hosts other than gen.pollinations.ai", async () => {
    await assert.rejects(
        () => forwardRequest({ url: "https://example.com/v1/chat", method: "POST" }, "sk_test"),
        /refuses to proxy/,
    );
});
