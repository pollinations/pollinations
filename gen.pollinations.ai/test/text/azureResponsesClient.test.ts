import { afterEach, describe, expect, it, vi } from "vitest";
import { callAzureResponses } from "../../src/text/azureResponsesClient.js";
import type { ChatMessage } from "../../src/text/types.js";

const modelConfig = {
    provider: "azure-openai",
    "azure-api-key": "test-key",
    "azure-resource-name": "myceli-prod-eastus",
    "azure-deployment-id": "gpt-5.6-sol",
    "azure-api-version": "2025-04-01-preview",
};

const RESPONSES_ENDPOINT =
    "https://myceli-prod-eastus.openai.azure.com/openai/deployments/gpt-5.6-sol/responses?api-version=2025-04-01-preview";

afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.AZURE_MYCELI_PROD_API_KEY;
});

describe("callAzureResponses", () => {
    it("converts a Chat Completions request into a Responses API body", async () => {
        let capturedBody: Record<string, unknown> | undefined;

        vi.spyOn(globalThis, "fetch").mockImplementationOnce(
            async (input, init) => {
                expect(String(input)).toBe(RESPONSES_ENDPOINT);
                expect(new Headers(init?.headers).get("api-key")).toBe(
                    "test-key",
                );
                capturedBody = JSON.parse(String(init?.body));
                return Response.json({
                    id: "resp_1",
                    object: "response",
                    created_at: 123,
                    model: "gpt-5.6-sol",
                    status: "completed",
                    output: [],
                    usage: {
                        input_tokens: 1,
                        output_tokens: 1,
                        total_tokens: 2,
                    },
                });
            },
        );

        const messages: ChatMessage[] = [
            { role: "system", content: "be concise" },
            { role: "user", content: "weather in Paris?" },
            {
                role: "assistant",
                content: "Let me check.",
                tool_calls: [
                    {
                        id: "call_1",
                        type: "function",
                        function: {
                            name: "get_weather",
                            arguments: '{"city":"Paris"}',
                        },
                    },
                ],
            },
            { role: "tool", content: "sunny", tool_call_id: "call_1" },
        ];

        await callAzureResponses(messages, {
            model: "gpt-5.6-sol",
            modelConfig,
            reasoning_effort: "medium",
            tools: [
                {
                    type: "function",
                    function: {
                        name: "get_weather",
                        description: "Get the weather",
                        parameters: { type: "object" },
                    },
                },
            ],
            tool_choice: "auto",
            max_completion_tokens: 1024,
        });

        expect(capturedBody).toMatchObject({
            model: "gpt-5.6-sol",
            reasoning: { effort: "medium" },
            max_output_tokens: 1024,
            tool_choice: "auto",
            tools: [
                {
                    type: "function",
                    name: "get_weather",
                    description: "Get the weather",
                    parameters: { type: "object" },
                },
            ],
            input: [
                {
                    role: "system",
                    content: [{ type: "input_text", text: "be concise" }],
                },
                {
                    role: "user",
                    content: [
                        { type: "input_text", text: "weather in Paris?" },
                    ],
                },
                {
                    role: "assistant",
                    content: [{ type: "output_text", text: "Let me check." }],
                },
                {
                    type: "function_call",
                    call_id: "call_1",
                    name: "get_weather",
                    arguments: '{"city":"Paris"}',
                },
                {
                    type: "function_call_output",
                    call_id: "call_1",
                    output: "sunny",
                },
            ],
        });
        expect(capturedBody).not.toHaveProperty("stream");
    });

    it("maps reasoning_effort values to Responses API semantics", async () => {
        const bodies: Array<Record<string, unknown>> = [];

        vi.spyOn(globalThis, "fetch").mockImplementation(
            async (_input, init) => {
                bodies.push(JSON.parse(String(init?.body)));
                return Response.json({
                    id: "resp_1",
                    object: "response",
                    model: "gpt-5.6-sol",
                    status: "completed",
                    output: [],
                });
            },
        );

        await callAzureResponses([{ role: "user", content: "hi" }], {
            model: "gpt-5.6-sol",
            modelConfig,
            reasoning_effort: "xhigh",
        });
        await callAzureResponses([{ role: "user", content: "hi" }], {
            model: "gpt-5.6-sol",
            modelConfig,
            reasoning_effort: "none",
        });

        expect(bodies[0].reasoning).toEqual({ effort: "high" });
        expect(bodies[1]).not.toHaveProperty("reasoning");
    });

    it("parses a Responses API output array into a ChatCompletion", async () => {
        vi.spyOn(globalThis, "fetch").mockImplementationOnce(async () =>
            Response.json({
                id: "resp_tool",
                object: "response",
                created_at: 456,
                model: "gpt-5.6-sol",
                status: "completed",
                output: [
                    {
                        type: "reasoning",
                        id: "rs_1",
                        summary: [
                            { type: "summary_text", text: "thinking..." },
                        ],
                    },
                    {
                        type: "message",
                        id: "msg_1",
                        role: "assistant",
                        status: "completed",
                        content: [
                            {
                                type: "output_text",
                                text: "The weather in Paris is sunny.",
                                annotations: [],
                            },
                        ],
                    },
                    {
                        type: "function_call",
                        id: "fc_1",
                        call_id: "call_9",
                        name: "get_weather",
                        arguments: '{"city":"Paris"}',
                    },
                ],
                usage: {
                    input_tokens: 10,
                    output_tokens: 5,
                    total_tokens: 15,
                    output_tokens_details: { reasoning_tokens: 3 },
                },
            }),
        );

        const completion = await callAzureResponses(
            [{ role: "user", content: "weather in Paris?" }],
            { model: "gpt-5.6-sol", modelConfig },
        );

        const message = completion.choices?.[0]?.message;
        expect(message?.content).toBe("The weather in Paris is sunny.");
        expect(message?.tool_calls).toEqual([
            {
                id: "call_9",
                type: "function",
                function: {
                    name: "get_weather",
                    arguments: '{"city":"Paris"}',
                },
            },
        ]);
        expect(message?.reasoning_content).toBe("thinking...");
        expect(completion.choices?.[0]?.finish_reason).toBe("tool_calls");
        expect(completion.object).toBe("chat.completion");
        expect(completion.created).toBe(456);
        expect(completion.usage).toEqual({
            prompt_tokens: 10,
            completion_tokens: 5,
            total_tokens: 15,
            completion_tokens_details: { reasoning_tokens: 3 },
        });
    });

    it("maps incomplete max_output_tokens to finish_reason length", async () => {
        vi.spyOn(globalThis, "fetch").mockImplementationOnce(async () =>
            Response.json({
                id: "resp_trunc",
                object: "response",
                model: "gpt-5.6-sol",
                status: "incomplete",
                incomplete_details: { reason: "max_output_tokens" },
                output: [
                    {
                        type: "message",
                        id: "msg_1",
                        role: "assistant",
                        content: [
                            {
                                type: "output_text",
                                text: "truncated",
                                annotations: [],
                            },
                        ],
                    },
                ],
            }),
        );

        const completion = await callAzureResponses(
            [{ role: "user", content: "write a lot" }],
            { model: "gpt-5.6-sol", modelConfig },
        );

        expect(completion.choices?.[0]?.finish_reason).toBe("length");
    });

    it("converts the Responses API SSE stream to Chat Completions chunks", async () => {
        const encoder = new TextEncoder();
        const events = [
            'data: {"type":"response.created","response":{"id":"resp_stream","created_at":1234,"model":"gpt-5.6-sol"}}\n\n',
            'data: {"type":"response.output_item.added","output_index":0,"item":{"type":"message","id":"msg_1","role":"assistant","status":"in_progress"}}\n\n',
            'data: {"type":"response.output_text.delta","item_id":"msg_1","output_index":0,"content_index":0,"delta":"Hello"}\n\n',
            'data: {"type":"response.output_text.delta","item_id":"msg_1","output_index":0,"content_index":0,"delta":" world"}\n\n',
            'data: {"type":"response.completed","response":{"id":"resp_stream","status":"completed","output":[{"type":"message","id":"msg_1","role":"assistant","content":[{"type":"output_text","text":"Hello world"}]}],"usage":{"input_tokens":3,"output_tokens":2,"total_tokens":5}}}\n\n',
        ];

        const stream = new ReadableStream<Uint8Array>({
            start(controller) {
                for (const event of events) {
                    controller.enqueue(encoder.encode(event));
                }
                controller.close();
            },
        });

        vi.spyOn(globalThis, "fetch").mockImplementationOnce(
            async () =>
                new Response(stream, {
                    headers: { "Content-Type": "text/event-stream" },
                }),
        );

        const completion = await callAzureResponses(
            [{ role: "user", content: "hi" }],
            {
                model: "gpt-5.6-sol",
                modelConfig,
                stream: true,
                stream_options: { include_usage: true },
            },
        );

        const reader = completion.responseStream?.getReader();
        let output = "";
        while (true) {
            const { done, value } = await reader!.read();
            if (done) break;
            output += new TextDecoder().decode(value);
        }

        const chunks = output
            .split("\n\n")
            .filter((line) => line.startsWith("data: "))
            .map((line) => {
                const raw = line.slice(6);
                try {
                    return JSON.parse(raw);
                } catch {
                    return raw;
                }
            });

        expect(chunks[0].choices[0].delta).toEqual({ content: "Hello" });
        expect(chunks[1].choices[0].delta).toEqual({ content: " world" });
        expect(chunks[2].choices[0]).toMatchObject({
            delta: {},
            finish_reason: "stop",
        });
        expect(chunks[2].id).toBe("resp_stream");
        expect(chunks[3].usage).toEqual({
            prompt_tokens: 3,
            completion_tokens: 2,
            total_tokens: 5,
        });
        expect(chunks[4]).toBe("[DONE]");
    });

    it("streams tool-call arguments deltas", async () => {
        const encoder = new TextEncoder();
        const events = [
            'data: {"type":"response.created","response":{"id":"resp_tc","created_at":1,"model":"gpt-5.6-sol"}}\n\n',
            'data: {"type":"response.output_item.added","output_index":0,"item":{"type":"function_call","id":"fc_1","call_id":"call_1","name":"get_weather","arguments":""}}\n\n',
            'data: {"type":"response.function_call_arguments.delta","item_id":"fc_1","output_index":0,"delta":"{\\"city\\":\\"Par"}\n\n',
            'data: {"type":"response.function_call_arguments.delta","item_id":"fc_1","output_index":0,"delta":"is\\"}"}\n\n',
            'data: {"type":"response.completed","response":{"id":"resp_tc","status":"completed","output":[{"type":"function_call","id":"fc_1","call_id":"call_1","name":"get_weather","arguments":"{\\"city\\":\\"Paris\\"}"}]}}\n\n',
        ];

        const stream = new ReadableStream<Uint8Array>({
            start(controller) {
                for (const event of events) {
                    controller.enqueue(encoder.encode(event));
                }
                controller.close();
            },
        });

        vi.spyOn(globalThis, "fetch").mockImplementationOnce(
            async () => new Response(stream),
        );

        const completion = await callAzureResponses(
            [{ role: "user", content: "hi" }],
            { model: "gpt-5.6-sol", modelConfig, stream: true },
        );

        const reader = completion.responseStream?.getReader();
        let output = "";
        while (true) {
            const { done, value } = await reader!.read();
            if (done) break;
            output += new TextDecoder().decode(value);
        }

        const chunks = output
            .split("\n\n")
            .filter((line) => line.startsWith("data: "))
            .map((line) => {
                const raw = line.slice(6);
                try {
                    return JSON.parse(raw);
                } catch {
                    return raw;
                }
            });

        expect(chunks[0].choices[0].delta.tool_calls[0]).toMatchObject({
            index: 0,
            id: "call_1",
            type: "function",
            function: { name: "get_weather", arguments: "" },
        });
        expect(
            chunks[1].choices[0].delta.tool_calls[0].function.arguments,
        ).toBe('{"city":"Par');
        expect(
            chunks[2].choices[0].delta.tool_calls[0].function.arguments,
        ).toBe('is"}');
        expect(chunks[3].choices[0]).toMatchObject({
            delta: {},
            finish_reason: "tool_calls",
        });
        expect(chunks[4]).toBe("[DONE]");
    });

    it("routes tool-call args to the right tool when item.id is missing", async () => {
        const encoder = new TextEncoder();
        const events = [
            'data: {"type":"response.created","response":{"id":"resp_multi","created_at":1,"model":"gpt-5.6-sol"}}\n\n',
            'data: {"type":"response.output_item.added","output_index":0,"item":{"type":"function_call","id":"fc_1","call_id":"call_1","name":"get_weather","arguments":""}}\n\n',
            'data: {"type":"response.output_item.added","output_index":1,"item":{"type":"function_call","call_id":"call_2","name":"get_news","arguments":""}}\n\n',
            'data: {"type":"response.function_call_arguments.delta","item_id":"call_2","output_index":1,"delta":"{\\"topic\\":\\"AI\\"}"}\n\n',
            'data: {"type":"response.completed","response":{"id":"resp_multi","status":"completed","output":[{"type":"function_call","id":"fc_1","call_id":"call_1","name":"get_weather","arguments":"{}"},{"type":"function_call","id":"fc_2","call_id":"call_2","name":"get_news","arguments":"{\\"topic\\":\\"AI\\"}"}]}}\n\n',
        ];

        const stream = new ReadableStream<Uint8Array>({
            start(controller) {
                for (const event of events) {
                    controller.enqueue(encoder.encode(event));
                }
                controller.close();
            },
        });

        vi.spyOn(globalThis, "fetch").mockImplementationOnce(
            async () => new Response(stream),
        );

        const completion = await callAzureResponses(
            [{ role: "user", content: "hi" }],
            { model: "gpt-5.6-sol", modelConfig, stream: true },
        );

        const reader = completion.responseStream?.getReader();
        let output = "";
        while (true) {
            const { done, value } = await reader!.read();
            if (done) break;
            output += new TextDecoder().decode(value);
        }

        const chunks = output
            .split("\n\n")
            .filter((line) => line.startsWith("data: "))
            .map((line) => {
                const raw = line.slice(6);
                try {
                    return JSON.parse(raw);
                } catch {
                    return raw;
                }
            });

        expect(chunks[1].choices[0].delta.tool_calls[0]).toMatchObject({
            index: 1,
            id: "call_2",
            function: { name: "get_news", arguments: "" },
        });
        expect(chunks[2].choices[0].delta.tool_calls[0]).toMatchObject({
            index: 1,
            function: { arguments: '{"topic":"AI"}' },
        });
    });

    it("streams reasoning deltas as reasoning_content", async () => {
        const encoder = new TextEncoder();
        const events = [
            'data: {"type":"response.created","response":{"id":"resp_reason","created_at":1,"model":"gpt-5.6-sol"}}\n\n',
            'data: {"type":"response.reasoning_summary_text.delta","item_id":"rs_1","output_index":0,"summary_index":0,"delta":"think"}\n\n',
            'data: {"type":"response.reasoning_summary_text.delta","item_id":"rs_1","output_index":0,"summary_index":0,"delta":"ing"}\n\n',
            'data: {"type":"response.reasoning_part.added","item_id":"rp_1","output_index":1,"content_index":0,"text":"deep"}\n\n',
            'data: {"type":"response.reasoning_part.delta","item_id":"rp_1","output_index":1,"content_index":0,"delta":"er"}\n\n',
            'data: {"type":"response.output_text.delta","item_id":"msg_1","output_index":2,"content_index":0,"delta":"answer"}\n\n',
            'data: {"type":"response.completed","response":{"id":"resp_reason","status":"completed","output":[{"type":"message","id":"msg_1","role":"assistant","content":[{"type":"output_text","text":"answer"}]}]}}\n\n',
        ];

        const stream = new ReadableStream<Uint8Array>({
            start(controller) {
                for (const event of events) {
                    controller.enqueue(encoder.encode(event));
                }
                controller.close();
            },
        });

        vi.spyOn(globalThis, "fetch").mockImplementationOnce(
            async () => new Response(stream),
        );

        const completion = await callAzureResponses(
            [{ role: "user", content: "hi" }],
            { model: "gpt-5.6-sol", modelConfig, stream: true },
        );

        const reader = completion.responseStream?.getReader();
        let output = "";
        while (true) {
            const { done, value } = await reader!.read();
            if (done) break;
            output += new TextDecoder().decode(value);
        }

        const chunks = output
            .split("\n\n")
            .filter((line) => line.startsWith("data: "))
            .map((line) => {
                const raw = line.slice(6);
                try {
                    return JSON.parse(raw);
                } catch {
                    return raw;
                }
            });

        expect(chunks[0].choices[0].delta).toEqual({
            reasoning_content: "think",
        });
        expect(chunks[1].choices[0].delta).toEqual({
            reasoning_content: "ing",
        });
        expect(chunks[2].choices[0].delta).toEqual({
            reasoning_content: "deep",
        });
        expect(chunks[3].choices[0].delta).toEqual({
            reasoning_content: "er",
        });
        expect(chunks[4].choices[0].delta).toEqual({ content: "answer" });
    });

    it("emits an error when the stream ends before completion", async () => {
        const encoder = new TextEncoder();
        const events = [
            'data: {"type":"response.created","response":{"id":"resp_cut","created_at":1,"model":"gpt-5.6-sol"}}\n\n',
            'data: {"type":"response.output_text.delta","item_id":"msg_1","output_index":0,"content_index":0,"delta":"partial"}\n\n',
        ];

        const stream = new ReadableStream<Uint8Array>({
            start(controller) {
                for (const event of events) {
                    controller.enqueue(encoder.encode(event));
                }
                controller.close();
            },
        });

        vi.spyOn(globalThis, "fetch").mockImplementationOnce(
            async () => new Response(stream),
        );

        const completion = await callAzureResponses(
            [{ role: "user", content: "hi" }],
            { model: "gpt-5.6-sol", modelConfig, stream: true },
        );

        const reader = completion.responseStream?.getReader();
        let output = "";
        while (true) {
            const { done, value } = await reader!.read();
            if (done) break;
            output += new TextDecoder().decode(value);
        }

        const errorEvents = output
            .split("\n\n")
            .filter((line) => line.startsWith("data: "))
            .map((line) => line.slice(6))
            .filter((raw) => {
                try {
                    return Boolean(JSON.parse(raw).error);
                } catch {
                    return false;
                }
            });

        expect(errorEvents.length).toBeGreaterThan(0);
        expect(JSON.parse(errorEvents[0]).error.message).toBe(
            "Stream ended unexpectedly before completion.",
        );
    });

    it("throws when the Azure API key is missing", async () => {
        delete process.env.AZURE_MYCELI_PROD_API_KEY;
        vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
            throw new Error("unexpected fetch");
        });

        await expect(
            callAzureResponses([{ role: "user", content: "hi" }], {
                model: "gpt-5.6-sol",
                modelConfig: { ...modelConfig, "azure-api-key": undefined },
            }),
        ).rejects.toThrow("AZURE_MYCELI_PROD_API_KEY is not configured");
    });
});
