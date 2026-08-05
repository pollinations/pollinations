import { CreateChatCompletionRequestSchema } from "@shared/schemas/openai.ts";
import { describe, expect, it } from "vitest";

describe("CreateChatCompletionRequestSchema", () => {
    it("preserves content and message-level provider extensions", () => {
        const result = CreateChatCompletionRequestSchema.parse({
            model: "gemini-fast",
            messages: [
                {
                    role: "system",
                    content: [
                        {
                            type: "text",
                            text: "big static prefix",
                            cache_control: { type: "ephemeral" },
                        },
                    ],
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
        const systemContent = result.messages[0].content;
        expect(Array.isArray(systemContent)).toBe(true);
        expect(
            (systemContent as Array<Record<string, unknown>>)[0],
        ).toMatchObject({ cache_control: { type: "ephemeral" } });
    });

    it("keeps empty user content unchanged", () => {
        const result = CreateChatCompletionRequestSchema.parse({
            model: "openai-fast",
            messages: [{ role: "user", content: "" }],
        });

        expect(result.messages).toEqual([{ role: "user", content: "" }]);
    });

    it("requires at least one message", () => {
        expect(
            CreateChatCompletionRequestSchema.safeParse({
                model: "openai-fast",
                messages: [],
            }).success,
        ).toBe(false);
    });

    it.each([
        { role: "user", content: "hello", name: "invalid.name" },
        { role: "tool", content: "{}", tool_call_id: "call_1", name: "" },
        { role: "function", content: "{}", name: "a".repeat(65) },
    ])("leaves message-name compatibility to the upstream adapter: $role", (message) => {
        expect(
            CreateChatCompletionRequestSchema.safeParse({
                model: "openai-fast",
                messages: [message],
            }).success,
        ).toBe(true);
    });

    it("accepts signed INT32 seeds", () => {
        expect(
            CreateChatCompletionRequestSchema.safeParse({
                model: "qwen-vision-pro",
                messages: [{ role: "user", content: "hello" }],
                seed: 2147483647,
            }).success,
        ).toBe(true);
    });

    it("rejects seeds above signed INT32 range", () => {
        expect(
            CreateChatCompletionRequestSchema.safeParse({
                model: "qwen-vision-pro",
                messages: [{ role: "user", content: "hello" }],
                seed: 2147483648,
            }).success,
        ).toBe(false);
    });
});
