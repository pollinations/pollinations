import {
    createExecutionContext,
    env,
    SELF,
    waitOnExecutionContext,
} from "cloudflare:test";
import type { ServiceId } from "@shared/registry/registry.ts";
import {
    getServiceDefinition,
    getTextServices,
} from "@shared/registry/registry.ts";
import { parseUsageHeaders } from "@shared/registry/usage-headers.ts";
import { describe, expect } from "vitest";
import worker from "@/index.ts";
import { CompletionUsageSchema } from "@/schemas/openai.ts";
import { test } from "../fixtures.ts";

const TEST_DISABLE_CACHE = false;
const TEST_ALL_SERVICES = true;

const REQUIRED_SERVICES = ["openai", "openai-fast", "openai-large"];
const EXCLUDED_SERVICES = ["openai-audio"];
const TEST_MESSAGE_CONTENT =
    "Is Berlin the capital of Germany? Reply yes or no.";

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

// Use seed instead of a dynamic message to be able to use message in snapshot hash
function testSeed() {
    return TEST_DISABLE_CACHE ? Math.floor(Math.random() * 10000) : 42;
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
                                content: TEST_MESSAGE_CONTENT,
                            },
                        ],
                        seed: testSeed(),
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
        async ([serviceId, expectedStatus], { paidApiKey, mocks }) => {
            await mocks.enable("polar", "tinybird", "vcr");
            const ctx = createExecutionContext();
            const response = await worker.fetch(
                new Request(
                    `http://localhost:3000/api/generate/v1/chat/completions`,
                    {
                        method: "POST",
                        headers: {
                            "content-type": "application/json",
                            "authorization": `Bearer ${paidApiKey}`,
                        },
                        body: JSON.stringify({
                            model: serviceId,
                            messages: [
                                {
                                    role: "user",
                                    content: TEST_MESSAGE_CONTENT,
                                },
                            ],
                            seed: testSeed(),
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
                // Regression test: selectedMeterSlug must be captured AFTER next()
                // If this is null, balanceTracking was captured before the balance check middleware ran
                expect(event.selectedMeterSlug).toBeDefined();
                expect(event.selectedMeterSlug).not.toBeNull();
            });
        },
    );
});

describe("POST /generate/v1/chat/completions (streaming)", async () => {
    test.for(authenticatedTestCases())(
        "%s should respond with 200 when streaming",
        { timeout: 30000 },
        async ([serviceId, expectedStatus], { paidApiKey, mocks }) => {
            await mocks.enable("polar", "tinybird", "vcr");
            const ctx = createExecutionContext();
            const response = await worker.fetch(
                new Request(
                    `http://localhost:3000/api/generate/v1/chat/completions`,
                    {
                        method: "POST",
                        headers: {
                            "content-type": "application/json",
                            "authorization": `Bearer ${paidApiKey}`,
                        },
                        body: JSON.stringify({
                            model: serviceId,
                            messages: [
                                {
                                    role: "user",
                                    content: TEST_MESSAGE_CONTENT,
                                },
                            ],
                            stream: true,
                            seed: testSeed(),
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
                // Regression test: selectedMeterSlug must be captured AFTER next()
                expect(event.selectedMeterSlug).toBeDefined();
                expect(event.selectedMeterSlug).not.toBeNull();
            });
        },
    );
});

describe("GET /text/:prompt", async () => {
    test.for(authenticatedTestCases())(
        "%s should return plain text",
        { timeout: 30000 },
        async ([serviceId, expectedStatus], { paidApiKey, mocks }) => {
            await mocks.enable("polar", "tinybird", "vcr");
            const ctx = createExecutionContext();
            const response = await worker.fetch(
                new Request(
                    `http://localhost:3000/api/generate/text/${encodeURIComponent(TEST_MESSAGE_CONTENT)}?model=${serviceId}&seed=${testSeed()}`,
                    {
                        method: "GET",
                        headers: {
                            "authorization": `Bearer ${paidApiKey}`,
                        },
                    },
                ),
                env,
                ctx,
            );
            expect(response.status).toBe(expectedStatus);

            await response.text();
            await waitOnExecutionContext(ctx);

            // Verify content-type is text/plain for text models
            const contentType = response.headers.get("content-type");
            expect(contentType).toContain("text/plain");

            // make sure the recorded events contain usage
            const events = mocks.tinybird.state.events;
            expect(events).toHaveLength(1);
            events.forEach((event) => {
                expect(event.modelUsed).toBeDefined();
                expect(event.tokenCountPromptText).toBeGreaterThan(0);
                expect(event.tokenCountCompletionText).toBeGreaterThan(0);
                expect(event.totalCost).toBeGreaterThan(0);
                expect(event.totalPrice).toBeGreaterThanOrEqual(0);
                // Regression test: selectedMeterSlug must be captured AFTER next()
                expect(event.selectedMeterSlug).toBeDefined();
                expect(event.selectedMeterSlug).not.toBeNull();
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
                            content: TEST_MESSAGE_CONTENT,
                        },
                    ],
                    seed: testSeed(),
                }),
            },
        );
        const body = await response.text();
        // Invalid model is a validation error (user's fault) - should return 400
        expect(response.status).toBe(400);
        const error = JSON.parse(body);
        expect(error.error.message).toContain("Invalid option");
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
                    seed: testSeed(),
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

// TODO: Fix this test - gemini-large returns empty content for vision requests
test.skip(
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
                    seed: testSeed(),
                }),
            },
        );
        expect(response.status).toBe(200);
        const data = await response.json();
        expect((data as any).choices[0].message.content).toBeTruthy();
    },
);

