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

    it("preserves explicit prompt-cache breakpoints on content parts", () => {
        const result = CreateChatCompletionRequestSchema.parse({
            prompt_cache_key: "stable-prefix",
            prompt_cache_options: { mode: "explicit", ttl: "30m" },
            prompt_cache_retention: "24h",
            messages: [
                {
                    role: "user",
                    content: [
                        {
                            type: "text",
                            text: "stable prefix",
                            prompt_cache_breakpoint: { mode: "explicit" },
                        },
                    ],
                },
            ],
        });

        expect(result.messages[0].content).toEqual([
            {
                type: "text",
                text: "stable prefix",
                prompt_cache_breakpoint: { mode: "explicit" },
            },
        ]);
        expect(result).toMatchObject({
            prompt_cache_key: "stable-prefix",
            prompt_cache_options: { mode: "explicit", ttl: "30m" },
            prompt_cache_retention: "24h",
        });
    });

    it("keeps empty user content for the provider adapter", () => {
        const result = CreateChatCompletionRequestSchema.parse({
            messages: [{ role: "user", content: "" }],
        });
        expect(result.messages).toEqual([{ role: "user", content: "" }]);
    });

    it("accepts video_url content parts with a URL or a base64 data URI", () => {
        const result = CreateChatCompletionRequestSchema.parse({
            model: "inclusionai/ling-3.0-flash-vl",
            messages: [
                {
                    role: "user",
                    content: [
                        { type: "text", text: "What happens in this clip?" },
                        {
                            type: "video_url",
                            video_url: {
                                url: "https://example.com/clip.mp4",
                            },
                        },
                        {
                            type: "video_url",
                            video_url: {
                                url: "data:video/mp4;base64,AAAA",
                                mime_type: "video/mp4",
                            },
                        },
                    ],
                },
            ],
        });

        const content = result.messages[0].content as Array<
            Record<string, unknown>
        >;
        expect(content[1]).toEqual({
            type: "video_url",
            video_url: { url: "https://example.com/clip.mp4" },
        });
        expect(content[2]).toEqual({
            type: "video_url",
            video_url: {
                url: "data:video/mp4;base64,AAAA",
                mime_type: "video/mp4",
            },
        });
    });

    it("preserves a video_url part missing its URL for the adapter to reject", () => {
        // The Chat body schema is a passthrough union: provider extensions
        // survive parsing, and URL presence is the Responses adapter's 400.
        const result = CreateChatCompletionRequestSchema.parse({
            messages: [
                {
                    role: "user",
                    content: [{ type: "video_url", video_url: {} }],
                },
            ],
        });
        expect(result.messages[0].content).toEqual([
            { type: "video_url", video_url: {} },
        ]);
    });
});
