import { SELF } from "cloudflare:test";
import { getLogger } from "@logtape/logtape";
import { expect } from "vitest";
import { test } from "./fixtures.ts";

const endpoint = "http://localhost:3000/api/generate/v1/chat/completions";
const log = getLogger(["test", "rate-limit"]);

// Get capacity from environment (test env uses 0.002 for bucket exhaustion testing)
const _EXPECTED_CAPACITY = parseFloat(
    process.env.POLLEN_BUCKET_CAPACITY || "0.002",
);

type TestRequestOptions = {
    apiKey: string;
    clientIp: string;
    message?: string;
    model?: string;
};

async function sendTestOpenAIRequest({
    apiKey,
    clientIp,
    model,
    message,
}: TestRequestOptions) {
    return await SELF.fetch(endpoint, {
        method: "POST",
        headers: {
            "content-type": "application/json",
            "authorization": `Bearer ${apiKey}`,
            "cf-connecting-ip": clientIp,
        },
        body: JSON.stringify({
            model: model || "openai",
            messages: [{ role: "user", content: message || "Hello?" }],
        }),
    });
}

test(
    "First request succeeds without rate limit headers",
    { timeout: 30000 },
    async ({ pubApiKey, mocks }) => {
        await mocks.enable("polar", "tinybird", "vcr");

        const response = await sendTestOpenAIRequest({
            apiKey: pubApiKey,
            clientIp: `192.0.0.${Date.now() % 254}`,
            model: "openai",
            message: "Hello?",
        });

        await response.text();

        // Verify request succeeds
        expect(response.status).toBe(200);

        // Verify NO rate limit headers (simplified rate limiter doesn't expose these)
        const rateLimitHeader = response.headers.get("RateLimit-Limit");
        const remainingHeader = response.headers.get("RateLimit-Remaining");
        expect(rateLimitHeader).toBeNull();
        expect(remainingHeader).toBeNull();

        log.info("✓ First request succeeded without rate limit headers");
    },
);

test(
    "Expensive requests cause longer waits",
    { timeout: 30000 },
    async ({ pubApiKey, mocks }) => {
        await mocks.enable("polar", "tinybird", "vcr");

        const testIp = `192.0.10.${Date.now() % 254}`;

        // First request succeeds
        const response1 = await sendTestOpenAIRequest({
            apiKey: pubApiKey,
            clientIp: testIp,
            model: "openai",
            message: "Hello?",
        });

        expect(response1.status).toBe(200);
        await response1.text();

        // Second request immediately after should be blocked (expensive request created wait time)
        const response2 = await sendTestOpenAIRequest({
            apiKey: pubApiKey,
            clientIp: testIp,
            model: "openai",
            message: "Hello again?",
        });

        // Should be blocked with 429
        expect(response2.status).toBe(429);
        const retryAfter = response2.headers.get("Retry-After");
        expect(retryAfter).toBeTruthy();

        log.info(
            `✓ Expensive request created wait: Retry-After=${retryAfter}s`,
        );
    },
);

test(
    "Secret keys bypass rate limiting",
    { timeout: 30000 },
    async ({ apiKey, mocks }) => {
        await mocks.enable("polar", "tinybird", "vcr");

        // Make request with secret key
        const response = await sendTestOpenAIRequest({
            apiKey: apiKey,
            clientIp: `192.0.10.${Date.now() % 254}`,
            model: "openai",
            message: "Test secret key.",
        });

        await response.text(); // Consume body

        expect(response.status).toBe(200);

        // Verify NO rate limit headers for secret keys
        const rateLimitHeader = response.headers.get("RateLimit-Limit");
        const remainingHeader = response.headers.get("RateLimit-Remaining");
        expect(rateLimitHeader).toBeNull();
        expect(remainingHeader).toBeNull();
    },
);

test(
    "Blocks with 429 when rate limit exhausted",
    { timeout: 60000 },
    async ({ pubApiKey, mocks }) => {
        await mocks.enable("polar", "tinybird", "vcr");

        const testIp = `192.0.12.${Date.now() % 254}`;

        // First request succeeds
        const response1 = await sendTestOpenAIRequest({
            apiKey: pubApiKey,
            clientIp: testIp,
            model: "openai",
            message: "First request",
        });

        expect(response1.status).toBe(200);
        await response1.text();

        // Second request immediately after should be blocked
        const response2 = await sendTestOpenAIRequest({
            apiKey: pubApiKey,
            clientIp: testIp,
            model: "openai",
            message: "Second request",
        });

        expect(response2.status).toBe(429);

        const retryAfter = response2.headers.get("Retry-After");
        expect(retryAfter).toBeTruthy();
        expect(parseFloat(retryAfter || "0")).toBeGreaterThan(0);

        log.info(`✓ Rate limit triggered: Retry-After=${retryAfter}s`);
    },
);

test(
    "Sequential requests respect rate limit",
    { timeout: 30000 },
    async ({ pubApiKey, mocks }) => {
        await mocks.enable("polar", "tinybird", "vcr");

        const testIp = `192.0.99.${Date.now() % 254}`;

        // First request succeeds
        const response1 = await sendTestOpenAIRequest({
            apiKey: pubApiKey,
            clientIp: testIp,
            model: "openai",
            message: "First request",
        });

        await response1.text();
        expect(response1.status).toBe(200);
        log.info("✓ First request succeeded");

        // Second request immediately after should be blocked
        const response2 = await sendTestOpenAIRequest({
            apiKey: pubApiKey,
            clientIp: testIp,
            model: "openai",
            message: "Second request",
        });

        await response2.text();
        expect(response2.status).toBe(429);

        const retryAfter = response2.headers.get("Retry-After");
        expect(retryAfter).toBeTruthy();

        log.info(
            `✓ Second request blocked with 429 (Retry-After: ${retryAfter}s)`,
        );
    },
);

test(
    "Refill allows requests after wait time",
    { timeout: 5000 },
    async ({ pubApiKey, mocks }) => {
        await mocks.enable("polar", "tinybird", "vcr");

        const testIp = `192.0.13.${Date.now() % 254}`;

        // First request succeeds - use openai-fast with very short message for minimal cost
        const response1 = await sendTestOpenAIRequest({
            apiKey: pubApiKey,
            clientIp: testIp,
            model: "openai-fast",
            message: "Hi", // Very short to minimize pollen cost
        });

        expect(response1.status).toBe(200);
        await response1.text();

        // Second request immediately after is blocked
        const response2 = await sendTestOpenAIRequest({
            apiKey: pubApiKey,
            clientIp: testIp,
            model: "openai-fast",
            message: "Hi",
        });

        expect(response2.status).toBe(429);
        const retryAfter = parseFloat(
            response2.headers.get("Retry-After") || "0",
        );
        log.info(`Request blocked, retry after ${retryAfter}s`);

        // Wait for refill + small buffer
        const waitMs = Math.ceil(retryAfter * 1000) + 100;
        log.info(`Waiting ${waitMs}ms for refill...`);
        await new Promise((resolve) => setTimeout(resolve, waitMs));

        // Third request after refill should succeed
        const response3 = await sendTestOpenAIRequest({
            apiKey: pubApiKey,
            clientIp: testIp,
            model: "openai-fast",
            message: "Hi",
        });

        expect(response3.status).toBe(200);
        log.info("✓ Request allowed after refill");
    },
);