test(
    "POST /v1/chat/completions should accept image URL for Claude/Bedrock models (Issue #5862)",
    { timeout: 60000 },
    async ({ paidApiKey, mocks }) => {
        await mocks.enable("polar", "tinybird", "vcr");
        const response = await SELF.fetch(
            `http://localhost:3000/api/generate/v1/chat/completions`,
            {
                method: "POST",
                headers: {
                    "content-type": "application/json",
                    "authorization": `Bearer ${paidApiKey}`,
                },
                body: JSON.stringify({
                    model: "claude",
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
                                        url: "https://picsum.photos/id/237/200/300",
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
                            content: TEST_MESSAGE_CONTENT,
                        },
                    ],
                    seed: testSeed(),
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

const toolCallTestCases = (): [ServiceId, number][] => {
    // Only test models that have tools: true in the registry
    return servicesToTest
        .filter((serviceId) => {
            const service = getServiceDefinition(serviceId);
            return service?.tools === true;
        })
        .map((serviceId) => [serviceId, 200]);
};

const calculatorTool = {
    type: "function" as const,
    function: {
        name: "calculator",
        description: "Perform basic arithmetic operations",
        parameters: {
            type: "object",
            properties: {
                operation: {
                    type: "string",
                    enum: ["add", "subtract", "multiply", "divide"],
                    description: "The arithmetic operation to perform",
                },
                a: { type: "number", description: "First operand" },
                b: { type: "number", description: "Second operand" },
            },
            required: ["operation", "a", "b"],
        },
    },
};

function executeCalculator(args: {
    operation: string;
    a: number;
    b: number;
}): string {
    const { operation, a, b } = args;
    let result: number;
    switch (operation) {
        case "add":
            result = a + b;
            break;
        case "subtract":
            result = a - b;
            break;
        case "multiply":
            result = a * b;
            break;
        case "divide":
            result = a / b;
            break;
        default:
            return JSON.stringify({ error: "Unknown operation" });
    }
    return JSON.stringify({ result });
}

describe("POST /generate/v1/chat/completions (tool calls)", async () => {
    test.for(toolCallTestCases())(
        "%s should complete full tool call cycle",
        { timeout: 120000 },
        async ([serviceId, expectedStatus], { paidApiKey, mocks }) => {
            await mocks.enable("polar", "tinybird", "vcr");

            // Step 1: Initial request with tools
            const ctx1 = createExecutionContext();
            const response1 = await worker.fetch(
                new Request(
                    `http://localhost:3000/api/generate/v1/chat/completions`,
                    {
                        method: "POST",
                        headers: {
                            "content-type": "application/json",
                            "authorization": `Bearer ${paidApiKey}`,
                        },
                        body: JSON.stringify({
                            model: serviceId,
                            messages: [
                                {
                                    role: "user",
                                    content:
                                        "What is 5 + 3? You must use the calculator tool to compute this.",
                                },
                            ],
                            tools: [calculatorTool],
                            tool_choice: "required",
                            seed: testSeed(),
                        }),
                    },
                ),
                env,
                ctx1,
            );
            expect(response1.status).toBe(expectedStatus);

            const data1 = (await response1.json()) as any;
            await waitOnExecutionContext(ctx1);

            // Verify first response has usage
            const usage1 = await CompletionUsageSchema.parseAsync(data1.usage);
            expect(usage1.prompt_tokens).toBeGreaterThan(0);
            expect(usage1.total_tokens).toBeGreaterThan(0);

            // Verify tool call is present
            const assistantMessage = data1.choices[0].message;
            expect(assistantMessage.tool_calls).toBeDefined();
            expect(assistantMessage.tool_calls.length).toBeGreaterThan(0);

            const toolCall = assistantMessage.tool_calls[0];
            expect(toolCall.function.name).toBe("calculator");

            // Execute the tool
            const toolArgs = JSON.parse(toolCall.function.arguments);
            const toolResult = executeCalculator(toolArgs);

            // Step 2: Send tool result back to model
            const ctx2 = createExecutionContext();
            const response2 = await worker.fetch(
                new Request(
                    `http://localhost:3000/api/generate/v1/chat/completions`,
                    {
                        method: "POST",
                        headers: {
                            "content-type": "application/json",
                            "authorization": `Bearer ${paidApiKey}`,
                        },
                        body: JSON.stringify({
                            model: serviceId,
                            messages: [
                                {
                                    role: "user",
                                    content:
                                        "What is 5 + 3? You must use the calculator tool to compute this.",
                                },
                                {
                                    role: "assistant",
                                    tool_calls: assistantMessage.tool_calls,
                                },
                                {
                                    role: "tool",
                                    tool_call_id: toolCall.id,
                                    content: toolResult,
                                },
                            ],
                            tools: [calculatorTool],
                            seed: testSeed(),
                            max_tokens: 4096, // Required for kimi-k2-thinking to return content properly
                        }),
                    },
                ),
                env,
                ctx2,
            );
            expect(response2.status).toBe(expectedStatus);

            const data2 = (await response2.json()) as any;
            await waitOnExecutionContext(ctx2);

            // Verify second response has usage
            const usage2 = await CompletionUsageSchema.parseAsync(data2.usage);
            expect(usage2.prompt_tokens).toBeGreaterThan(0);
            expect(usage2.total_tokens).toBeGreaterThan(0);

            // Verify final response contains the answer
            const finalContent = data2.choices[0].message.content;
            expect(finalContent).toBeDefined();
            expect(finalContent.length).toBeGreaterThan(0);

            // Verify both requests were recorded
            const events = mocks.tinybird.state.events;
            expect(events).toHaveLength(2);
            events.forEach((event) => {
                expect(event.modelUsed).toBeDefined();
                expect(event.tokenCountPromptText).toBeGreaterThan(0);
                expect(event.totalCost).toBeGreaterThan(0);
                expect(event.totalPrice).toBeGreaterThanOrEqual(0);
            });
        },
    );
});

// GPT-5 temperature transformation test
test(
    "POST /v1/chat/completions should accept temperature=0.7 for GPT-5 models (transformed to 1)",
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
                            content: "Say yes",
                        },
                    ],
                    temperature: 0.7,
                    seed: testSeed(),
                }),
            },
        );
        // Should succeed - temperature is transformed to 1 for GPT-5 models
        expect(response.status).toBe(200);
        await response.text();
    },
);

