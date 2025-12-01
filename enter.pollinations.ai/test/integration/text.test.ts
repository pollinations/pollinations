import { getTextServices } from "@shared/registry/registry.ts";
import {
    createExecutionContext,
    env,
    SELF,
    waitOnExecutionContext,
} from "cloudflare:test";
import { test } from "../fixtures.ts";
import { describe, expect } from "vitest";
import type { ServiceId } from "@shared/registry/registry.ts";
import { CompletionUsageSchema } from "@/schemas/openai.ts";
import { parseUsageHeaders } from "@shared/registry/usage-headers.ts";
import worker from "@/index.ts";

const TEST_DISABLE_CACHE = false;
const TEST_ALL_SERVICES = true;

const REQUIRED_SERVICES = ["openai", "openai-fast", "openai-large"];
const EXCLUDED_SERVICES = ["openai-audio"];

const servicesToTest = getTextServices().filter(
    (serviceId) =>
        (TEST_ALL_SERVICES || REQUIRED_SERVICES.includes(serviceId)) &&
        !EXCLUDED_SERVICES.includes(serviceId),
);

const anonymousTestCases = () => {
    // All models now require authentication, so always expect 401 for anonymous requests
    return servicesToTest.map((serviceId) => [serviceId, 401]);
};

const authenticatedTestCases = (): [ServiceId, number][] => {
    return servicesToTest.map((serviceId) => [serviceId, 200]);
};

// Use simple numeric prompts to avoid content filter triggers
// Changed from random hex colors which looked like jailbreak attempts
function testMessageContent() {
    return TEST_DISABLE_CACHE
        ? `Count: ${Math.floor(Math.random() * 100)}. Reply with one word.`
        : "Reply: yes or no?";
}

describe("POST /generate/v1/chat/completions (unauthenticated)", async () => {
    test.for(anonymousTestCases())(
        "%s should respond with 401",
        { timeout: 30000 },
        async ([serviceId, expectedStatus], { mocks }) => {
            await mocks.enable("polar", "tinybird", "vcr");
            const response = await SELF.fetch(
                `http://localhost:3000/api/generate/v1/chat/completions`,
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
                                content: testMessageContent(),
                            },
                        ],
                    }),
                },
            );
            expect(response.status).toBe(expectedStatus);
        },
    );
});

// Sends a request to each text model, using bearer auth
describe("POST /generate/v1/chat/completions (authenticated)", async () => {
    test.for(authenticatedTestCases())(
        "%s should respond with 200 when using authorization header",
        { timeout: 30000 },
        async ([serviceId, expectedStatus], { apiKey, mocks }) => {
            await mocks.enable("polar", "tinybird", "vcr");
            const ctx = createExecutionContext();
            const response = await worker.fetch(
                new Request(
                    `http://localhost:3000/api/generate/v1/chat/completions`,
                    {
                        method: "POST",
                        headers: {
                            "content-type": "application/json",
                            "authorization": `Bearer ${apiKey}`,
                        },
                        body: JSON.stringify({
                            model: serviceId,
                            messages: [
                                {
                                    role: "user",
                                    content: testMessageContent(),
                                },
                            ],
                        }),
                    },
                ),
                env,
                ctx,
            );
            expect(response.status).toBe(expectedStatus);

            // consume response
            await response.text();
            await waitOnExecutionContext(ctx);

            // make sure the recorded events contain usage
            const events = mocks.tinybird.state.events;
            expect(events).toHaveLength(1);
            events.forEach((event) => {
                expect(event.modelUsed).toBeDefined();
                expect(event.tokenCountPromptText).toBeGreaterThan(0);
                expect(event.tokenCountCompletionText).toBeGreaterThan(0);
                expect(event.totalCost).toBeGreaterThan(0);
                expect(event.totalPrice).toBeGreaterThanOrEqual(0);
            });
        },
    );
});

