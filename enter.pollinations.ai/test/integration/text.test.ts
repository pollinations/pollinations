import { getTextServices } from "@shared/registry/registry.ts";
import { SELF } from "cloudflare:test";
import { test } from "../fixtures.ts";
import { describe, expect } from "vitest";
import { env } from "cloudflare:workers";
import type { ServiceId } from "@shared/registry/registry.ts";
import { CompletionUsageSchema } from "@/schemas/openai.ts";
import { parseUsageHeaders } from "@shared/registry/usage-headers.ts";

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

// Send a request to each text model without authentication
// All models now require authentication, so all should return 401
describe("Unauthenticated requests", () => {
    test.for(anonymousTestCases())(
        "%s should respond with 401 when unauthenticated",
        { timeout: 30000 },
        async ([serviceId, expectedStatus], { mocks }) => {
            mocks.enable("polar", "tinybird");
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
test.for(authenticatedTestCases())(
    "%s should respond with 200 when using authorization header",
    { timeout: 30000 },
    async ([serviceId, expectedStatus], { apiKey, mocks }) => {
        mocks.enable("polar", "tinybird");
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
        mocks.enable("polar", "tinybird");
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
    async ([serviceId, expectedStatus], { apiKey, mocks }) => {
        mocks.enable("polar", "tinybird");
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
    async ({ apiKey, mocks }) => {
        mocks.enable("polar", "tinybird");
        const response = await SELF.fetch(
            `http://localhost:3000/api/generate/text/hi?model=openai-audio`,
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

// Test audio output (text-to-speech) with modalities
test(
    "openai-audio with modalities should return audio output",
    { timeout: 30000 },
    async ({ apiKey, mocks }) => {
        mocks.enable("polar", "tinybird");
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
                    model: "openai-audio",
                    modalities: ["text", "audio"],
                    audio: {
                        voice: "alloy",
                        format: "wav",
                    },
                    messages: [
                        {
                            role: "user",
                            content: "Say hi",
                        },
                    ],
                }),
            },
        );
        expect(response.status).toBe(200);

        const data = (await response.json()) as {
            choices: {
                message: {
                    audio: {
                        transcript: string;
                        data: string;
                    };
                };
            }[];
            usage: {
                completion_tokens_details: {
                    audio_tokens: number;
                };
            };
        };
        expect(data.choices).toBeDefined();
        expect(data.choices[0].message.audio).toBeDefined();
        expect(data.choices[0].message.audio.transcript).toBeDefined();
        expect(data.choices[0].message.audio.data).toBeDefined();
        expect(
            data.usage.completion_tokens_details.audio_tokens,
        ).toBeGreaterThan(0);
    },
);

// Test audio input (transcription) with input_audio content type
test(
    "openai-audio with input_audio should transcribe audio",
    { timeout: 30000 },
    async ({ apiKey, mocks }) => {
        mocks.enable("polar", "tinybird");

        // Fetch real speech audio from OpenAI sample and convert to base64
        const audioResponse = await fetch(
            "https://cdn.openai.com/API/docs/audio/alloy.wav",
        );
        const audioBuffer = await audioResponse.arrayBuffer();
        const sampleAudioBase64 = Buffer.from(audioBuffer).toString("base64");

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
                    model: "openai-audio",
                    modalities: ["text", "audio"],
                    audio: {
                        voice: "alloy",
                        format: "wav",
                    },
                    messages: [
                        {
                            role: "user",
                            content: [
                                {
                                    type: "text",
                                    text: "What's in this?",
                                },
                                {
                                    type: "input_audio",
                                    input_audio: {
                                        data: sampleAudioBase64,
                                        format: "wav",
                                    },
                                },
                            ],
                        },
                    ],
                }),
            },
        );
        expect(response.status).toBe(200);

        const data = (await response.json()) as any;
        expect(data.choices).toBeDefined();
        expect(data.choices[0].message.content).toBeDefined();
        expect(data.usage.prompt_tokens_details.audio_tokens).toBeGreaterThan(
            0,
        );
    },
);

// ... (rest of the code remains the same)
test("Session cookies should not authenticate API proxy routes", async ({
    sessionToken,
    mocks,
}) => {
    mocks.enable("polar", "tinybird");
    const response = await SELF.fetch(
        `http://localhost:3000/api/generate/text/test`,
        {
            method: "GET",
            headers: {
                "Cookie": `better-auth.session_token=${sessionToken}`,
            },
        },
    );
    expect(response.status).toBe(401);
});

// Test invalid model handling
test(
    "POST /v1/chat/completions should reject invalid model",
    { timeout: 30000 },
    async ({ apiKey, mocks }) => {
        mocks.enable("polar", "tinybird");
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
        console.log(`[TEST] Invalid model response status: ${response.status}`);
        console.log(`[TEST] Invalid model response body: ${body}`);
        // Invalid model is a validation error (user's fault) - should return 400
        expect(response.status).toBe(400);
        const error = JSON.parse(body);
        expect(error.error.message).toContain("Invalid service or alias");
    },
);

// Test empty message handling
test(
    "POST /v1/chat/completions should handle empty messages",
    { timeout: 30000 },
    async ({ apiKey, mocks }) => {
        mocks.enable("polar", "tinybird");
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
                    model: "openai-fast",
                    messages: [],
                }),
            },
        );
        const body = await response.text();
        console.log(
            `[TEST] Empty messages response status: ${response.status}`,
        );
        console.log(`[TEST] Empty messages response body: ${body}`);
        // Backend accepts empty messages and model generates a response
        expect(response.status).toBe(200);
        const data = JSON.parse(body);
        expect(data.choices).toBeDefined();
        expect(data.choices[0].message.content).toBeDefined();
    },
);

test(
    "POST /v1/chat/completions should include usage",
    { timeout: 30000 },
    async ({ apiKey, mocks }) => {
        mocks.enable("polar", "tinybird");
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