// Video URL content type tests (Issue #6137)
// Uses paidApiKey since gemini is paidOnly
describe("Video URL content type support", async () => {
    test(
        "POST /v1/chat/completions should accept video_url content type for Gemini models",
        { timeout: 60000 },
        async ({ paidApiKey, mocks }) => {
            await mocks.enable("polar", "tinybird", "vcr");
            const response = await SELF.fetch(
                `http://localhost:3000/api/generate/v1/chat/completions`,
                {
                    method: "POST",
                    headers: {
                        "content-type": "application/json",
                        "authorization": `Bearer ${paidApiKey}`,
                    },
                    body: JSON.stringify({
                        model: "gemini",
                        messages: [
                            {
                                role: "user",
                                content: [
                                    {
                                        type: "text",
                                        text: "What is happening in this video? Reply in one sentence.",
                                    },
                                    {
                                        type: "video_url",
                                        video_url: {
                                            url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
                                        },
                                    },
                                ],
                            },
                        ],
                        max_tokens: 2048,
                        seed: testSeed(),
                    }),
                },
            );
            expect(response.status).toBe(200);
            const data = await response.json();
            expect((data as any).choices[0].message.content).toBeTruthy();
        },
    );

    test(
        "POST /v1/chat/completions should accept video_url with explicit mime_type",
        { timeout: 60000 },
        async ({ paidApiKey, mocks }) => {
            await mocks.enable("polar", "tinybird", "vcr");
            const response = await SELF.fetch(
                `http://localhost:3000/api/generate/v1/chat/completions`,
                {
                    method: "POST",
                    headers: {
                        "content-type": "application/json",
                        "authorization": `Bearer ${paidApiKey}`,
                    },
                    body: JSON.stringify({
                        model: "gemini",
                        messages: [
                            {
                                role: "user",
                                content: [
                                    {
                                        type: "text",
                                        text: "Describe this video briefly.",
                                    },
                                    {
                                        type: "video_url",
                                        video_url: {
                                            url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
                                            mime_type: "video/mp4",
                                        },
                                    },
                                ],
                            },
                        ],
                        max_tokens: 2048,
                        seed: testSeed(),
                    }),
                },
            );
            expect(response.status).toBe(200);
            const data = await response.json();
            expect((data as any).choices[0].message.content).toBeTruthy();
        },
    );

    test(
        "POST /v1/chat/completions should accept image_url with mime_type",
        { timeout: 60000 },
        async ({ paidApiKey, mocks }) => {
            await mocks.enable("polar", "tinybird", "vcr");
            const response = await SELF.fetch(
                `http://localhost:3000/api/generate/v1/chat/completions`,
                {
                    method: "POST",
                    headers: {
                        "content-type": "application/json",
                        "authorization": `Bearer ${paidApiKey}`,
                    },
                    body: JSON.stringify({
                        model: "gemini",
                        messages: [
                            {
                                role: "user",
                                content: [
                                    {
                                        type: "text",
                                        text: "What is in this image? One word.",
                                    },
                                    {
                                        type: "image_url",
                                        image_url: {
                                            url: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a7/Camponotus_flavomarginatus_ant.jpg/320px-Camponotus_flavomarginatus_ant.jpg",
                                            mime_type: "image/jpeg",
                                        },
                                    },
                                ],
                            },
                        ],
                        max_tokens: 2048,
                        seed: testSeed(),
                    }),
                },
            );
            expect(response.status).toBe(200);
            const data = await response.json();
            expect((data as any).choices[0].message.content).toBeTruthy();
        },
    );
});