describe("POST /generate/v1/chat/completions (streaming)", async () => {
    test.for(authenticatedTestCases())(
        "%s should respond with 200 when streaming",
        { timeout: 30000 },
        async ([serviceId, expectedStatus], { apiKey, mocks }) => {
            await mocks.enable("polar", "tinybird", "vcr");
            const ctx = createExecutionContext();
            const response = await worker.fetch(
                new Request(
                    `http://localhost:3000/api/generate/v1/chat/completions`,
                    {
                        method: "POST",
                        headers: {
                            "content-type": "application/json",
                            "authorization": `Bearer ${apiKey}`,
                        },
                        body: JSON.stringify({
                            model: serviceId,
                            messages: [
                                {
                                    role: "user",
                                    content: testMessageContent(),
                                },
                            ],
                            stream: true,
                        }),
                    },
                ),
                env,
                ctx,
            );
            expect(response.status).toBe(expectedStatus);

            // consume the stream
            await response.text();
            await waitOnExecutionContext(ctx);

            // make sure the recorded events contain usage
            const events = mocks.tinybird.state.events;
            expect(events).toHaveLength(1);
            events.forEach((event) => {
                expect(event.modelUsed).toBeDefined();
                expect(event.tokenCountPromptText).toBeGreaterThan(0);
                expect(event.tokenCountCompletionText).toBeGreaterThan(0);
                expect(event.totalCost).toBeGreaterThan(0);
                expect(event.totalPrice).toBeGreaterThanOrEqual(0);
            });
        },
    );
});

describe("GET /text/:prompt", async () => {
    test.for(authenticatedTestCases())(
        "%s should return plain text",
        { timeout: 30000 },
        async ([serviceId, expectedStatus], { apiKey, mocks }) => {
            await mocks.enable("polar", "tinybird", "vcr");
            const ctx = createExecutionContext();
            const response = await worker.fetch(
                new Request(
                    `http://localhost:3000/api/generate/text/${encodeURIComponent(testMessageContent())}?model=${serviceId}`,
                    {
                        method: "GET",
                        headers: {
                            "authorization": `Bearer ${apiKey}`,
                        },
                    },
                ),
                env,
                ctx,
            );
            expect(response.status).toBe(expectedStatus);

            // Verify content-type is text/plain for text models
            const contentType = response.headers.get("content-type");
            expect(contentType).toContain("text/plain");

            // Verify response is plain text (not JSON)
            const text = await response.text();
            expect(text.length).toBeGreaterThan(0);
            expect(() => JSON.parse(text)).toThrow(); // Should not be valid JSON
            await waitOnExecutionContext(ctx);

            // make sure the recorded events contain usage
            const events = mocks.tinybird.state.events;
            expect(events).toHaveLength(1);
            events.forEach((event) => {
                expect(event.modelUsed).toBeDefined();
                expect(event.tokenCountPromptText).toBeGreaterThan(0);
                expect(event.tokenCountCompletionText).toBeGreaterThan(0);
                expect(event.totalCost).toBeGreaterThan(0);
                expect(event.totalPrice).toBeGreaterThanOrEqual(0);
            });
        },
    );
});

test("Session cookies should not authenticate API proxy routes", async ({
    sessionToken,
    mocks,
}) => {
    await mocks.enable("polar", "tinybird", "vcr");
    const response = await SELF.fetch(
        `http://localhost:3000/api/generate/text/test`,
        {
            method: "GET",
            headers: {
                "Cookie": `better-auth.session_token=${sessionToken}`,
            },
        },
    );
    await response.text();
    expect(response.status).toBe(401);
});

