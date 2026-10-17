import assert from "node:assert/strict";
import { test } from "node:test";
import worker from "./worker.js";

for (const [from, to] of [
    [
        "https://kpi.myceli.ai/auth/callback?code=x",
        "https://kpi.pollinations.ai/auth/callback?code=x",
    ],
    [
        "https://staging.gen.myceli.ai/v1/models",
        "https://staging.gen.pollinations.ai/v1/models",
    ],
    ["https://pollinations.myceli.ai/apps", "https://pollinations.ai/apps"],
    [
        "https://staging.pollinations.myceli.ai/",
        "https://staging.pollinations.ai/",
    ],
    ["https://staging.myceli.ai/", "https://staging.pollinations.ai/"],
]) {
    test(`redirects ${from}`, () => {
        const response = worker.fetch(new Request(from, { method: "POST" }));
        assert.equal(response.status, 308);
        assert.equal(response.headers.get("Location"), to);
    });
}