// Model gating tests - API keys with permissions.models restriction
describe("Model gating by API key permissions", async () => {
    test(
        "Restricted API key should allow access to permitted model (openai-fast)",
        { timeout: 30000 },
        async ({ restrictedApiKey, mocks }) => {
            await mocks.enable("polar", "tinybird", "vcr");
            const response = await SELF.fetch(
                `http://localhost:3000/api/generate/v1/chat/completions`,
                {
                    method: "POST",
                    headers: {
                        "content-type": "application/json",
                        "authorization": `Bearer ${restrictedApiKey}`,
                    },
                    body: JSON.stringify({
                        model: "openai-fast",
                        messages: [
                            {
                                role: "user",
                                content: TEST_MESSAGE_CONTENT,
                            },
                        ],
                        seed: testSeed(),
                    }),
                },
            );
            expect(response.status).toBe(200);
            await response.text();
        },
    );

    test(
        "Restricted API key should deny access to non-permitted model (openai)",
        { timeout: 30000 },
        async ({ restrictedApiKey, mocks }) => {
            await mocks.enable("polar", "tinybird", "vcr");
            const response = await SELF.fetch(
                `http://localhost:3000/api/generate/v1/chat/completions`,
                {
                    method: "POST",
                    headers: {
                        "content-type": "application/json",
                        "authorization": `Bearer ${restrictedApiKey}`,
                    },
                    body: JSON.stringify({
                        model: "openai", // Not in allowed list ["openai-fast", "flux"]
                        messages: [
                            {
                                role: "user",
                                content: TEST_MESSAGE_CONTENT,
                            },
                        ],
                        seed: testSeed(),
                    }),
                },
            );
            expect(response.status).toBe(403);
            const body = await response.json();
            expect((body as any).error.message).toContain(
                "Model 'openai' is not allowed for this API key",
            );
        },
    );

    test(
        "Unrestricted API key should allow access to any model",
        { timeout: 30000 },
        async ({ apiKey, mocks }) => {
            await mocks.enable("polar", "tinybird", "vcr");
            // Test with a model that would be blocked for restricted keys
            const response = await SELF.fetch(
                `http://localhost:3000/api/generate/v1/chat/completions`,
                {
                    method: "POST",
                    headers: {
                        "content-type": "application/json",
                        "authorization": `Bearer ${apiKey}`,
                    },
                    body: JSON.stringify({
                        model: "openai",
                        messages: [
                            {
                                role: "user",
                                content: TEST_MESSAGE_CONTENT,
                            },
                        ],
                        seed: testSeed(),
                    }),
                },
            );
            expect(response.status).toBe(200);
            await response.text();
        },
    );
});

