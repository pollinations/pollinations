import type { CreateResponseRequest } from "@shared/schemas/openai.ts";
import { describe, expect, it } from "vitest";
import { responsesToChatRequest } from "../../src/text/responses/responsesToChat.js";

function req(over: Record<string, unknown> = {}): CreateResponseRequest {
    return {
        model: "test-model",
        input: "Hello",
        ...over,
    } as unknown as CreateResponseRequest;
}

describe("responsesToChatRequest", () => {
    it("maps a string input to a user message", () => {
        const { messages, options } = responsesToChatRequest(req());
        expect(messages).toEqual([{ role: "user", content: "Hello" }]);
        expect(options.model).toBe("test-model");
    });

    it("prepends instructions as a system message", () => {
        const { messages } = responsesToChatRequest(
            req({ instructions: "Be brief." }),
        );
        expect(messages[0]).toEqual({
            role: "system",
            content: "Be brief.",
        });
        expect(messages[1]).toEqual({ role: "user", content: "Hello" });
    });

    it("maps input_text items and image items", () => {
        const { messages } = responsesToChatRequest(
            req({
                input: [
                    {
                        type: "message",
                        role: "user",
                        content: [
                            { type: "input_text", text: "Look" },
                            {
                                type: "input_image",
                                image_url: "https://x.test/i.png",
                            },
                        ],
                    },
                ],
            }),
        );
        expect(messages).toEqual([
            {
                role: "user",
                content: [
                    { type: "text", text: "Look" },
                    {
                        type: "image_url",
                        image_url: { url: "https://x.test/i.png" },
                    },
                ],
            },
        ]);
    });

    it("maps function_call and function_call_output items", () => {
        const { messages } = responsesToChatRequest(
            req({
                input: [
                    {
                        type: "function_call",
                        call_id: "c1",
                        name: "get_weather",
                        arguments: '{"city":"Seoul"}',
                    },
                    {
                        type: "function_call_output",
                        call_id: "c1",
                        output: "sunny",
                    },
                ],
            }),
        );
        expect(messages[0].role).toBe("assistant");
        expect(messages[0].tool_calls).toEqual([
            {
                id: "c1",
                type: "function",
                function: {
                    name: "get_weather",
                    arguments: '{"city":"Seoul"}',
                },
            },
        ]);
        expect(messages[1]).toEqual({
            role: "tool",
            tool_call_id: "c1",
            content: "sunny",
        });
    });

    it("folds reasoning items into reasoning_content", () => {
        const { messages } = responsesToChatRequest(
            req({
                input: [
                    {
                        type: "reasoning",
                        summary: [{ text: "thinking" }],
                    } as never,
                ],
            }),
        );
        expect(messages).toEqual([
            { role: "assistant", content: null, reasoning_content: "thinking" },
        ]);
    });

    it("maps tools, tool_choice, format and sampling options", () => {
        const { options } = responsesToChatRequest(
            req({
                tools: [
                    {
                        type: "function",
                        name: "f",
                        description: "d",
                        parameters: { type: "object" },
                        strict: true,
                    },
                ],
                tool_choice: { type: "function", name: "f" },
                text: {
                    format: {
                        type: "json_schema",
                        name: "s",
                        schema: { type: "object" },
                        strict: true,
                    },
                },
                temperature: 0.5,
                max_output_tokens: 100,
                parallel_tool_calls: false,
                reasoning: { effort: "low" },
            }),
        );
        expect(options.tools).toEqual([
            {
                type: "function",
                function: {
                    name: "f",
                    description: "d",
                    parameters: { type: "object" },
                    strict: true,
                },
            },
        ]);
        expect(options.tool_choice).toEqual({
            type: "function",
            function: { name: "f" },
        });
        expect(options.response_format).toEqual({
            type: "json_schema",
            json_schema: {
                name: "s",
                schema: { type: "object" },
                strict: true,
            },
        });
        expect(options.temperature).toBe(0.5);
        expect(options.max_completion_tokens).toBe(100);
        expect(options.parallel_tool_calls).toBe(false);
        expect(options.reasoning_effort).toBe("low");
    });

    it("rejects a json_schema format without a schema", () => {
        expect(() =>
            responsesToChatRequest(
                req({ text: { format: { type: "json_schema" } } }),
            ),
        ).toThrow(/incomplete/);
    });

    it("rejects unsupported fields loudly", () => {
        for (const over of [
            { include: ["code_interpreter"] },
            { top_logprobs: 3 },
            { background: true },
            { store: true },
        ]) {
            expect(() => responsesToChatRequest(req(over))).toThrow();
        }
    });

    it("accepts inert truncation values", () => {
        expect(() =>
            responsesToChatRequest(req({ truncation: "disabled" })),
        ).not.toThrow();
    });

    it("rejects explicit truncation auto (no silent no-op)", () => {
        expect(() =>
            responsesToChatRequest(req({ truncation: "auto" })),
        ).toThrow(/truncation/);
    });

    it("maps developer role to system", () => {
        const { messages } = responsesToChatRequest(
            req({
                input: [
                    { type: "message", role: "developer", content: "Rules." },
                ],
            }),
        );
        expect(messages).toEqual([
            { role: "system", content: [{ type: "text", text: "Rules." }] },
        ]);
    });

    it("accepts assistant output_text and refusal parts on resend", () => {
        const { messages } = responsesToChatRequest(
            req({
                input: [
                    {
                        type: "message",
                        role: "assistant",
                        content: [
                            { type: "output_text", text: "Previous answer" },
                        ],
                    },
                    {
                        type: "message",
                        role: "assistant",
                        content: [{ type: "refusal", refusal: "Cannot help" }],
                    },
                ],
            }),
        );
        expect(messages).toEqual([
            {
                role: "assistant",
                content: [{ type: "text", text: "Previous answer" }],
            },
            {
                role: "assistant",
                content: [{ type: "text", text: "Cannot help" }],
            },
        ]);
    });

    it("merges adjacent function_call items into one assistant tool_calls message", () => {
        const { messages } = responsesToChatRequest(
            req({
                input: [
                    { type: "function_call", call_id: "c1", name: "a" },
                    {
                        type: "function_call",
                        call_id: "c2",
                        name: "b",
                        arguments: '{"x":1}',
                    },
                ],
            }),
        );
        expect(messages).toHaveLength(1);
        const [message] = messages;
        expect(message.role).toBe("assistant");
        const calls = (message.tool_calls ?? []) as Array<{ id: string }>;
        expect(calls).toHaveLength(2);
        expect(calls[0].id).toBe("c1");
        expect(calls[1].id).toBe("c2");
    });

    it("merges a function_call after assistant text into one message", () => {
        const { messages } = responsesToChatRequest(
            req({
                input: [
                    {
                        type: "message",
                        role: "assistant",
                        content: [{ type: "output_text", text: "Calling." }],
                    },
                    { type: "function_call", call_id: "c9", name: "f" },
                ],
            }),
        );
        expect(messages).toHaveLength(1);
        expect(messages[0].role).toBe("assistant");
        expect(JSON.stringify(messages[0].content)).toContain("Calling.");
        expect(
            (messages[0].tool_calls ?? []) as Array<{ id: string }>,
        ).toHaveLength(1);
    });

    it("concatenates function_call_output text parts", () => {
        const { messages } = responsesToChatRequest(
            req({
                input: [
                    {
                        type: "function_call_output",
                        call_id: "c1",
                        output: [
                            { type: "input_text", text: "part one " },
                            { type: "input_text", text: "part two" },
                        ],
                    },
                ],
            }),
        );
        expect(messages).toEqual([
            { role: "tool", tool_call_id: "c1", content: "part one part two" },
        ]);
    });

    it("ignores null tool parameters", () => {
        const { options } = responsesToChatRequest(
            req({
                tools: [{ type: "function", name: "f", parameters: null }],
            }),
        );
        const tools = options.tools as Array<{
            function: Record<string, unknown>;
        }>;
        expect(tools[0].function.parameters).toBeUndefined();
    });

    it("folds reasoning into the following text+tool message", () => {
        const { messages } = responsesToChatRequest(
            req({
                input: [
                    { type: "reasoning", summary: [{ text: "thinking" }] },
                    {
                        type: "message",
                        role: "assistant",
                        content: [{ type: "output_text", text: "Calling." }],
                    },
                    { type: "function_call", call_id: "c1", name: "f" },
                ],
            }),
        );
        expect(messages).toHaveLength(1);
        expect(messages[0].role).toBe("assistant");
        expect(messages[0].reasoning_content).toBe("thinking");
        expect(JSON.stringify(messages[0].content)).toContain("Calling.");
        expect(
            (messages[0].tool_calls ?? []) as Array<{ id: string }>,
        ).toHaveLength(1);
    });

    it("folds later reasoning into the previous assistant message", () => {
        const { messages } = responsesToChatRequest(
            req({
                input: [
                    {
                        type: "message",
                        role: "assistant",
                        content: [{ type: "output_text", text: "Calling." }],
                    },
                    { type: "reasoning", summary: [{ text: "thinking" }] },
                    { type: "reasoning", summary: [{ text: "more" }] },
                ],
            }),
        );
        // No consecutive assistant messages for strict providers.
        expect(messages).toHaveLength(1);
        expect(messages[0].role).toBe("assistant");
        expect(messages[0].reasoning_content).toContain("thinking");
        expect(messages[0].reasoning_content).toContain("more");
        expect(JSON.stringify(messages[0].content)).toContain("Calling.");
    });

    it("rejects unknown input item types", () => {
        expect(() =>
            responsesToChatRequest(
                req({ input: [{ type: "mcp_call" }] } as never),
            ),
        ).toThrow(/mcp_call/);
    });

    it("rejects conversation chaining fields loudly", () => {
        for (const over of [
            { previous_response_id: "resp_1" },
            { conversation: "conv_1" },
            { prompt: "prompt_1" },
        ]) {
            expect(() => responsesToChatRequest(req(over))).toThrow();
        }
    });

    it("round-trips reasoning through chatToResponsesRequest", async () => {
        const { chatToResponsesRequest } = await import(
            "../../src/text/responses/chatRequest.js"
        );
        const { messages } = responsesToChatRequest(
            req({
                input: [
                    {
                        type: "reasoning",
                        summary: [{ text: "thinking" }],
                    } as never,
                ],
            }),
        );
        const back = chatToResponsesRequest(messages, { model: "m" });
        const items = back.input as Array<Record<string, unknown>>;
        const reasoning = items.find((i) => i.type === "reasoning") as
            | { summary: Array<{ text: string }> }
            | undefined;
        expect(reasoning).toBeTruthy();
        expect(JSON.stringify(reasoning)).toContain("thinking");
    });

    it("round-trips through chatToResponsesRequest shape", async () => {
        const { chatToResponsesRequest } = await import(
            "../../src/text/responses/chatRequest.js"
        );
        const { messages, options } = responsesToChatRequest(
            req({ instructions: "Sys.", temperature: 0.2 }),
        );
        const back = chatToResponsesRequest(messages, {
            ...options,
            model: "test-model",
        });
        expect(back.model).toBe("test-model");
        expect(JSON.stringify(back.input)).toContain("Hello");
        expect(back.temperature).toBe(0.2);
    });

    it("round-trips Responses -> Chat -> Responses -> Chat", async () => {
        const { responsesToChatCompletion } = await import(
            "../../src/text/responses/chatResponse.js"
        );
        const { chatToResponsesResponse } = await import(
            "../../src/text/responses/chatToResponse.js"
        );
        const url = new URL("https://provider.test/v1/responses");
        // Start from a Responses request (what a client sends to /v1/responses).
        const rreq = {
            model: "m",
            input: [
                {
                    type: "message",
                    role: "user",
                    content: [{ type: "input_text", text: "Hi Sol" }],
                },
            ],
            stream: false,
        } as unknown as CreateResponseRequest;
        // Uphill: Responses request -> Chat (the uphill adapter).
        const { messages } = responsesToChatRequest(rreq);
        expect(messages).toEqual([
            {
                role: "user",
                content: [{ type: "text", text: "Hi Sol" }],
            },
        ]);
        // Simulate a chat-only model answering, convert back downhill through
        // the uphill adapter, then through the existing downhill adapter.
        const chat = {
            id: "chatcmpl-rt",
            created: 1700000001,
            model: "m",
            choices: [
                {
                    index: 0,
                    message: {
                        role: "assistant",
                        content: "Hi Sol, how can I help?",
                    },
                    finish_reason: "stop",
                },
            ],
            usage: {
                prompt_tokens: 4,
                completion_tokens: 8,
                total_tokens: 12,
            },
        } as unknown as Parameters<typeof chatToResponsesResponse>[0];
        const responses = chatToResponsesResponse(chat, "m");
        const back = responsesToChatCompletion(
            JSON.parse(JSON.stringify(responses)),
            "m",
            url,
            { requireUsage: true },
        );
        const msg = (
            back as unknown as {
                choices: Array<{
                    message: { content: string };
                    finish_reason: string;
                }>;
            }
        ).choices[0];
        expect(msg.message.content).toContain("Hi Sol, how can I help?");
        expect(msg.finish_reason).toBe("stop");
        expect(back.usage).toMatchObject({
            prompt_tokens: 4,
            completion_tokens: 8,
        });
    });
});
