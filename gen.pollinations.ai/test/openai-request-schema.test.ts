import { CreateChatCompletionRequestSchema } from "@shared/schemas/openai.ts";
import { describe, expect, it } from "vitest";

const base = {
    model: "openai/gpt-4o-mini",
    messages: [{ role: "user", content: "hi" }],
    max_tokens: 5,
};

describe("CreateChatCompletionRequestSchema stream_options", () => {
    it("rejects stream_options without stream", () => {
        expect(() =>
            CreateChatCompletionRequestSchema.parse({
                ...base,
                stream_options: { include_usage: true },
            }),
        ).toThrow();
    });

    it("rejects stream_options with stream=false", () => {
        expect(() =>
            CreateChatCompletionRequestSchema.parse({
                ...base,
                stream: false,
                stream_options: { include_usage: true },
            }),
        ).toThrow();
    });

    it("accepts stream_options with stream=true", () => {
        expect(() =>
            CreateChatCompletionRequestSchema.parse({
                ...base,
                stream: true,
                stream_options: { include_usage: true },
            }),
        ).not.toThrow();
    });

    it("accepts stream without stream_options", () => {
        expect(() =>
            CreateChatCompletionRequestSchema.parse({
                ...base,
                stream: true,
            }),
        ).not.toThrow();
    });
});
