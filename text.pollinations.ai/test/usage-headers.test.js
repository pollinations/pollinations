import { describe, it, expect, beforeAll } from "vitest";
import fetch from "node-fetch";

const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:16385";
const PLN_ENTER_TOKEN =
    process.env.PLN_ENTER_TOKEN ||
    "cZOpvvV4xpbOe1IOYrN0R2a3zxHEAcLntneihfU3f2Y3Pfy5";

// Skip Claude tests in CI if no credentials available
const SKIP_CLAUDE_TESTS = process.env.CI && !process.env.AWS_ACCESS_KEY_ID;

beforeAll(() => {
    console.log(`Testing usage headers against: ${BASE_URL}`);
});

describe("Usage headers - Non-streaming (Issue #4638)", () => {
    it("should include x-model-used header in non-streaming response", async () => {
        const response = await fetch(`${BASE_URL}/openai/chat/completions`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                model: "openai-fast",
                messages: [{ role: "user", content: "Hi" }],
                max_tokens: 10,
            }),
        });

        expect(response.status).toBe(200);

        const modelUsed = response.headers.get("x-model-used");
        expect(modelUsed).toBeTruthy();
        expect(typeof modelUsed).toBe("string");
        expect(modelUsed.length).toBeGreaterThan(0);
    }, 30000);

    it("should include x-usage-prompt-text-tokens header", async () => {
        const response = await fetch(`${BASE_URL}/openai/chat/completions`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                model: "openai-fast",
                messages: [{ role: "user", content: "Hi" }],
                max_tokens: 10,
            }),
        });

        expect(response.status).toBe(200);

        const promptTokens = response.headers.get("x-usage-prompt-text-tokens");
        expect(promptTokens).toBeTruthy();

        const tokenCount = parseInt(promptTokens || "0", 10);
        expect(tokenCount).toBeGreaterThan(0);
        expect(Number.isInteger(tokenCount)).toBe(true);
    }, 30000);

    it("should include x-usage-completion-text-tokens header", async () => {
        const response = await fetch(`${BASE_URL}/openai/chat/completions`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                model: "openai-fast",
                messages: [{ role: "user", content: "Hi" }],
                max_tokens: 10,
            }),
        });

        expect(response.status).toBe(200);

        const completionTokens = response.headers.get(
            "x-usage-completion-text-tokens",
        );
        expect(completionTokens).toBeTruthy();

        const tokenCount = parseInt(completionTokens || "0", 10);
        expect(tokenCount).toBeGreaterThan(0);
        expect(Number.isInteger(tokenCount)).toBe(true);
    }, 30000);

    it("should include x-usage-total-tokens header", async () => {
        const response = await fetch(`${BASE_URL}/openai/chat/completions`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                model: "openai-fast",
                messages: [{ role: "user", content: "Hi" }],
                max_tokens: 10,
            }),
        });

        expect(response.status).toBe(200);

        const totalTokens = response.headers.get("x-usage-total-tokens");
        expect(totalTokens).toBeTruthy();

        const tokenCount = parseInt(totalTokens || "0", 10);
        expect(tokenCount).toBeGreaterThan(0);
        expect(Number.isInteger(tokenCount)).toBe(true);
    }, 30000);

    it("should have consistent token counts", async () => {
        const response = await fetch(`${BASE_URL}/openai/chat/completions`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                model: "openai-fast",
                messages: [{ role: "user", content: "Hi" }],
                max_tokens: 10,
            }),
        });

        expect(response.status).toBe(200);

        const promptTokens = parseInt(
            response.headers.get("x-usage-prompt-text-tokens") || "0",
            10,
        );
        const completionTokens = parseInt(
            response.headers.get("x-usage-completion-text-tokens") || "0",
            10,
        );
        const totalTokens = parseInt(
            response.headers.get("x-usage-total-tokens") || "0",
            10,
        );

        // Total should equal sum of prompt and completion
        expect(totalTokens).toBe(promptTokens + completionTokens);
    }, 30000);
});

