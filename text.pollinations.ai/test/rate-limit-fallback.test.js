import assert from "node:assert/strict";
import test from "node:test";
import { sendRateLimitFallback } from "../rateLimitFallback.js";

test("returns the static Enter fallback for rate-limit errors", () => {
    const response = {
        headers: {},
        set(headers) {
            Object.assign(this.headers, headers);
            return this;
        },
        status(status) {
            this.statusCode = status;
            return this;
        },
        json(body) {
            this.body = body;
            return this;
        },
    };

    sendRateLimitFallback(response);

    assert.equal(response.statusCode, 429);
    assert.deepEqual(response.body, {
        error: "Rate limit reached on the free legacy API.",
        status: 429,
        message:
            "Continue with the same models using a secret API key with no rate limits. Pay only for the Pollen you use.",
        dashboard_url: "https://enter.pollinations.ai",
        provided_by: "Pollinations.AI",
    });
    assert.equal(response.headers["Cache-Control"], "no-store");
    assert.equal(
        response.headers["X-Pollinations-Rate-Limit-Fallback"],
        "true",
    );
    assert.equal(
        response.headers["X-Pollinations-Dashboard"],
        "https://enter.pollinations.ai",
    );
});
