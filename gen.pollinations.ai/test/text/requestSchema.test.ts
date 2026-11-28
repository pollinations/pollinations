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

    it("rejects empty names on tools, functions, and response formats", () => {
        const messages = [{ role: "user", content: "hello" }];
        const tool = {
            type: "function",
            function: { name: "lookup", parameters: { type: "object" } },
        };
        for (const body of [
            { tools: [{ ...tool, function: { name: "" } }] },
            { functions: [{ name: "", parameters: { type: "object" } }] },
            {
                tools: [tool],
                tool_choice: { type: "function", function: { name: "" } },
            },
            { functions: [{ name: "lookup" }], function_call: { name: "" } },
            {
                response_format: {
                    type: "json_schema",
                    json_schema: { name: "", schema: { type: "object" } },
                },
            },
        ]) {
            expect(
                CreateChatCompletionRequestSchema.safeParse({
                    messages,
                    ...body,
                }).success,
            ).toBe(false);
        }

        // The same shapes with names parse, so the guard is the empty string only.
        expect(
            CreateChatCompletionRequestSchema.safeParse({
                messages,
                tools: [tool],
                tool_choice: { type: "function", function: { name: "lookup" } },
                response_format: {
                    type: "json_schema",
                    json_schema: { name: "answer", schema: { type: "object" } },
                },
            }).success,
        ).toBe(true);
    });

    it("caps tools at the provider limit of 128", () => {
        const messages = [{ role: "user", content: "hello" }];
        const tools = (count: number) =>
            Array.from({ length: count }, (_, index) => ({
                type: "function" as const,
                function: {
                    name: `f${index}`,
                    parameters: { type: "object" },
                },
            }));
        expect(
            CreateChatCompletionRequestSchema.safeParse({
                messages,
                tools: tools(128),
            }).success,
        ).toBe(true);
        expect(
            CreateChatCompletionRequestSchema.safeParse({
                messages,
                tools: tools(129),
            }).success,
        ).toBe(false);
    });
});