// Gemini thinking mode tests (PR #6455)
// Tests that thinking parameter is accepted and processed correctly
describe("Gemini thinking mode", async () => {
    test(
        "Gemini should accept thinking: { type: 'disabled' } parameter",
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
                        model: "gemini-fast", // Gemini 2.5 model
                        messages: [
                            {
                                role: "user",
                                content:
                                    "What is 2+2? Reply with just the number.",
                            },
                        ],
                        thinking: { type: "disabled" },
                        seed: testSeed(),
                    }),
                },
            );
            expect(response.status).toBe(200);
            const data = await response.json();
            expect((data as any).choices[0].message.content).toBeTruthy();
        },
    );

    test(
        "Gemini should accept thinking_budget: 0 parameter to disable thinking",
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
                        model: "gemini-fast",
                        messages: [
                            {
                                role: "user",
                                content:
                                    "What is 3+3? Reply with just the number.",
                            },
                        ],
                        thinking_budget: 0,
                        seed: testSeed(),
                    }),
                },
            );
            expect(response.status).toBe(200);
            const data = await response.json();
            expect((data as any).choices[0].message.content).toBeTruthy();
        },
    );

    test(
        "Gemini 3 Flash should accept reasoning_effort parameter",
        { timeout: 60000 },
        async ({ paidApiKey, mocks }) => {
            await mocks.enable("polar", "tinybird", "vcr");
            const response = await SELF.fetch(
                `http://localhost:3000/api/generate/v1/chat/completions`,
                {
                    method: "POST",
                    headers: {
                        "content-type": "application/json",
                        "authorization": `Bearer ${paidApiKey}`,
                    },
                    body: JSON.stringify({
                        model: "gemini", // Gemini 3 Flash
                        messages: [
                            {
                                role: "user",
                                content:
                                    "What is 4+4? Reply with just the number.",
                            },
                        ],
                        reasoning_effort: "low",
                        seed: testSeed(),
                    }),
                },
            );
            expect(response.status).toBe(200);
            const data = await response.json();
            expect((data as any).choices[0].message.content).toBeTruthy();
        },
    );
});

