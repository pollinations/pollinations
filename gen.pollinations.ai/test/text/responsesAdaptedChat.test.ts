import { CreateResponseRequestSchema } from "@shared/schemas/openai.ts";
import { describe, expect, it } from "vitest";
import {
    chatCompletionToResponse,
    chatStreamToResponsesStream,
    responsesToChatRequest,
} from "@/text/responses/adaptedChat.ts";
import { ResponsesInvalidRequestError } from "@/text/responses/request.ts";
import type { ChatCompletion } from "@/text/types.ts";

const usage = { prompt_tokens: 9, completion_tokens: 4, total_tokens: 13 };

function request(body: Record<string, unknown>) {
    return CreateResponseRequestSchema.parse({ model: "m", ...body });
}

function sse(...chunks: unknown[]): ReadableStream<Uint8Array> {
    const text = chunks
        .map((chunk) =>
            chunk === "[DONE]"
                ? "data: [DONE]\n\n"
                : `data: ${JSON.stringify(chunk)}\n\n`,
        )
        .join("");
    return new Response(text).body as ReadableStream<Uint8Array>;
}

async function events(stream: ReadableStream<Uint8Array>) {
    const text = await new Response(stream).text();
    const blocks = text.trim().split("\n\n");
    expect(blocks.at(-1)).toBe("data: [DONE]");
    return blocks.slice(0, -1).map((block) => {
        const [eventLine, dataLine] = block.split("\n");
        const event = JSON.parse(dataLine.slice("data: ".length));
        // Open Responses: the SSE event name matches the payload type.
        expect(eventLine).toBe(`event: ${event.type}`);
        return event;
    });
}

