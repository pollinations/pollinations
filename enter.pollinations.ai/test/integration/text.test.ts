import { isFreeService, getTextServices } from "@shared/registry/registry.ts";
import { SELF } from "cloudflare:test";
import { test } from "../fixtures.ts";
import { describe, beforeEach, expect } from "vitest";
import { env } from "cloudflare:workers";
import { ServiceId } from "@shared/registry/registry.ts";

const TEST_DISABLE_CACHE = true;
const TEST_ALL_SERVICES = false;

const REQUIRED_SERVICES = [
    "openai",
    "openai-fast",
    "openai-large",
    // "chickytutor",
];

const servicesToTest = getTextServices().filter(
    (serviceId) => TEST_ALL_SERVICES || REQUIRED_SERVICES.includes(serviceId),
);

const anonymousTestCases = (allowAnoymous: boolean) => {
    return servicesToTest.map((serviceId) => [
        serviceId,
        isFreeService(serviceId) && allowAnoymous ? 200 : 401,
    ]);
};

const authenticatedTestCases = (): [ServiceId, number][] => {
    return servicesToTest.map((serviceId) => [serviceId, 200]);
};

const randomString = (length: number) => {
    return crypto.getRandomValues(new Uint8Array(length)).join("");
};

function testMessageContent() {
    return TEST_DISABLE_CACHE
        ? `Do you like this string: ${randomString(10)}? Only answer yes or no.`
        : "Do you prefer 0, or 1? Just answer with 0 or 1.";
}

// Send a request to each text model without authentication
// and makes sure that the response status is in line with
// the value of ALLOW_ANONYMOUS_USAGE
describe.for([true, false])(
    "When ALLOW_ANONYMOUS_USAGE is %s",
    (allowAnoymous) => {
        beforeEach(() => {
            env.ALLOW_ANONYMOUS_USAGE = allowAnoymous;
        });
        test.for(anonymousTestCases(allowAnoymous))(
            "%s should respond %s when unauthenticated",
            { timeout: 30000 },
            async ([serviceId, expectedStatus]) => {
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
    },
);

// Sends a request to each text model, using bearer auth
test.for(authenticatedTestCases())(
    "%s should respond with 200 when using authorization header",
    { timeout: 30000 },
    async ([serviceId, expectedStatus], { apiKey }) => {
        const response = await SELF.fetch(
            `http://localhost:3000/api/generate/v1/chat/completions`,
            {
                method: "POST",
                headers: {
                    "content-type": "application/json",
                    "authorization": `Bearer ${apiKey}`,
                    "referer": env.TESTING_REFERRER,
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

test.for(authenticatedTestCases())(
    "%s should respond with 200 when streaming",
    { timeout: 30000 },
    async ([serviceId, expectedStatus], { apiKey, mocks }) => {
        const response = await SELF.fetch(
            `http://localhost:3000/api/generate/v1/chat/completions`,
            {
                method: "POST",
                headers: {
                    "content-type": "application/json",
                    "authorization": `Bearer ${apiKey}`,
                    "referer": env.TESTING_REFERRER,
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
        );
        expect(response.status).toBe(expectedStatus);

        // consume the stream
        await response.text();

        // wait for event to be processed
        await new Promise((resolve) => setTimeout(resolve, 50));

        // make sure the recorded events contain usage
        const events = mocks.tinybird.state.events;
        expect(events).toHaveLength(1);
        events.forEach((event) => {
            expect(event.modelUsed).toBeDefined();
            expect(event.tokenCountPromptText).toBeGreaterThan(0);
            expect(event.tokenCountCompletionText).toBeGreaterThan(0);
            expect(event.totalCost).toBeGreaterThan(0);
        });
    },
);

// Test GET /text/:prompt endpoint returns plain text for text models
test.for(authenticatedTestCases())(
    "GET /text/:prompt with %s should return plain text",
    { timeout: 30000 },
    async ([serviceId, expectedStatus], { apiKey }) => {
        const response = await SELF.fetch(
            `http://localhost:3000/api/generate/text/${encodeURIComponent(testMessageContent())}?model=${serviceId}`,
            {
                method: "GET",
                headers: {
                    "authorization": `Bearer ${apiKey}`,
                    "referer": env.TESTING_REFERRER,
                },
            },
        );
        expect(response.status).toBe(expectedStatus);

        // Verify content-type is text/plain for text models
        const contentType = response.headers.get("content-type");
        expect(contentType).toContain("text/plain");

        // Verify response is plain text (not JSON)
        const text = await response.text();
        expect(text.length).toBeGreaterThan(0);
        expect(() => JSON.parse(text)).toThrow(); // Should not be valid JSON
    },
);

// Test GET /text/:prompt endpoint returns raw audio for audio models
test(
    "GET /text/:prompt with openai-audio should return raw audio",
    { timeout: 30000 },
    async ({ apiKey }) => {
        const response = await SELF.fetch(
            `http://localhost:3000/api/generate/text/hello?model=openai-audio`,
            {
                method: "GET",
                headers: {
                    "authorization": `Bearer ${apiKey}`,
                    "referer": env.TESTING_REFERRER,
                },
            },
        );
        expect(response.status).toBe(200);

        // Verify content-type is audio
        const contentType = response.headers.get("content-type");
        expect(contentType).toContain("audio/");

        // Verify response is binary audio data
        const arrayBuffer = await response.arrayBuffer();
        expect(arrayBuffer.byteLength).toBeGreaterThan(0);
    },
);