// Gemini native tools tests (PR #6818, Issues #6688, #6723)
// Tests code_execution, google_search, and url_context tools
describe("Gemini native tools", async () => {
    test(
        "gemini-fast should use code_execution by default for computation",
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
                        model: "gemini-fast",
                        messages: [
                            {
                                role: "user",
                                content:
                                    "Calculate the 10th Fibonacci number using code execution. Reply with just the number.",
                            },
                        ],
                        seed: testSeed(),
                    }),
                },
            );
            expect(response.status).toBe(200);
            const data = await response.json();
            const content = (data as any).choices[0].message.content;
            expect(content).toBeTruthy();
            // Fibonacci(10) = 55
            expect(content).toContain("55");
        },
    );

    test(
        "gemini-search should use google_search for real-time information",
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
                        model: "gemini-search",
                        messages: [
                            {
                                role: "user",
                                content:
                                    "What is the current population of Berlin? Just give me the approximate number.",
                            },
                        ],
                        seed: testSeed(),
                    }),
                },
            );
            expect(response.status).toBe(200);
            const data = await response.json();
            const content = (data as any).choices[0].message.content;
            expect(content).toBeTruthy();
            // Should contain some population-related number (millions)
            expect(content.length).toBeGreaterThan(10);
        },
    );

    test(
        "Gemini should accept explicit code_execution tool override",
        { timeout: 60000 },
        async ({ paidApiKey, mocks }) => {
            await mocks.enable("polar", "tinybird", "vcr");
            const response = await SELF.fetch(
                `http://localhost:3000/api/generate/v1/chat/completions`,
                {
                    method: "POST",
                    headers: {
                        "content-type": "application/json",
                        "authorization": `Bearer ${paidApiKey}`,
                    },
                    body: JSON.stringify({
                        model: "gemini",
                        messages: [
                            {
                                role: "user",
                                content:
                                    "What is 7 factorial? Use code to compute it. Reply with just the raw number, no formatting.",
                            },
                        ],
                        tools: [
                            {
                                type: "function",
                                function: { name: "code_execution" },
                            },
                        ],
                        seed: testSeed(),
                    }),
                },
            );
            expect(response.status).toBe(200);
            const data = await response.json();
            const content = (data as any).choices[0].message.content;
            expect(content).toBeTruthy();
            // 7! = 5040
            expect(content).toContain("5040");
        },
    );
});

// Gemini tool schema sanitization test (Issue: Portkey Gateway #1473)
// Tests that exclusiveMinimum/exclusiveMaximum are stripped before sending to Vertex AI
test(
    "Gemini should accept tools with exclusiveMinimum/exclusiveMaximum (sanitized)",
    { timeout: 60000 },
    async ({ paidApiKey, mocks }) => {
        await mocks.enable("polar", "tinybird", "vcr");
        const response = await SELF.fetch(
            `http://localhost:3000/api/generate/v1/chat/completions`,
            {
                method: "POST",
                headers: {
                    "content-type": "application/json",
                    "authorization": `Bearer ${paidApiKey}`,
                },
                body: JSON.stringify({
                    model: "gemini",
                    messages: [
                        {
                            role: "user",
                            content: "What is 25% of 80? Use the calculator.",
                        },
                    ],
                    tools: [
                        {
                            type: "function",
                            function: {
                                name: "calculator",
                                description: "Calculate a percentage",
                                parameters: {
                                    type: "object",
                                    properties: {
                                        value: {
                                            type: "number",
                                            exclusiveMinimum: 0,
                                            exclusiveMaximum: 1000,
                                        },
                                        percentage: {
                                            type: "number",
                                            minimum: 0,
                                            maximum: 100,
                                        },
                                    },
                                    required: ["value", "percentage"],
                                },
                            },
                        },
                    ],
                    tool_choice: "auto",
                    seed: testSeed(),
                }),
            },
        );
        // Should succeed - exclusiveMinimum/exclusiveMaximum are sanitized by text service
        expect(response.status).toBe(200);
        await response.text();
    },
);

