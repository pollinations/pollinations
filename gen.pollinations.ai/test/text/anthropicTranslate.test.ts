import { CreateAnthropicMessageRequestSchema } from "@shared/schemas/anthropic.ts";
import { describe, expect, it } from "vitest";
import {
    anthropicToChatRequest,
    anthropicUsageToOpenAI,
    chatToAnthropicResponse,
} from "../../src/text/anthropic/translate.ts";

describe("anthropic request translation", () => {
    it("flattens a string system prompt and text blocks into a system message", () => {
        const chat = anthropicToChatRequest(
            CreateAnthropicMessageRequestSchema.parse({
                model: "openai",
                max_tokens: 64,
                system: "You are terse.",
                messages: [{ role: "user", content: "hi" }],
            }),
        );
        expect(chat.messages[0]).toMatchObject({
            role: "system",
            content: "You are terse.",
        });
    });

    it("maps an image block to an OpenAI image_url part with a data URI", () => {
        const chat = anthropicToChatRequest(
            CreateAnthropicMessageRequestSchema.parse({
                model: "openai",
                max_tokens: 64,
                messages: [
                    {
                        role: "user",
                        content: [
                            { type: "text", text: "what is this" },
                            {
                                type: "image",
                                source: {
                                    type: "base64",
                                    media_type: "image/png",
                                    data: "AAAA",
                                },
                            },
                        ],
                    },
                ],
            }),
        );
        const content = chat.messages[0].content as Array<{
            type: string;
            image_url?: { url: string };
        }>;
        expect(content[1].type).toBe("image_url");
        expect(content[1].image_url?.url).toBe("data:image/png;base64,AAAA");
    });

    it("lifts tool_result blocks into tool messages and keeps tool_use on assistant turns", () => {
        const chat = anthropicToChatRequest(
            CreateAnthropicMessageRequestSchema.parse({
                model: "openai",
                max_tokens: 64,
                messages: [
                    {
                        role: "assistant",
                        content: [
                            {
                                type: "tool_use",
                                id: "toolu_1",
                                name: "read_file",
                                input: { path: "a.txt" },
                            },
                        ],
                    },
                    {
                        role: "user",
                        content: [
                            {
                                type: "tool_result",
                                tool_use_id: "toolu_1",
                                content: "hello",
                            },
                        ],
                    },
                ],
            }),
        );
        const assistant = chat.messages.find((m) => m.role === "assistant");
        const tool = chat.messages.find((m) => m.role === "tool");
        expect(assistant?.tool_calls?.[0]).toMatchObject({
            id: "toolu_1",
            function: { name: "read_file", arguments: '{"path":"a.txt"}' },
        });
        expect(tool).toMatchObject({
            tool_call_id: "toolu_1",
            content: "hello",
        });
    });

    it("converts tools and tool_choice to the OpenAI shape", () => {
        const chat = anthropicToChatRequest(
            CreateAnthropicMessageRequestSchema.parse({
                model: "openai",
                max_tokens: 64,
                messages: [{ role: "user", content: "hi" }],
                tools: [
                    {
                        name: "get_weather",
                        description: "weather",
                        input_schema: { type: "object" },
                    },
                ],
                tool_choice: { type: "tool", name: "get_weather" },
            }),
        );
        expect(chat.tools?.[0]).toMatchObject({
            type: "function",
            function: { name: "get_weather" },
        });
        expect(chat.tool_choice).toMatchObject({
            type: "function",
            function: { name: "get_weather" },
        });
    });

    it("passes stop_sequences through as stop", () => {
        const chat = anthropicToChatRequest(
            CreateAnthropicMessageRequestSchema.parse({
                model: "openai",
                max_tokens: 64,
                messages: [{ role: "user", content: "hi" }],
                stop_sequences: ["\n\n", "END"],
            }),
        );
        expect(chat.stop).toEqual(["\n\n", "END"]);
    });

    it("tolerates Claude Code default fields (thinking, metadata, output_config)", () => {
        const parsed = CreateAnthropicMessageRequestSchema.parse({
            model: "openai",
            max_tokens: 64,
            messages: [{ role: "user", content: "hi" }],
            thinking: { type: "enabled", budget_tokens: 1024 },
            metadata: { user_id: "abc" },
            output_config: { effort: "high" },
        });
        expect(parsed.model).toBe("openai");
    });
});

describe("anthropic usage translation (billing parity)", () => {
    it("reconstructs inclusive prompt tokens so cache-heavy requests do not under-bill", () => {
        // Native Anthropic: input_tokens EXCLUDES cache tokens.
        const openai = anthropicUsageToOpenAI({
            input_tokens: 100,
            output_tokens: 20,
            cache_read_input_tokens: 30,
            cache_creation_input_tokens: 10,
        });
        expect(openai.prompt_tokens).toBe(140); // 100 + 30 + 10
        expect(openai.completion_tokens).toBe(20);
        expect(openai.total_tokens).toBe(160);
        expect(openai.prompt_tokens_details).toMatchObject({
            cached_tokens: 30,
            cache_write_tokens: 10,
        });
    });

    it("maps reasoning tokens into completion details", () => {
        const openai = anthropicUsageToOpenAI({
            input_tokens: 10,
            output_tokens: 5,
            reasoning_tokens: 42,
        });
        expect(openai.completion_tokens_details).toMatchObject({
            reasoning_tokens: 42,
        });
    });

    it("subtracts cache tokens back out when reporting Anthropic usage", () => {
        const response = chatToAnthropicResponse(
            {
                id: "x",
                model: "openai",
                choices: [
                    {
                        message: { role: "assistant", content: "hi" },
                        finish_reason: "stop",
                    },
                ],
                usage: {
                    prompt_tokens: 140,
                    completion_tokens: 20,
                    total_tokens: 160,
                    prompt_tokens_details: {
                        cached_tokens: 30,
                        cache_write_tokens: 10,
                    },
                },
            },
            "openai",
        );
        expect(response.usage).toMatchObject({
            input_tokens: 100,
            output_tokens: 20,
            cache_read_input_tokens: 30,
            cache_creation_input_tokens: 10,
        });
    });
});
