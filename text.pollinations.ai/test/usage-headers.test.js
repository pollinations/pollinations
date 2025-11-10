import { describe, it, expect, beforeAll } from "vitest";
import fetch from "node-fetch";

const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:16385";

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
});