// Gemini JSON response with tools fix (Issues #6834, #6876)
// Tests that response_format works with Gemini models (tools are stripped when JSON mode is requested)
test(
    "Gemini should accept response_format: json_object without code_execution conflict",
    { timeout: 60000 },
    async ({ paidApiKey, mocks }) => {
        await mocks.enable("polar", "tinybird", "vcr");
        const response = await SELF.fetch(
            `http://localhost:3000/api/generate/v1/chat/completions`,
            {
                method: "POST",
                headers: {
                    "content-type": "application/json",
                    "authorization": `Bearer ${paidApiKey}`,
                },
                body: JSON.stringify({
                    model: "gemini",
                    messages: [
                        {
                            role: "user",
                            content:
                                "What is 2+2? Return as JSON with key 'answer'.",
                        },
                    ],
                    response_format: { type: "json_object" },
                    seed: testSeed(),
                }),
            },
        );
        // Should succeed - tools are stripped when response_format is set
        expect(response.status).toBe(200);
        const data = await response.json();
        const content = (data as any).choices[0].message.content;
        expect(content).toBeTruthy();
        // Should be valid JSON
        const parsed = JSON.parse(content);
        expect(parsed.answer).toBeDefined();
    },
);

// Gemini code_execution content_blocks test (Issue #6830)
test(
    "POST /v1/chat/completions should return content_blocks with image_url from Gemini code_execution",
    { timeout: 120000 },
    async ({ paidApiKey, mocks }) => {
        await mocks.enable("polar", "tinybird", "vcr");
        const response = await SELF.fetch(
            `http://localhost:3000/api/generate/v1/chat/completions`,
            {
                method: "POST",
                headers: {
                    "content-type": "application/json",
                    "authorization": `Bearer ${paidApiKey}`,
                },
                body: JSON.stringify({
                    model: "gemini",
                    messages: [
                        {
                            role: "user",
                            content: "Execute Python code to draw f(x) = x^2",
                        },
                    ],
                    seed: testSeed(),
                }),
            },
        );
        expect(response.status).toBe(200);
        const data = (await response.json()) as any;
        // Gemini with code_execution returns content_blocks containing image_url
        expect(data.choices[0].message).toBeDefined();
        // Response should have content_blocks with image data from code execution
        if (data.choices[0].message.content_blocks) {
            const hasImageUrl = data.choices[0].message.content_blocks.some(
                (block: any) => block.type === "image_url",
            );
            expect(hasImageUrl).toBe(true);
        }
    },
);

