import assert from "node:assert/strict";
import { test } from "vitest";
import { generateCacheKey } from "../src/index.js";

const README_BODY =
    '{"model": "openai", "messages": [{"role": "user", "content": "Hello"}]}';

// X-Cache-Key headers of live HITs, recorded on 2026-10-11. Existing R2
// entries are only reachable while these keys stay the same.
const LIVE_KEYS = [
    [
        "GET",
        "https://text.pollinations.ai/hello",
        "71406d4a5903b43d46ada855571c8e94a4dcf6df0c8d38fbd9393ae25d96ed48",
    ],
    [
        "GET",
        "https://text.myceli.ai/hello",
        "71406d4a5903b43d46ada855571c8e94a4dcf6df0c8d38fbd9393ae25d96ed48",
    ],
    [
        "GET",
        "https://text.pollinations.ai/What%20is%20the%20capital%20of%20France?",
        "d59279fb96a06e4dc920b76a0f073f3eb45a1d0496965ec79a66676a59d19f49",
    ],
    [
        "GET",
        "https://text.pollinations.ai/What%20is%20the%20capital%20of%20France%3F",
        "950e66bfd8db832aff9a41c022345706ebb68e5afa78f606edb90652eb0947d4",
    ],
    [
        "GET",
        "https://text.pollinations.ai/What%20is%20AI?json=true",
        "0056ccbae221c9da635f8877b2af311dce924c3261347c173ddc627b7cfe8cf2",
    ],
    [
        "GET",
        "https://text.pollinations.ai/What%20is%20AI?json=true&token=abc",
        "0056ccbae221c9da635f8877b2af311dce924c3261347c173ddc627b7cfe8cf2",
    ],
    [
        "GET",
        "https://text.pollinations.ai/What%20is%20AI?json=true&referrer=x",
        "0056ccbae221c9da635f8877b2af311dce924c3261347c173ddc627b7cfe8cf2",
    ],
    [
        "HEAD",
        "https://text.pollinations.ai/What%20is%20AI?json=true",
        "0056ccbae221c9da635f8877b2af311dce924c3261347c173ddc627b7cfe8cf2",
    ],
    // The README's POST example (the JSON body is part of the key)
    [
        "POST",
        "https://text.pollinations.ai/openai",
        "9db684646f7906e5e245272d22423ba8c1dedf17bfcfadfa92c8966d7b74c95d",
        README_BODY,
    ],
    [
        "POST",
        "https://text.pollinations.ai/",
        "4ff36ad0fd41e3fa9174f316bace16ab7af66597df229f3ce0f3f98807cb050d",
        README_BODY,
    ],
];

for (const [method, url, key, body] of LIVE_KEYS) {
    test(`${method} ${url} keeps its live cache key`, async () => {
        const headers = body && { "content-type": "application/json" };
        const request = new Request(url, { method, body, headers });
        assert.equal(await generateCacheKey(request), key);
    });
}