test(
    "POST /v1/chat/completions should reject invalid model",
    { timeout: 30000 },
    async ({ apiKey, mocks }) => {
        await mocks.enable("polar", "tinybird", "vcr");
        const response = await SELF.fetch(
            `http://localhost:3000/api/generate/v1/chat/completions`,
            {
                method: "POST",
                headers: {
                    "content-type": "application/json",
                    "authorization": `Bearer ${apiKey}`,
                },
                body: JSON.stringify({
                    model: "invalid-model-name",
                    messages: [
                        {
                            role: "user",
                            content: testMessageContent(),
                        },
                    ],
                }),
            },
        );
        const body = await response.text();
        // Invalid model is a validation error (user's fault) - should return 400
        expect(response.status).toBe(400);
        const error = JSON.parse(body);
        expect(error.error.message).toContain("Invalid service or alias");
    },
);

test(
    "POST /v1/chat/completions should handle empty messages",
    { timeout: 30000 },
    async ({ apiKey, mocks }) => {
        await mocks.enable("polar", "tinybird", "vcr");
        const response = await SELF.fetch(
            `http://localhost:3000/api/generate/v1/chat/completions`,
            {
                method: "POST",
                headers: {
                    "content-type": "application/json",
                    "authorization": `Bearer ${apiKey}`,
                },
                body: JSON.stringify({
                    model: "openai-fast",
                    messages: [],
                }),
            },
        );
        const body = await response.text();
        // Backend accepts empty messages and model generates a response
        expect(response.status).toBe(200);
        const data = JSON.parse(body);
        expect(data.choices).toBeDefined();
        expect(data.choices[0].message.content).toBeDefined();
    },
);

test(
    "POST /v1/chat/completions should accept image URL for vision models (Issue #5413)",
    { timeout: 60000 },
    async ({ apiKey, mocks }) => {
        await mocks.enable("polar", "tinybird", "vcr");
        const response = await SELF.fetch(
            `http://localhost:3000/api/generate/v1/chat/completions`,
            {
                method: "POST",
                headers: {
                    "content-type": "application/json",
                    "authorization": `Bearer ${apiKey}`,
                },
                body: JSON.stringify({
                    model: "gemini-large",
                    messages: [
                        {
                            role: "user",
                            content: [
                                {
                                    type: "text",
                                    text: "Describe this image in one word.",
                                },
                                {
                                    type: "image_url",
                                    image_url: {
                                        url: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a7/Camponotus_flavomarginatus_ant.jpg/320px-Camponotus_flavomarginatus_ant.jpg",
                                    },
                                },
                            ],
                        },
                    ],
                    max_tokens: 50,
                }),
            },
        );
        expect(response.status).toBe(200);
        const data = await response.json();
        expect((data as any).choices[0].message.content).toBeTruthy();
    },
);

test(
    "POST /v1/chat/completions should include usage",
    { timeout: 30000 },
    async ({ apiKey, mocks }) => {
        await mocks.enable("polar", "tinybird", "vcr");
        const response = await SELF.fetch(
            `http://localhost:3000/api/generate/v1/chat/completions`,
            {
                method: "POST",
                headers: {
                    "content-type": "application/json",
                    "authorization": `Bearer ${apiKey}`,
                },
                body: JSON.stringify({
                    model: "openai-fast",
                    messages: [
                        {
                            role: "user",
                            content: testMessageContent(),
                        },
                    ],
                }),
            },
        );
        expect(response.status).toBe(200);
        const data = await response.json();
        const usage = await CompletionUsageSchema.parseAsync(
            (data as any).usage,
        );
        expect(usage.prompt_tokens).toBeGreaterThan(0);
        expect(usage.completion_tokens).toBeGreaterThan(0);
        expect(usage.total_tokens).toBeGreaterThan(0);
        const usageHeaders = parseUsageHeaders(response.headers);
        const totalPromptTokens =
            (usageHeaders.promptTextTokens || 0) +
            (usageHeaders.promptCachedTokens || 0);
        const totalCompletionTokens =
            (usageHeaders.completionTextTokens || 0) +
            (usageHeaders.completionReasoningTokens || 0);
        expect(totalPromptTokens).toEqual(usage.prompt_tokens);
        expect(totalCompletionTokens).toEqual(usage.completion_tokens);
    },
);
