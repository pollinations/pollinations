import { CreateChatCompletionRequestSchema } from "@shared/schemas/openai.ts";
import { describe, expect, it } from "vitest";

describe("CreateChatCompletionRequestSchema", () => {
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

    it("requires at least one message", () => {
        expect(
            CreateChatCompletionRequestSchema.safeParse({ messages: [] })
                .success,
        ).toBe(false);
    });
});
