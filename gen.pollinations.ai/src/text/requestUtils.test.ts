import { describe, expect, it } from "vitest";
import { getRequestData } from "./requestUtils.js";

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
});
