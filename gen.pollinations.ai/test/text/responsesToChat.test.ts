import {
    openaiUsageToUsage,
    responsesUsageToUsage,
} from "@shared/registry/usage-headers.ts";
import {
    type CreateResponseRequest,
    CreateResponseRequestSchema,
    CreateResponseResponseSchema,
} from "@shared/schemas/openai.ts";
import { describe, expect, it } from "vitest";
import {
    chatCompletionToResponse,
    chatToResponsesStream,
    chatUsageToResponsesUsage,
    responsesToChatRequest,
} from "../../src/text/responses/chatAdapter.js";
import { ResponsesInvalidRequestError } from "../../src/text/responses/request.js";

function request(body: Record<string, unknown>): CreateResponseRequest {
    return CreateResponseRequestSchema.parse({ model: "test-model", ...body });
}

const usage = {
    prompt_tokens: 12,
    completion_tokens: 5,
    total_tokens: 17,
};

describe("responsesToChatRequest", () => {
    it("turns instructions, history and tool results into chat messages", () => {
        const chat = responsesToChatRequest(
            request({
                instructions: "Be brief.",
                input: [
                    { role: "developer", content: "Use metric units." },
                    {
                        role: "user",
                        content: [
                            { type: "input_text", text: "Weather?" },
                            {
                                type: "input_image",
                                image_url: "https://example.com/sky.png",
                                detail: "low",
                            },
                        ],
                    },
                    {
                        role: "assistant",
                        content: [{ type: "output_text", text: "Checking." }],
                    },
                    {
                        type: "function_call",
                        call_id: "call_1",
                        name: "weather",
                        arguments: '{"city":"Paris"}',
                    },
                    {
                        type: "function_call",
                        call_id: "call_2",
                        name: "time",
                        arguments: "{}",
                    },
                    {
                        type: "function_call_output",
                        call_id: "call_1",
                        output: "18C",
                    },
                    {
                        type: "function_call_output",
                        call_id: "call_2",
                        output: [{ type: "input_text", text: "noon" }],
                    },
                    { type: "reasoning", id: "rs_1", summary: [] },
                    { role: "user", content: "Thanks" },
                ],
            }),
        );

        expect(chat.messages).toEqual([
            { role: "system", content: "Be brief." },
            { role: "developer", content: "Use metric units." },
            {
                role: "user",
                content: [
                    { type: "text", text: "Weather?" },
                    {
                        type: "image_url",
                        image_url: {
                            url: "https://example.com/sky.png",
                            detail: "low",
                        },
                    },
                ],
            },
            {
                role: "assistant",
                content: "Checking.",
                tool_calls: [
                    {
                        id: "call_1",
                        type: "function",
                        function: {
                            name: "weather",
                            arguments: '{"city":"Paris"}',
                        },
                    },
                    {
                        id: "call_2",
                        type: "function",
                        function: { name: "time", arguments: "{}" },
                    },
                ],
            },
            { role: "tool", tool_call_id: "call_1", content: "18C" },
            { role: "tool", tool_call_id: "call_2", content: "noon" },
            { role: "user", content: "Thanks" },
        ]);
    });

    it("maps sampling, reasoning, tools and structured output", () => {
        const chat = responsesToChatRequest(
            request({
                input: "hi",
                stream: true,
                max_output_tokens: 200,
                temperature: 0.2,
                top_p: 0.9,
                safety_identifier: "user-1",
                reasoning: { effort: "low", summary: "auto" },
                parallel_tool_calls: false,
                tools: [
                    {
                        type: "function",
                        name: "lookup",
                        description: "Find it",
                        parameters: { type: "object", properties: {} },
                        strict: true,
                    },
                ],
                tool_choice: { type: "function", name: "lookup" },
                text: {
                    format: {
                        type: "json_schema",
                        name: "answer",
                        schema: { type: "object" },
                        strict: true,
                    },
                },
                prompt_cache_key: "key",
            }),
        );

        expect(chat).toMatchObject({
            model: "test-model",
            stream: true,
            stream_options: { include_usage: true },
            max_tokens: 200,
            temperature: 0.2,
            top_p: 0.9,
            user: "user-1",
            reasoning_effort: "low",
            parallel_tool_calls: false,
            tools: [
                {
                    type: "function",
                    function: {
                        name: "lookup",
                        description: "Find it",
                        parameters: { type: "object", properties: {} },
                        strict: true,
                    },
                },
            ],
            tool_choice: { type: "function", function: { name: "lookup" } },
            response_format: {
                type: "json_schema",
                json_schema: {
                    name: "answer",
                    schema: { type: "object" },
                    strict: true,
                },
            },
            prompt_cache_key: "key",
        });
        expect(chat).not.toHaveProperty("max_output_tokens");
    });

    it("keeps a cache breakpoint on its content part and enables explicit caching", () => {
        const chat = responsesToChatRequest(
            request({
                input: [
                    {
                        role: "user",
                        content: [
                            {
                                type: "input_text",
                                text: "Long context",
                                prompt_cache_breakpoint: { mode: "explicit" },
                            },
                        ],
                    },
                ],
            }),
        );

        expect(chat.messages[0].content).toEqual([
            {
                type: "text",
                text: "Long context",
                prompt_cache_breakpoint: { mode: "explicit" },
            },
        ]);
        expect(chat.prompt_cache_options).toEqual({ mode: "explicit" });
    });

    it.each([
        ["max_tool_calls", { max_tool_calls: 2 }],
        ["top_logprobs", { top_logprobs: 3 }],
        ["truncation", { truncation: "auto" }],
        ["reasoning.effort", { reasoning: { effort: "extreme" } }],
        ["input", { input: [{ type: "web_search_call" }] }],
        [
            "input",
            {
                input: [
                    {
                        role: "user",
                        content: [{ type: "input_file", file_id: "f" }],
                    },
                ],
            },
        ],
        [
            "input",
            {
                input: [
                    { type: "function_call_output", call_id: "x", output: "" },
                ],
            },
        ],
        ["tool_choice", { tool_choice: { type: "allowed_tools" } }],
    ])("rejects %s that chat cannot express", (param, body) => {
        let error: unknown;
        try {
            responsesToChatRequest(request({ input: "hi", ...body }));
        } catch (thrown) {
            error = thrown;
        }
        expect(error).toBeInstanceOf(ResponsesInvalidRequestError);
        expect(
            (error as ResponsesInvalidRequestError).details.error.param,
        ).toBe(param);
    });
});

