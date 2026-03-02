import { SELF } from "cloudflare:test";
import { getTextServices } from "@shared/registry/registry.ts";
import { describe, expect, test } from "vitest";

const TEST_MESSAGE_CONTENT =
    "Is Berlin the capital of Germany? Reply yes or no.";

const EXCLUDED_SERVICES = ["openai-audio"];

const servicesToTest = getTextServices().filter(
    (serviceId) => !EXCLUDED_SERVICES.includes(serviceId),
);

describe("POST /v1/chat/completions (unauthenticated)", () => {
    test.for(servicesToTest.map((s) => [s, 401]))(
        "%s should respond with 401",
        { timeout: 10000 },
        async ([serviceId, expectedStatus]) => {
            const response = await SELF.fetch(
                "http://localhost/api/generate/v1/chat/completions",
                {
                    method: "POST",
                    headers: {
                        "content-type": "application/json",
                    },
                    body: JSON.stringify({
                        model: serviceId,
                        messages: [
                            {
                                role: "user",
                                content: TEST_MESSAGE_CONTENT,
                            },
                        ],
                        seed: 42,
                    }),
                },
            );
            expect(response.status).toBe(expectedStatus);
            await response.text();
        },
    );
});

describe("GET /text/:prompt (unauthenticated)", () => {
    test("should require authentication", async () => {
        const response = await SELF.fetch(
            `http://localhost/api/generate/text/${encodeURIComponent(TEST_MESSAGE_CONTENT)}?model=openai&seed=42`,
            { method: "GET" },
        );
        expect(response.status).toBe(401);
        await response.text();
    });

    test("convenience URL /text/* rewrites correctly", async () => {
        const response = await SELF.fetch(
            `http://localhost/text/${encodeURIComponent(TEST_MESSAGE_CONTENT)}?model=openai&seed=42`,
            { method: "GET" },
        );
        // Should be 401 (auth required), NOT 404 — proving the rewrite works
        expect(response.status).toBe(401);
        await response.text();
    });
});