describe("Responses to Chat request", () => {
    it("translates instructions, items, tools, format and settings", () => {
        const chat = responsesToChatRequest(
            request({
                instructions: "Be brief.",
                input: [
                    { role: "developer", content: "No emoji." },
                    {
                        type: "message",
                        role: "user",
                        content: [
                            { type: "input_text", text: "Weather here?" },
                            {
                                type: "input_image",
                                image_url: "https://x.test/a.png",
                                detail: "low",
                            },
                        ],
                    },
                    {
                        type: "message",
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
                        name: "weather",
                        arguments: '{"city":"Rome"}',
                    },
                    { type: "reasoning", id: "rs_1", summary: [] },
                    {
                        type: "function_call_output",
                        call_id: "call_1",
                        output: "sunny",
                    },
                    {
                        type: "function_call_output",
                        call_id: "call_2",
                        output: [{ type: "input_text", text: "rain" }],
                    },
                ],
                tools: [
                    {
                        type: "function",
                        name: "weather",
                        parameters: { type: "object" },
                        strict: true,
                    },
                ],
                tool_choice: { type: "function", name: "weather" },
                text: {
                    format: {
                        type: "json_schema",
                        name: "answer",
                        schema: { type: "object" },
                        strict: true,
                    },
                },
                reasoning: { effort: "low" },
                max_output_tokens: 64,
                temperature: 0.2,
                safety_identifier: "user-1",
                stream: true,
            }),
        );

        expect(chat).toEqual({
            model: "m",
            stream: true,
            max_tokens: 64,
            temperature: 0.2,
            reasoning_effort: "low",
            user: "user-1",
            response_format: {
                type: "json_schema",
                json_schema: {
                    name: "answer",
                    schema: { type: "object" },
                    strict: true,
                },
            },
            tool_choice: { type: "function", function: { name: "weather" } },
            tools: [
                {
                    type: "function",
                    function: {
                        name: "weather",
                        parameters: { type: "object" },
                        strict: true,
                    },
                },
            ],
            messages: [
                { role: "system", content: "Be brief." },
                { role: "developer", content: "No emoji." },
                {
                    role: "user",
                    content: [
                        { type: "text", text: "Weather here?" },
                        {
                            type: "image_url",
                            image_url: {
                                url: "https://x.test/a.png",
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
                            function: {
                                name: "weather",
                                arguments: '{"city":"Rome"}',
                            },
                        },
                    ],
                },
                { role: "tool", tool_call_id: "call_1", content: "sunny" },
                { role: "tool", tool_call_id: "call_2", content: "rain" },
            ],
        });
    });

    it.each([
        [{ max_tool_calls: 1 }, "max_tool_calls"],
        [{ truncation: "auto" }, "truncation"],
        [{ top_logprobs: 2 }, "include"],
        [{ text: { format: { type: "grammar" } } }, "text.format"],
        [{ tool_choice: { type: "allowed_tools" } }, "tool_choice"],
        [
            {
                input: [
                    {
                        type: "function_call_output",
                        call_id: "nope",
                        output: "x",
                    },
                ],
            },
            "input",
        ],
        [{ input: [{ type: "web_search_call", id: "ws" }] }, "input"],
    ])("rejects %j as a 400 on param %s", (body, param) => {
        let thrown: unknown;
        try {
            responsesToChatRequest(request({ input: "hi", ...body }));
        } catch (error) {
            thrown = error;
        }
        expect(thrown).toBeInstanceOf(ResponsesInvalidRequestError);
        expect((thrown as ResponsesInvalidRequestError).details.error).toEqual(
            expect.objectContaining({
                type: "invalid_request_error",
                param,
            }),
        );
    });
});

describe("Chat completion to Responses JSON", () => {
    it("returns reasoning, text and function calls with billing-equal usage", () => {
        const response = chatCompletionToResponse(
            request({ input: "hi", reasoning: { effort: "low" } }),
            "community/a/b",
            {
                model: "upstream-name",
                choices: [
                    {
                        message: {
                            role: "assistant",
                            reasoning_content: "think",
                            content: "Calling.",
                            tool_calls: [
                                {
                                    id: "call_9",
                                    type: "function",
                                    function: {
                                        name: "weather",
                                        arguments: '{"city":"Oslo"}',
                                    },
                                },
                            ],
                        },
                        finish_reason: "tool_calls",
                    },
                ],
                usage: {
                    ...usage,
                    prompt_tokens_details: { cached_tokens: 3 },
                    reasoning_tokens: 2,
                },
            } as ChatCompletion,
        );

        expect(response).toMatchObject({
            object: "response",
            status: "completed",
            model: "community/a/b",
            reasoning: { effort: "low", summary: null },
            output: [
                {
                    type: "reasoning",
                    content: [{ type: "reasoning_text", text: "think" }],
                },
                {
                    type: "message",
                    role: "assistant",
                    status: "completed",
                    content: [
                        {
                            type: "output_text",
                            text: "Calling.",
                            annotations: [],
                        },
                    ],
                },
                {
                    type: "function_call",
                    call_id: "call_9",
                    name: "weather",
                    arguments: '{"city":"Oslo"}',
                    status: "completed",
                },
            ],
            usage: {
                input_tokens: 9,
                output_tokens: 4,
                total_tokens: 13,
                input_tokens_details: { cached_tokens: 3 },
                output_tokens_details: { reasoning_tokens: 2 },
            },
        });
    });

    it("marks a length stop incomplete", () => {
        const response = chatCompletionToResponse(
            request({ input: "hi" }),
            "m",
            {
                choices: [
                    {
                        message: { role: "assistant", content: "cut" },
                        finish_reason: "length",
                    },
                ],
                usage,
            },
        );
        expect(response).toMatchObject({
            status: "incomplete",
            incomplete_details: { reason: "max_output_tokens" },
            output: [{ type: "message", status: "incomplete" }],
        });
    });

    it("fails instead of returning a Response without usage", () => {
        expect(() =>
            chatCompletionToResponse(request({ input: "hi" }), "m", {
                choices: [{ message: { role: "assistant", content: "x" } }],
            }),
        ).toThrow(/omitted usage/);
    });
});

describe("Chat stream to Responses stream", () => {
    it("emits ordered Open Responses events for text and tool calls", async () => {
        const list = await events(
            chatStreamToResponsesStream(
                sse(
                    { choices: [{ delta: { reasoning_content: "hm" } }] },
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
                                                name: "weather",
                                                arguments: '{"ci',
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
                                            function: {
                                                arguments: 'ty":"Oslo"}',
                                            },
                                        },
                                    ],
                                },
                                finish_reason: "tool_calls",
                            },
                        ],
                    },
                    { choices: [], usage },
                    "[DONE]",
                ),
                request({ input: "hi", stream: true }),
                "m",
            ),
        );

        expect(list.map((event) => event.type)).toEqual([
            "response.created",
            "response.in_progress",
            "response.output_item.added",
            "response.content_part.added",
            "response.reasoning.delta",
            "response.reasoning.done",
            "response.content_part.done",
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
            "response.function_call_arguments.delta",
            "response.function_call_arguments.done",
            "response.output_item.done",
            "response.completed",
        ]);
        expect(list.map((event) => event.sequence_number)).toEqual(
            list.map((_, index) => index),
        );
        expect(list[12]).toMatchObject({ output_index: 1, text: "Hello" });
        expect(list[16]).toMatchObject({ output_index: 2, delta: '{"ci' });
        expect(list[18]).toMatchObject({
            output_index: 2,
            arguments: '{"city":"Oslo"}',
        });
        const completed = list.at(-1).response;
        expect(completed).toMatchObject({
            status: "completed",
            usage: { input_tokens: 9, output_tokens: 4, total_tokens: 13 },
            output: [
                { type: "reasoning" },
                {
                    type: "message",
                    content: [{ type: "output_text", text: "Hello" }],
                },
                { type: "function_call", call_id: "call_1" },
            ],
        });
        // Each item in the terminal response is the one streamed as done.
        for (const [index, item] of completed.output.entries()) {
            const done = list.find(
                (event) =>
                    event.type === "response.output_item.done" &&
                    event.output_index === index,
            );
            expect(done.item).toEqual(item);
        }
    });

    it("splits parallel calls that share index 0 by their ids", async () => {
        // Gemini's shape: each parallel call arrives whole, all at index 0.
        const call = (id: string, path: string) => ({
            choices: [
                {
                    delta: {
                        tool_calls: [
                            {
                                index: 0,
                                id,
                                function: {
                                    name: "save_file",
                                    arguments: JSON.stringify({ path }),
                                },
                            },
                        ],
                    },
                },
            ],
        });
        const list = await events(
            chatStreamToResponsesStream(
                sse(
                    call("call_a", "a.txt"),
                    call("call_b", "b.txt"),
                    {
                        choices: [{ delta: {}, finish_reason: "tool_calls" }],
                        usage,
                    },
                    "[DONE]",
                ),
                request({ input: "hi", stream: true }),
                "m",
            ),
        );

        expect(list.at(-1).response.output).toMatchObject([
            {
                call_id: "call_a",
                name: "save_file",
                arguments: '{"path":"a.txt"}',
            },
            {
                call_id: "call_b",
                name: "save_file",
                arguments: '{"path":"b.txt"}',
            },
        ]);
    });

    it.each([
        [
            "missing usage",
            [{ choices: [{ delta: { content: "x" } }] }, "[DONE]"],
            "usage_missing",
        ],
        [
            "a provider error",
            [{ error: { message: "boom", code: "rate_limited" } }],
            "rate_limited",
        ],
        [
            "a cut stream",
            [{ choices: [{ delta: { content: "x" } }], usage }],
            "upstream_stream_error",
        ],
    ])("ends with error and response.failed on %s", async (_, chunks, code) => {
        const list = await events(
            chatStreamToResponsesStream(
                sse(...chunks),
                request({ input: "hi", stream: true }),
                "m",
            ),
        );
        const [error, failed] = list.slice(-2);
        expect(error).toMatchObject({
            type: "error",
            code,
            error: { code },
        });
        expect(failed).toMatchObject({
            type: "response.failed",
            response: { status: "failed", usage: null, error: { code } },
        });
        expect(list.some((event) => event.type === "response.completed")).toBe(
            false,
        );
    });
});