describe("chatUsageToResponsesUsage", () => {
    it.each([
        ["plain", usage],
        [
            "detail objects",
            {
                prompt_tokens: 100,
                completion_tokens: 40,
                total_tokens: 140,
                prompt_tokens_details: {
                    cached_tokens: 30,
                    cache_write_tokens: 10,
                    audio_tokens: 5,
                    cache_type: "ephemeral",
                },
                completion_tokens_details: {
                    reasoning_tokens: 12,
                    audio_tokens: 3,
                },
            },
        ],
        [
            "top-level cache and reasoning counts",
            {
                prompt_tokens: 100,
                completion_tokens: 40,
                total_tokens: 140,
                cache_read_input_tokens: 20,
                cache_creation_input_tokens: 8,
                reasoning_tokens: 9,
            },
        ],
        [
            "additive details",
            {
                prompt_tokens: 50,
                completion_tokens: 10,
                total_tokens: 70,
                prompt_tokens_details: { cached_tokens: 10 },
                completion_tokens_details: { reasoning_tokens: 10 },
            },
        ],
    ])("bills %s exactly as Chat Completions does", (_name, chatUsage) => {
        expect(
            responsesUsageToUsage(chatUsageToResponsesUsage(chatUsage)),
        ).toEqual(openaiUsageToUsage(chatUsage));
    });
});

