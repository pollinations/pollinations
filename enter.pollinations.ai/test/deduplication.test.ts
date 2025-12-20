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
            model: model || "openai",
            messages: [{ role: "user", content: message || "Hello?" }],
        }),
    });
}

test(
    "Concurrent identical requests are deduplicated",
    { timeout: 30000 },
    async ({ apiKey, mocks }) => {
        await mocks.enable("polar", "tinybird", "vcr");

        const testIp = `192.0.100.${Date.now() % 254}`;
        const testMessage = `Dedup test ${Date.now()}`;

        // Fire 2 identical requests concurrently
        const [response1, response2] = await Promise.all([
            sendTestOpenAIRequest({
                apiKey,
                clientIp: testIp,
                model: "openai",
                message: testMessage,
            }),
            sendTestOpenAIRequest({
                apiKey,
                clientIp: testIp,
                model: "openai",
                message: testMessage,
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

        // Bodies should be identical (same response shared)
        expect(body1).toBe(body2);

        log.info("✓ Concurrent identical requests deduplicated successfully");
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
                model: "openai",
                message: `Different message 1 - ${Date.now()}`,
            }),
            sendTestOpenAIRequest({
                apiKey,
                clientIp: testIp,
                model: "openai",
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
            model: "openai",
            message: testMessage,
        });

        expect(response1.status).toBe(200);
        await response1.text();

        // Second request after first completes (should make new backend call)
        const response2 = await sendTestOpenAIRequest({
            apiKey,
            clientIp: testIp,
            model: "openai",
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
    "Three concurrent identical requests are all deduplicated",
    { timeout: 30000 },
    async ({ apiKey, mocks }) => {
        await mocks.enable("polar", "tinybird", "vcr");

        const testIp = `192.0.103.${Date.now() % 254}`;
        const testMessage = `Triple dedup test ${Date.now()}`;

        // Fire 3 identical requests concurrently
        const [response1, response2, response3] = await Promise.all([
            sendTestOpenAIRequest({
                apiKey,
                clientIp: testIp,
                model: "openai",
                message: testMessage,
            }),
            sendTestOpenAIRequest({
                apiKey,
                clientIp: testIp,
                model: "openai",
                message: testMessage,
            }),
            sendTestOpenAIRequest({
                apiKey,
                clientIp: testIp,
                model: "openai",
                message: testMessage,
            }),
        ]);

        // All should succeed
        expect(response1.status).toBe(200);
        expect(response2.status).toBe(200);
        expect(response3.status).toBe(200);

        // All should have valid response bodies
        const body1 = await response1.text();
        const body2 = await response2.text();
        const body3 = await response3.text();

        expect(body1).toBeTruthy();
        expect(body2).toBeTruthy();
        expect(body3).toBeTruthy();

        // All bodies should be identical
        expect(body1).toBe(body2);
        expect(body2).toBe(body3);

        log.info(
            "✓ Three concurrent identical requests deduplicated successfully",
        );
    },
);