describe("Usage headers - Streaming (Issue #4638)", () => {
    it("should declare Trailer header for streaming responses", async () => {
        const response = await fetch(`${BASE_URL}/openai/chat/completions`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                model: "openai-fast",
                messages: [{ role: "user", content: "Hi" }],
                max_tokens: 10,
                stream: true,
            }),
        });

        expect(response.status).toBe(200);

        const trailer = response.headers.get("trailer");
        expect(trailer).toBeTruthy();
        expect(trailer).toContain("x-model-used");
        expect(trailer).toContain("x-usage-prompt-text-tokens");
        expect(trailer).toContain("x-usage-completion-text-tokens");
        expect(trailer).toContain("x-usage-total-tokens");

        // Consume the stream to allow trailers to be sent
        if (response.body) {
            const reader = response.body.getReader();
            while (true) {
                const { done } = await reader.read();
                if (done) break;
            }
        }
    }, 30000);

    it("should use Transfer-Encoding: chunked for streaming", async () => {
        const response = await fetch(`${BASE_URL}/openai/chat/completions`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                model: "openai-fast",
                messages: [{ role: "user", content: "Hi" }],
                max_tokens: 10,
                stream: true,
            }),
        });

        expect(response.status).toBe(200);
        expect(response.headers.get("content-type")).toContain(
            "text/event-stream",
        );

        // Consume stream
        if (response.body) {
            const reader = response.body.getReader();
            while (true) {
                const { done } = await reader.read();
                if (done) break;
            }
        }
    }, 30000);

    it("should include usage object in streaming response (stream_options)", async () => {
        const response = await fetch(`${BASE_URL}/openai/chat/completions`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-enter-token": PLN_ENTER_TOKEN,
            },
            body: JSON.stringify({
                model: "openai-fast",
                messages: [{ role: "user", content: "Say hi" }],
                max_tokens: 20,
                stream: true,
            }),
        });

        expect(response.status).toBe(200);

        // Parse SSE stream and look for usage object
        let foundUsage = false;
        let usageData = null;

        const text = await response.text();
        const lines = text.split("\n");

        for (const line of lines) {
            if (line.startsWith("data: ")) {
                const data = line.slice(6);
                if (data === "[DONE]") continue;

                try {
                    const parsed = JSON.parse(data);
                    if (parsed.usage) {
                        foundUsage = true;
                        usageData = parsed.usage;
                    }
                } catch {
                    // Ignore parse errors
                }
            }
        }

        expect(foundUsage).toBe(true);
        expect(usageData).toBeTruthy();
        expect(usageData.prompt_tokens).toBeGreaterThan(0);
        expect(usageData.completion_tokens).toBeGreaterThan(0);
        expect(usageData.total_tokens).toBeGreaterThan(0);
        expect(usageData.total_tokens).toBe(
            usageData.prompt_tokens + usageData.completion_tokens,
        );
    }, 30000);
});

describe("Native Bedrock - Array content support", () => {
    it.skipIf(SKIP_CLAUDE_TESTS)(
        "should accept array content in system message for claude-large",
        async () => {
            const response = await fetch(`${BASE_URL}/v1/chat/completions`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-enter-token": PLN_ENTER_TOKEN,
                },
                body: JSON.stringify({
                    model: "claude-large",
                    messages: [
                        {
                            role: "system",
                            content: [
                                {
                                    type: "text",
                                    text: "Be brief.",
                                    cache_control: { type: "ephemeral" },
                                },
                            ],
                        },
                        { role: "user", content: "Say yes" },
                    ],
                    max_tokens: 10,
                }),
            });

            expect(response.status).toBe(200);

            const data = await response.json();
            expect(data.provider).toBe("bedrock");
            expect(data.choices[0].message.content).toBeTruthy();
        },
        60000,
    );

    it.skipIf(SKIP_CLAUDE_TESTS)(
        "should include prompt_tokens_details for cache tracking",
        async () => {
            const response = await fetch(`${BASE_URL}/v1/chat/completions`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-enter-token": PLN_ENTER_TOKEN,
                },
                body: JSON.stringify({
                    model: "claude-large",
                    messages: [
                        {
                            role: "system",
                            content: [
                                {
                                    type: "text",
                                    text: "You are helpful.",
                                    cache_control: { type: "ephemeral" },
                                },
                            ],
                        },
                        { role: "user", content: "Hi" },
                    ],
                    max_tokens: 10,
                }),
            });

            expect(response.status).toBe(200);

            const data = await response.json();
            expect(data.usage).toBeDefined();
            expect(data.usage.prompt_tokens_details).toBeDefined();
            expect(typeof data.usage.prompt_tokens_details.cached_tokens).toBe(
                "number",
            );
        },
        60000,
    );
});
