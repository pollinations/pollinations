import { describe, expect, it } from "vitest";
import { getRequestData } from "../../src/text/requestUtils.js";

describe("getRequestData", () => {
    it("coerces token limits from query strings", () => {
        const requestData = getRequestData({
            query: {
                model: "openai-fast",
                max_tokens: "12",
                max_completion_tokens: "16",
            },
            body: {},
            path: "/text/prompt",
            params: { 0: "hello" },
            method: "GET",
            headers: {},
            url: "https://gen.pollinations.ai/text/hello?model=openai-fast&max_tokens=12&max_completion_tokens=16",
        });

        expect(requestData.max_tokens).toBe(12);
        expect(requestData.max_completion_tokens).toBe(16);
    });

    it("does not expose deprecated thinking aliases as request params", () => {
        const requestData = getRequestData({
            query: {},
            body: {
                model: "openai-fast",
                messages: [{ role: "user", content: "hello" }],
                thinking: { type: "enabled", budget_tokens: 1024 },
                thinking_budget: 1024,
                reasoning_effort: "medium",
            },
            path: "/v1/chat/completions",
            params: {},
            method: "POST",
            headers: {},
            url: "https://gen.pollinations.ai/v1/chat/completions",
        });

        expect(requestData.reasoning_effort).toBe("medium");
        expect("thinking" in requestData).toBe(false);
        expect("thinking_budget" in requestData).toBe(false);
    });
});