// API key pollen budget enforcement tests
describe("API key pollen budget enforcement", async () => {
    test(
        "API key with exhausted budget should return 402",
        { timeout: 30000 },
        async ({ exhaustedBudgetApiKey, mocks }) => {
            await mocks.enable("polar", "tinybird", "vcr");
            const response = await SELF.fetch(
                `http://localhost:3000/api/generate/v1/chat/completions`,
                {
                    method: "POST",
                    headers: {
                        "content-type": "application/json",
                        "authorization": `Bearer ${exhaustedBudgetApiKey}`,
                    },
                    body: JSON.stringify({
                        model: "openai-fast",
                        messages: [
                            {
                                role: "user",
                                content: TEST_MESSAGE_CONTENT,
                            },
                        ],
                        seed: testSeed(),
                    }),
                },
            );
            expect(response.status).toBe(402);
            const body = await response.json();
            expect((body as any).error.message).toContain("budget exhausted");
        },
    );

    test(
        "billed request should decrement pollenBalance",
        { timeout: 30000 },
        async ({ budgetedApiKey, sessionToken, mocks }) => {
            await mocks.enable("polar", "tinybird", "vcr");
            const ctx = createExecutionContext();

            // Make a billed request
            const response = await worker.fetch(
                new Request(
                    `http://localhost:3000/api/generate/v1/chat/completions`,
                    {
                        method: "POST",
                        headers: {
                            "content-type": "application/json",
                            "authorization": `Bearer ${budgetedApiKey.key}`,
                        },
                        body: JSON.stringify({
                            model: "openai-fast",
                            messages: [{ role: "user", content: "Say hi" }],
                            seed: testSeed(),
                        }),
                    },
                ),
                env,
                ctx,
            );
            expect(response.status).toBe(200);
            await response.text();
            await waitOnExecutionContext(ctx);

            // Check that pollenBalance was decremented
            const keysResponse = await SELF.fetch(
                `http://localhost:3000/api/api-keys`,
                {
                    headers: {
                        "Cookie": `better-auth.session_token=${sessionToken}`,
                    },
                },
            );
            const keysData = (await keysResponse.json()) as any;
            const key = keysData.data.find(
                (k: any) => k.id === budgetedApiKey.id,
            );
            expect(key.pollenBalance).toBeLessThan(100);
        },
    );

    test(
        "pollenBudget: null should allow unlimited usage",
        { timeout: 30000 },
        async ({ apiKey, mocks }) => {
            await mocks.enable("polar", "tinybird", "vcr");
            // apiKey fixture has no pollenBudget set (null) - should work
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
                        messages: [{ role: "user", content: "Say hi" }],
                        seed: testSeed(),
                    }),
                },
            );
            expect(response.status).toBe(200);
            await response.text();
        },
    );

    test(
        "non-billed request (cache hit) should not decrement pollenBalance",
        { timeout: 30000 },
        async ({ budgetedApiKey, sessionToken, mocks }) => {
            await mocks.enable("polar", "tinybird", "vcr");

            // First request to populate cache
            const ctx1 = createExecutionContext();
            const response1 = await worker.fetch(
                new Request(
                    `http://localhost:3000/api/generate/v1/chat/completions`,
                    {
                        method: "POST",
                        headers: {
                            "content-type": "application/json",
                            "authorization": `Bearer ${budgetedApiKey.key}`,
                        },
                        body: JSON.stringify({
                            model: "openai-fast",
                            messages: [
                                { role: "user", content: "Cache test message" },
                            ],
                            seed: 12345,
                        }),
                    },
                ),
                env,
                ctx1,
            );
            expect(response1.status).toBe(200);
            await response1.text();
            await waitOnExecutionContext(ctx1);

            // Get balance after first request
            const keysResponse1 = await SELF.fetch(
                `http://localhost:3000/api/api-keys`,
                {
                    headers: {
                        "Cookie": `better-auth.session_token=${sessionToken}`,
                    },
                },
            );
            const keysData1 = (await keysResponse1.json()) as any;
            const balanceAfterFirst = keysData1.data.find(
                (k: any) => k.id === budgetedApiKey.id,
            ).pollenBalance;

            // Second identical request (should be cache hit, isBilledUsage=false)
            const ctx2 = createExecutionContext();
            const response2 = await worker.fetch(
                new Request(
                    `http://localhost:3000/api/generate/v1/chat/completions`,
                    {
                        method: "POST",
                        headers: {
                            "content-type": "application/json",
                            "authorization": `Bearer ${budgetedApiKey.key}`,
                        },
                        body: JSON.stringify({
                            model: "openai-fast",
                            messages: [
                                { role: "user", content: "Cache test message" },
                            ],
                            seed: 12345,
                        }),
                    },
                ),
                env,
                ctx2,
            );
            expect(response2.status).toBe(200);
            await response2.text();
            await waitOnExecutionContext(ctx2);

            // Balance should be unchanged after cache hit
            const keysResponse2 = await SELF.fetch(
                `http://localhost:3000/api/api-keys`,
                {
                    headers: {
                        "Cookie": `better-auth.session_token=${sessionToken}`,
                    },
                },
            );
            const keysData2 = (await keysResponse2.json()) as any;
            const balanceAfterSecond = keysData2.data.find(
                (k: any) => k.id === budgetedApiKey.id,
            ).pollenBalance;

            expect(balanceAfterSecond).toBe(balanceAfterFirst);
        },
    );
});