describe("chatCompletionToResponse", () => {
    it("returns reasoning, text and function calls as Responses items", () => {
        const response = chatCompletionToResponse(
            {
                model: "upstream-model",
                choices: [
                    {
                        finish_reason: "tool_calls",
                        message: {
                            role: "assistant",
                            reasoning_content: "Thinking.",
                            content: "Looking it up.",
                            tool_calls: [
                                {
                                    id: "call_1",
                                    type: "function",
                                    function: {
                                        name: "lookup",
                                        arguments: '{"q":"x"}',
                                    },
                                },
                                {
                                    id: "call_2",
                                    type: "function",
                                    function: { name: "ping", arguments: "" },
                                },
                            ],
                        },
                    },
                ],
                usage,
            },
            request({ input: "hi" }),
            "upstream-model",
        );

        expect(CreateResponseResponseSchema.safeParse(response).success).toBe(
            true,
        );
        expect(response).toMatchObject({
            object: "response",
            status: "completed",
            model: "upstream-model",
            usage: { input_tokens: 12, output_tokens: 5, total_tokens: 17 },
        });
        expect(response.output).toMatchObject([
            {
                type: "reasoning",
                summary: [{ type: "summary_text", text: "Thinking." }],
            },
            {
                type: "message",
                role: "assistant",
                status: "completed",
                content: [{ type: "output_text", text: "Looking it up." }],
            },
            {
                type: "function_call",
                call_id: "call_1",
                name: "lookup",
                arguments: '{"q":"x"}',
                status: "completed",
            },
            {
                type: "function_call",
                call_id: "call_2",
                name: "ping",
                arguments: "{}",
            },
        ]);
    });

    it("reports a truncated answer as incomplete", () => {
        const response = chatCompletionToResponse(
            {
                choices: [
                    {
                        finish_reason: "length",
                        message: { role: "assistant", content: "Cut off" },
                    },
                ],
                usage,
            },
            request({ input: "hi" }),
            "m",
        );

        expect(response).toMatchObject({
            status: "incomplete",
            incomplete_details: { reason: "max_output_tokens" },
            output: [{ type: "message", status: "incomplete" }],
        });
    });

    it.each([
        [
            "no usage",
            { choices: [{ message: { role: "assistant", content: "x" } }] },
        ],
        [
            "invalid usage",
            {
                choices: [{ message: { role: "assistant", content: "x" } }],
                usage: { prompt_tokens: -1 },
            },
        ],
    ])("fails a completion with %s", (_name, completion) => {
        expect(() =>
            chatCompletionToResponse(completion, request({ input: "hi" }), "m"),
        ).toThrow(/omitted usage/);
    });

    it("fails a tool call with invalid JSON arguments", () => {
        expect(() =>
            chatCompletionToResponse(
                {
                    choices: [
                        {
                            finish_reason: "tool_calls",
                            message: {
                                role: "assistant",
                                tool_calls: [
                                    {
                                        id: "c",
                                        function: { name: "f", arguments: "{" },
                                    },
                                ],
                            },
                        },
                    ],
                    usage,
                },
                request({ input: "hi" }),
                "m",
            ),
        ).toThrow(/invalid tool arguments/);
    });
});

