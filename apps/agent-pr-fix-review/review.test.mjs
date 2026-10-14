import assert from "node:assert/strict";
import test from "node:test";
import { estimateCost, parsePullUrl, safeEdit } from "./review.mjs";

test("accepts only canonical HTTPS GitHub pull links", () => {
    assert.deepEqual(
        parsePullUrl("https://github.com/pollinations/pollinations/pull/17304"),
        { repo: "pollinations/pollinations", number: 17304 },
    );
    for (const url of [
        "https://github.com.evil.test/o/r/pull/1",
        "http://github.com/o/r/pull/1",
        "https://github.com/o/r/pull/0",
        "https://github.com/o/r/pull/1/files",
        "https://github.com/o/r/pull/1?token=hidden",
    ]) {
        assert.throws(() => parsePullUrl(url));
    }
});

test("only one exact replacement in a changed regular source path", () => {
    const allowed = ["src/index.ts"];
    const original = "function choose() { return 'old result'; }";
    const edit = {
        path: "src/index.ts",
        old: "return 'old result'",
        new: "return 'new result'",
    };
    assert.equal(safeEdit(edit, allowed, original), null);
    assert.match(
        safeEdit({ ...edit, path: "../secrets/env.ts" }, allowed, original),
        /outside/,
    );
    assert.match(
        safeEdit(
            { ...edit, path: ".github/workflows/deploy.ts" },
            [".github/workflows/deploy.ts"],
            original,
        ),
        /outside/,
    );
    assert.match(
        safeEdit(
            { ...edit, old: "return return" },
            allowed,
            "return return return return",
        ),
        /exactly once/,
    );
    assert.match(
        safeEdit(
            { ...edit, new: "sk_123456789012345678901234567890" },
            allowed,
            original,
        ),
        /credential/,
    );
});

test("estimates Pollen from billable text and cached tokens without making up missing usage", () => {
    const price = {
        promptTextTokens: "0.000002",
        promptCachedTokens: "0.0000001",
        completionTextTokens: "0.00001",
    };
    assert.equal(
        estimateCost(
            {
                prompt_tokens: 1000,
                completion_tokens: 100,
                prompt_tokens_details: {
                    cached_tokens: 200,
                    cache_write_tokens: 300,
                },
            },
            { ...price, promptCacheWriteTokens: "0.0000025" },
        ),
        0.00277,
    );
    assert.equal(estimateCost({}, price), null);
});
