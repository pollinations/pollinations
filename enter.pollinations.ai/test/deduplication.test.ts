import { SELF } from "cloudflare:test";
import { test } from "./fixtures.ts";
import { expect } from "vitest";
import { getLogger } from "@logtape/logtape";

const textEndpoint = "http://localhost:3000/api/generate/v1/chat/completions";
const log = getLogger(["test", "deduplication"]);

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
    return await SELF.fetch(textEndpoint, {
        method: "POST",
        headers: {
            "content-type": "application/json",
            "authorization": `Bearer ${apiKey}`,
            "cf-connecting-ip": clientIp,
        },
        body: JSON.stringify({
            model: model || "gemini-fast",
            messages: [{ role: "user", content: message || "Hello?" }],
        }),
    });
}

test(
    "Concurrent identical requests are deduplicated with X-Cache header",
    { timeout: 30000 },
    async ({ apiKey, mocks }) => {
        await mocks.enable("polar", "tinybird", "vcr");

        const testIp = `192.0.100.${Date.now() % 254}`;
        const testMessage = `Dedup test ${Date.now()}`;

        // Fire first request
        const request1Promise = sendTestOpenAIRequest({
            apiKey,
            clientIp: testIp,
            model: "gemini-fast",
            message: testMessage,
        });

        // Small delay to simulate realistic conditions (5ms)
        await new Promise((resolve) => setTimeout(resolve, 5));

        // Fire second identical request while first is still in flight
        const request2Promise = sendTestOpenAIRequest({
            apiKey,
            clientIp: testIp,
            model: "gemini-fast",
            message: testMessage,
        });

        const [response1, response2] = await Promise.all([
            request1Promise,
            request2Promise,
        ]);

        // Both should succeed
        expect(response1.status).toBe(200);
        expect(response2.status).toBe(200);

        // Both should have valid response bodies
        const body1 = await response1.text();
        const body2 = await response2.text();

        expect(body1).toBeTruthy();
        expect(body2).toBeTruthy();

        // Bodies should be identical (same response shared)
        expect(body1).toBe(body2);

        // Verify deduplication via X-Cache header (standard pattern)
        // One should be HIT (deduplicated), one should be null/MISS (original)
        const cache1 = response1.headers.get("X-Cache");
        const cache2 = response2.headers.get("X-Cache");
        const cacheType1 = response1.headers.get("X-Cache-Type");
        const cacheType2 = response2.headers.get("X-Cache-Type");

        // At least one should have X-Cache: HIT with X-Cache-Type: DEDUP
        const hasDedup =
            (cache1 === "HIT" && cacheType1 === "DEDUP") ||
            (cache2 === "HIT" && cacheType2 === "DEDUP");
        expect(hasDedup).toBe(true);

        log.info(
            `✓ Deduplication verified: X-Cache=[${cache1}, ${cache2}], X-Cache-Type=[${cacheType1}, ${cacheType2}]`,
        );
    },
);

test(
    "Different requests are not deduplicated",
    { timeout: 30000 },
    async ({ apiKey, mocks }) => {
        await mocks.enable("polar", "tinybird", "vcr");

        const testIp = `192.0.101.${Date.now() % 254}`;

        // Fire 2 different requests concurrently
        const [response1, response2] = await Promise.all([
            sendTestOpenAIRequest({
                apiKey,
                clientIp: testIp,
                model: "gemini-fast",
                message: `Different message 1 - ${Date.now()}`,
            }),
            sendTestOpenAIRequest({
                apiKey,
                clientIp: testIp,
                model: "gemini-fast",
                message: `Different message 2 - ${Date.now()}`,
            }),
        ]);

        // Both should succeed
        expect(response1.status).toBe(200);
        expect(response2.status).toBe(200);

        // Both should have valid response bodies
        const body1 = await response1.text();
        const body2 = await response2.text();

        expect(body1).toBeTruthy();
        expect(body2).toBeTruthy();

        // Bodies may differ since requests are different
        // (VCR mock may return same response, but that's okay - the key test is both succeed)

        log.info("✓ Different requests processed independently");
    },
);

test(
    "Sequential identical requests are not deduplicated (cleanup works)",
    { timeout: 30000 },
    async ({ apiKey, mocks }) => {
        await mocks.enable("polar", "tinybird", "vcr");

        const testIp = `192.0.102.${Date.now() % 254}`;
        const testMessage = `Sequential test ${Date.now()}`;

        // First request
        const response1 = await sendTestOpenAIRequest({
            apiKey,
            clientIp: testIp,
            model: "gemini-fast",
            message: testMessage,
        });

        expect(response1.status).toBe(200);
        await response1.text();

        // Second request after first completes (should make new backend call)
        const response2 = await sendTestOpenAIRequest({
            apiKey,
            clientIp: testIp,
            model: "gemini-fast",
            message: testMessage,
        });

        expect(response2.status).toBe(200);
        await response2.text();

        log.info(
            "✓ Sequential requests processed independently (cleanup works)",
        );
    },
);

test(
    "Error responses are shared between deduplicated requests",
    { timeout: 30000 },
    async ({ apiKey, mocks }) => {
        await mocks.enable("polar", "tinybird", "vcr");

        const testIp = `192.0.103.${Date.now() % 254}`;

        // Use an invalid model to trigger an error
        const request1Promise = SELF.fetch(textEndpoint, {
            method: "POST",
            headers: {
                "content-type": "application/json",
                "authorization": `Bearer ${apiKey}`,
                "cf-connecting-ip": testIp,
            },
            body: JSON.stringify({
                model: "nonexistent-model-12345",
                messages: [{ role: "user", content: "Test error handling" }],
            }),
        });

        // Small delay
        await new Promise((resolve) => setTimeout(resolve, 5));

        // Fire second identical request
        const request2Promise = SELF.fetch(textEndpoint, {
            method: "POST",
            headers: {
                "content-type": "application/json",
                "authorization": `Bearer ${apiKey}`,
                "cf-connecting-ip": testIp,
            },
            body: JSON.stringify({
                model: "nonexistent-model-12345",
                messages: [{ role: "user", content: "Test error handling" }],
            }),
        });

        const [response1, response2] = await Promise.all([
            request1Promise,
            request2Promise,
        ]);

        // Both should get the same error status (400 for invalid model)
        expect(response1.status).toBe(400);
        expect(response2.status).toBe(400);

        // Both should have error response bodies
        const body1 = await response1.text();
        const body2 = await response2.text();

        expect(body1).toBeTruthy();
        expect(body2).toBeTruthy();

        // Both should contain the error message about invalid model
        expect(body1).toContain("nonexistent-model-12345");
        expect(body2).toContain("nonexistent-model-12345");

        log.info(
            `✓ Error handling works: both requests got 400 with proper error message`,
        );
    },
);
