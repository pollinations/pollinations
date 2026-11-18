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

    it("preserves Gemini tool-call signatures for the next turn", () => {
        const result = CreateChatCompletionRequestSchema.parse({
            model: "google/gemini-3.8-flash",
            messages: [
                {
                    role: "assistant",
                    content: null,
                    tool_calls: [
                        {
                            id: "call_1",
                            type: "function",
                            function: {
                                name: "emit",
                                arguments: "{}",
                                thought_signature: "opaque-signature",
                            },
                        },
                    ],
                },
                { role: "tool", tool_call_id: "call_1", content: "ok" },
            ],
        });

        expect(result.messages[0]).toMatchObject({
            tool_calls: [
                {
                    function: {
                        name: "emit",
                        arguments: "{}",
                        thought_signature: "opaque-signature",
                    },
                },
            ],
        });
    });

    it("forwards a Gemini signature sent in Google's extra_content field", () => {
        const result = CreateChatCompletionRequestSchema.parse({
            model: "google/gemini-3.8-flash",
            messages: [
                {
                    role: "assistant",
                    content: null,
                    tool_calls: [
                        {
                            id: "call_1",
                            type: "function",
                            function: { name: "emit", arguments: "{}" },
                            extra_content: {
                                google: {
                                    thought_signature: "opaque-signature",
                                },
                            },
                        },
                    ],
                },
                { role: "tool", tool_call_id: "call_1", content: "ok" },
            ],
        });

        expect(result.messages[0]).toMatchObject({
            tool_calls: [
                {
                    id: "call_1",
                    type: "function",
                    function: {
                        name: "emit",
                        arguments: "{}",
                        thought_signature: "opaque-signature",
                    },
                },
            ],
        });
    });

    it("drops a malformed extra_content field instead of rejecting the request", () => {
        for (const extra_content of [
            { google: null },
            { google: { thought_signature: null } },
            "x",
        ]) {
            const result = CreateChatCompletionRequestSchema.parse({
                messages: [
                    {
                        role: "assistant",
                        content: null,
                        tool_calls: [
                            {
                                id: "call_1",
                                type: "function",
                                function: { name: "emit", arguments: "{}" },
                                extra_content,
                            },
                        ],
                    },
                    { role: "tool", tool_call_id: "call_1", content: "ok" },
                ],
            });

            expect(result.messages[0]).toEqual({
                role: "assistant",
                content: null,
                tool_calls: [
                    {
                        id: "call_1",
                        type: "function",
                        function: { name: "emit", arguments: "{}" },
                    },
                ],
            });
        }
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

    it("accepts a string system prompt and tolerates explicit null", () => {
        const result = CreateChatCompletionRequestSchema.parse({
            messages: [{ role: "user", content: "hello" }],
            system: "be concise",
        });
        expect(result.system).toBe("be concise");

        const explicitNull = CreateChatCompletionRequestSchema.parse({
            messages: [{ role: "user", content: "hello" }],
            system: null,
        });
        expect(explicitNull.system).toBeNull();
    });

    it("rejects a non-string system prompt instead of dropping it", () => {
        const cases = [["be concise"], 12345, { text: "be concise" }, true];
        for (const system of cases) {
            const result = CreateChatCompletionRequestSchema.safeParse({
                messages: [{ role: "user", content: "hello" }],
                system,
            });
            expect(result.success).toBe(false);
        }
    });

    it("does not accept legacy functions in place of tools when tool_choice is required", () => {
        const result = CreateChatCompletionRequestSchema.safeParse({
            messages: [{ role: "user", content: "hello" }],
            tool_choice: "required",
            functions: [{ name: "weather", parameters: {} }],
        });
        expect(result.success).toBe(false);
    });

    it("requires tools when tool_choice is required", () => {
        const tool = {
            type: "function",
            function: { name: "weather", parameters: {} },
        };
        for (const tools of [undefined, []]) {
            const result = CreateChatCompletionRequestSchema.safeParse({
                messages: [{ role: "user", content: "hello" }],
                tool_choice: "required",
                ...(tools && { tools }),
            });
            expect(result.success).toBe(false);
        }

        expect(
            CreateChatCompletionRequestSchema.safeParse({
                messages: [{ role: "user", content: "hello" }],
                tool_choice: "required",
                tools: [tool],
            }).success,
        ).toBe(true);
        expect(
            CreateChatCompletionRequestSchema.safeParse({
                messages: [{ role: "user", content: "hello" }],
                tool_choice: "auto",
                tools: [],
            }).success,
        ).toBe(true);
    });
});

describe("chat content part validation", () => {
    const image = "https://example.com/a.png";
    const parse = (content: unknown[]) =>
        CreateChatCompletionRequestSchema.safeParse({
            messages: [{ role: "user", content }],
        });

    it.each([
        ["text without text", { type: "text" }],
        [
            "image detail outside the enum",
            { type: "image_url", image_url: { url: image, detail: "ultra" } },
        ],
        ["image_url as a string", { type: "image_url", image_url: image }],
        [
            "image url not a string",
            { type: "image_url", image_url: { url: 123 } },
        ],
        [
            "audio with an unknown format",
            {
                type: "input_audio",
                input_audio: { data: "AAAA", format: "bogus" },
            },
        ],
        ["file without file fields", { type: "file" }],
    ])("rejects %s", (_name, malformed) => {
        expect(parse([{ type: "text", text: "hi" }, malformed]).success).toBe(
            false,
        );
    });

    it("keeps unknown provider-specific parts", () => {
        expect(
            parse([{ type: "provider_extension", payload: { a: 1 } }]).success,
        ).toBe(true);
    });

    it("accepts the documented parts", () => {
        expect(
            parse([
                { type: "text", text: "hi" },
                {
                    type: "image_url",
                    image_url: { url: image, detail: "high" },
                },
                { type: "video_url", video_url: { url: image } },
                {
                    type: "input_audio",
                    input_audio: { data: "AAAA", format: "wav" },
                },
                {
                    type: "file",
                    file: { file_data: "AAAA", filename: "a.pdf" },
                },
            ]).success,
        ).toBe(true);
    });
});
