import {
    CreateChatCompletionRequestSchema,
    CreateChatCompletionResponseSchema,
    CreateChatCompletionStreamResponseSchema,
} from "@shared/schemas/openai.ts";
import { describe, expect, it } from "vitest";

describe("OpenAI request schema", () => {
    it("preserves provider extension fields", () => {
        const parsed = CreateChatCompletionRequestSchema.parse({
            model: "openai-fast",
            messages: [{ role: "user", content: "hi" }],
            metadata: { trace_id: "abc" },
            provider_metadata: { route: "test" },
        });

        expect(parsed.metadata).toEqual({ trace_id: "abc" });
        expect(parsed.provider_metadata).toEqual({ route: "test" });
    });
});

describe("OpenAI response schema", () => {
    it("accepts nullable usage from OpenAI-compatible providers", () => {
        const parsed = CreateChatCompletionResponseSchema.parse({
            id: "chatcmpl_test",
            object: "chat.completion",
            created: 1779010000,
            model: "mistral-large-3",
            choices: [
                {
                    index: 0,
                    message: {
                        role: "assistant",
                        content: "ok",
                    },
                    finish_reason: "stop",
                },
            ],
            usage: null,
        });

        expect(parsed.usage).toBeNull();
    });

    it("accepts nullable usage on stream chunks", () => {
        const parsed = CreateChatCompletionStreamResponseSchema.parse({
            id: "chatcmpl_test",
            object: "chat.completion.chunk",
            created: 1779010000,
            model: "mistral-large-3",
            choices: [
                {
                    index: 0,
                    delta: {
                        content: "ok",
                    },
                    finish_reason: null,
                },
            ],
            usage: null,
        });

        expect(parsed.usage).toBeNull();
    });
});
