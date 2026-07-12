import { CreateChatCompletionRequestSchema } from "@shared/schemas/openai.ts";
import { describe, expect, it } from "vitest";
import { validateAndNormalizeMessages } from "../../src/text/textGenerationUtils.js";

describe("CreateChatCompletionRequestSchema cache_control handling", () => {
    // This guards the FIRST stripping point at ingress: the route validates
    // the request body with this schema and forwards the PARSED output
    // upstream, so zod's parse result — not the raw body — is what survives.
    // If cache_control were ever dropped from the text content-part schema,
    // this test fails while every other test (which never inspects the
    // parsed shape) would keep passing.
    it("preserves content-block cache_control through schema parsing", () => {
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
                },
                { role: "user", content: "tail" },
            ],
        });

        const systemContent = result.messages[0].content;
        expect(Array.isArray(systemContent)).toBe(true);
        expect(
            (systemContent as Array<Record<string, unknown>>)[0],
        ).toMatchObject({ cache_control: { type: "ephemeral" } });
    });
});

describe("validateAndNormalizeMessages cache_control handling", () => {
    // Vertex explicit context caching (pollinations/gateway#8) relies on
    // content-block cache_control markers surviving ingress. Message content
    // is carried by reference, so block-level markers pass through untouched.
    it("preserves content-block cache_control markers by reference", () => {
        const content = [
            {
                type: "text",
                text: "big static prefix",
                cache_control: { type: "ephemeral" },
            },
        ];

        const result = validateAndNormalizeMessages([
            { role: "system", content },
            { role: "user", content: "dynamic tail" },
        ]);

        expect(result[0].content).toBe(content);
    });

    // The message rebuild uses a field allowlist, so MESSAGE-level markers
    // (Anthropic puts them on content blocks; some clients put them on the
    // message) are dropped. Documented behavior: markers must be on content
    // blocks. This test pins that so a silent allowlist change is visible.
    it("drops message-level cache_control", () => {
        const result = validateAndNormalizeMessages([
            {
                role: "user",
                content: "hello",
                cache_control: { type: "ephemeral" },
            },
        ]);

        expect(result[0]).not.toHaveProperty("cache_control");
        expect(result[0]).toEqual({ role: "user", content: "hello" });
    });
});