function chatStream(chunks: unknown[], done = true) {
    const encoder = new TextEncoder();
    const lines = chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`);
    if (done) lines.push("data: [DONE]\n\n");
    return new ReadableStream<Uint8Array>({
        start(controller) {
            for (const line of lines) controller.enqueue(encoder.encode(line));
            controller.close();
        },
    });
}

async function responsesEvents(stream: ReadableStream<Uint8Array>) {
    const text = await new Response(stream).text();
    return text
        .split("\n\n")
        .filter((block) => block.startsWith("event: "))
        .map((block) => JSON.parse(block.split("\ndata: ")[1]));
}

describe("chatToResponsesStream", () => {
    it("streams reasoning, text and a tool call in Responses event order", async () => {
        const events = await responsesEvents(
            chatToResponsesStream(
                chatStream([
                    {
                        choices: [{ delta: { reasoning_content: "Hmm. " } }],
                    },
                    { choices: [{ delta: { content: "Hel" } }] },
                    { choices: [{ delta: { content: "lo" } }] },
                    {
                        choices: [
                            {
                                delta: {
                                    tool_calls: [
                                        {
                                            index: 0,
                                            id: "call_1",
                                            function: {
                                                name: "lookup",
                                                arguments: '{"q":',
                                            },
                                        },
                                    ],
                                },
                            },
                        ],
                    },
                    {
                        choices: [
                            {
                                delta: {
                                    tool_calls: [
                                        {
                                            index: 0,
                                            function: { arguments: '"x"}' },
                                        },
                                    ],
                                },
                                finish_reason: "tool_calls",
                            },
                        ],
                    },
                    { choices: [], usage },
                ]),
                request({ input: "hi", stream: true }),
                "upstream-model",
            ),
        );

        expect(events.map((event) => event.type)).toEqual([
            "response.created",
            "response.in_progress",
            "response.output_item.added",
            "response.reasoning_summary_part.added",
            "response.reasoning_summary_text.delta",
            "response.reasoning_summary_text.done",
            "response.reasoning_summary_part.done",
            "response.output_item.done",
            "response.output_item.added",
            "response.content_part.added",
            "response.output_text.delta",
            "response.output_text.delta",
            "response.output_text.done",
            "response.content_part.done",
            "response.output_item.done",
            "response.output_item.added",
            "response.function_call_arguments.delta",
            "response.function_call_arguments.done",
            "response.output_item.done",
            "response.completed",
        ]);
        expect(events.map((event) => event.sequence_number)).toEqual(
            events.map((_, index) => index),
        );
        const done = events.at(-1).response;
        expect(done).toMatchObject({
            status: "completed",
            model: "upstream-model",
            usage: { input_tokens: 12, output_tokens: 5 },
        });
        expect(done.output).toMatchObject([
            { type: "reasoning" },
            {
                type: "message",
                content: [{ type: "output_text", text: "Hello" }],
            },
            {
                type: "function_call",
                call_id: "call_1",
                name: "lookup",
                arguments: '{"q":"x"}',
            },
        ]);
        expect(CreateResponseResponseSchema.safeParse(done).success).toBe(true);
    });

    it("ends with response.incomplete when the model hits its limit", async () => {
        const events = await responsesEvents(
            chatToResponsesStream(
                chatStream([
                    {
                        choices: [
                            {
                                delta: { content: "Cut" },
                                finish_reason: "length",
                            },
                        ],
                    },
                    { choices: [], usage },
                ]),
                request({ input: "hi", stream: true }),
                "m",
            ),
        );

        expect(events.at(-1)).toMatchObject({
            type: "response.incomplete",
            response: {
                status: "incomplete",
                incomplete_details: { reason: "max_output_tokens" },
            },
        });
    });

    it.each([
        ["no terminal usage", [{ choices: [{ delta: { content: "x" } }] }]],
        [
            "an upstream error chunk",
            [{ error: { message: "provider exploded" } }],
        ],
    ])("fails the stream with %s", async (_name, chunks) => {
        const events = await responsesEvents(
            chatToResponsesStream(
                chatStream(chunks),
                request({ input: "hi", stream: true }),
                "m",
            ),
        );

        expect(events.map((event) => event.type).slice(-2)).toEqual([
            "error",
            "response.failed",
        ]);
        expect(events.map((event) => event.type)).not.toContain(
            "response.completed",
        );
    });

    it("fails a stream that ends without [DONE]", async () => {
        const events = await responsesEvents(
            chatToResponsesStream(
                chatStream([{ choices: [{ delta: { content: "x" } }] }], false),
                request({ input: "hi", stream: true }),
                "m",
            ),
        );

        expect(events.at(-1)).toMatchObject({
            type: "response.failed",
            response: { status: "failed" },
        });
    });
});
