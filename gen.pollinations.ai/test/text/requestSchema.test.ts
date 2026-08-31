import { CreateChatCompletionRequestSchema } from "@shared/schemas/openai.ts";
import { describe, expect, it } from "vitest";

describe("CreateChatCompletionRequestSchema", () => {
    it("preserves omission and explicit values for optional model parameters", () => {
        const omitted = CreateChatCompletionRequestSchema.parse({
            messages: [{ role: "user", content: "hello" }],
        });
        expect(omitted).not.toHaveProperty("frequency_penalty");
        expect(omitted).not.toHaveProperty("presence_penalty");
        expect(omitted).not.toHaveProperty("logprobs");

        const explicit = CreateChatCompletionRequestSchema.parse({
            messages: [{ role: "user", content: "hello" }],
            frequency_penalty: 0,
            presence_penalty: 0,
            logprobs: false,
        });
        expect(explicit).toMatchObject({
            frequency_penalty: 0,
            presence_penalty: 0,
            logprobs: false,
        });
    });

    it("preserves message-level provider extensions", () => {
        const result = CreateChatCompletionRequestSchema.parse({
            model: "gemini-fast",
            messages: [
                {
                    role: "system",
                    content: "big static prefix",
                    cache_control: { type: "ephemeral" },
                    provider_option: "kept",
                },
                { role: "user", content: "tail" },
            ],
        });

        expect(result.messages[0]).toMatchObject({
            cache_control: { type: "ephemeral" },
            provider_option: "kept",
        });
    });

    it("keeps empty user content for the provider adapter", () => {
        const result = CreateChatCompletionRequestSchema.parse({
            messages: [{ role: "user", content: "" }],
        });
        expect(result.messages).toEqual([{ role: "user", content: "" }]);
    });
});
