import { afterEach, describe, expect, it, vi } from "vitest";
import { callAzureResponses } from "../../src/text/azureResponsesClient.js";
import type { ChatCompletion, ChatMessage } from "../../src/text/types.js";

const ENDPOINT =
    "https://myceli-prod-eastus.openai.azure.com/openai/v1/responses";
const modelConfig = {
    provider: "azure-openai",
    "azure-api-key": "test-key",
    "azure-resource-name": "myceli-prod-eastus",
    "azure-deployment-id": "gpt-5.6-sol",
};

afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.AZURE_MYCELI_PROD_API_KEY;
});

function mockJson(data: Record<string, unknown>, status = 200) {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        Response.json(data, { status }),
    );
}

function mockStream(events: string[]) {
    const encoder = new TextEncoder();
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(
            new ReadableStream<Uint8Array>({
                start(controller) {
                    for (const event of events) {
                        controller.enqueue(encoder.encode(event));
                    }
                    controller.close();
                },
            }),
            { headers: { "Content-Type": "text/event-stream" } },
        ),
    );
}

async function chunks(completion: ChatCompletion) {
    const reader = completion.responseStream?.getReader();
    if (!reader) throw new Error("Expected a response stream");
    let output = "";
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        output += new TextDecoder().decode(value);
    }
    return output
        .split("\n\n")
        .filter((line) => line.startsWith("data: "))
        .map((line) => {
            const data = line.slice(6);
            try {
                return JSON.parse(data);
            } catch {
                return data;
            }
        });
}

describe("callAzureResponses", () => {
    it("sends the documented Azure OpenAI v1 Responses shape", async () => {
        const bodies: Record<string, unknown>[] = [];
        vi.spyOn(globalThis, "fetch").mockImplementation(
            async (input, init) => {
                expect(String(input)).toBe(ENDPOINT);
                expect(new Headers(init?.headers).get("api-key")).toBe(
                    "test-key",
                );
                bodies.push(JSON.parse(String(init?.body)));
                return Response.json({
                    id: "resp_1",
                    model: "gpt-5.6-sol",
                    status: "completed",
                    output: [],
                });
            },
        );

        const messages: ChatMessage[] = [
            { role: "system", content: "Be concise." },
            {
                role: "user",
                content: [
                    { type: "text", text: "Weather?" },
                    {
                        type: "image_url",
                        image_url: {
                            url: "data:image/png;base64,AA==",
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
                ],
            },
            { role: "tool", tool_call_id: "call_1", content: "sunny" },
        ];
        const tool = {
            type: "function",
            function: {
                name: "weather",
                description: "Get weather",
                parameters: { type: "object" },
                strict: true,
            },
        };

        await callAzureResponses(messages, {
            model: "gpt-5.6-sol",
            modelConfig,
            reasoning_effort: "max",
            tools: [tool],
            tool_choice: { type: "function", function: { name: "weather" } },
            max_completion_tokens: 128,
            user: "hashed-user",
            response_format: {
                type: "json_schema",
                json_schema: {
                    name: "answer",
                    strict: true,
                    schema: { type: "object" },
                },
            },
        });
        await callAzureResponses([{ role: "user", content: "Hi" }], {
            model: "gpt-5.6-sol",
            modelConfig,
            reasoning_effort: "none",
        });

        expect(bodies[0]).toMatchObject({
            model: "gpt-5.6-sol",
            store: false,
            reasoning: { effort: "max" },
            max_output_tokens: 128,
            safety_identifier: "hashed-user",
            tools: [
                {
                    type: "function",
                    name: "weather",
                    description: "Get weather",
                    parameters: { type: "object" },
                    strict: true,
                },
            ],
            tool_choice: { type: "function", name: "weather" },
            text: {
                format: {
                    type: "json_schema",
                    name: "answer",
                    strict: true,
                    schema: { type: "object" },
                },
            },
            input: [
                {
                    role: "system",
                    content: [{ type: "input_text", text: "Be concise." }],
                },
                {
                    role: "user",
                    content: [
                        { type: "input_text", text: "Weather?" },
                        {
                            type: "input_image",
                            image_url: "data:image/png;base64,AA==",
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
                    type: "function_call_output",
                    call_id: "call_1",
                    output: "sunny",
                },
            ],
        });
        expect(bodies[1].reasoning).toEqual({ effort: "none" });
    });

    it("maps output, tool calls, finish reason, and every billable usage field", async () => {
        mockJson({
            id: "resp_tool",
            created_at: 123,
            model: "gpt-5.6-sol",
            status: "completed",
            output: [
                {
                    type: "reasoning",
                    summary: [{ type: "summary_text", text: "Checked." }],
                },
                {
                    type: "message",
                    content: [{ type: "output_text", text: "Calling." }],
                },
                {
                    type: "function_call",
                    call_id: "call_9",
                    name: "weather",
                    arguments: '{"city":"Paris"}',
                },
            ],
            usage: {
                input_tokens: 10,
                input_tokens_details: {
                    cached_tokens: 4,
                    cache_write_tokens: 2,
                },
                output_tokens: 5,
                output_tokens_details: { reasoning_tokens: 3 },
                total_tokens: 15,
            },
        });

        const completion = await callAzureResponses(
            [{ role: "user", content: "Weather?" }],
            { model: "gpt-5.6-sol", modelConfig },
        );

        expect(completion).toMatchObject({
            id: "resp_tool",
            object: "chat.completion",
            created: 123,
            choices: [
                {
                    finish_reason: "tool_calls",
                    message: {
                        role: "assistant",
                        content: "Calling.",
                        refusal: null,
                        reasoning_content: "Checked.",
                        tool_calls: [
                            {
                                id: "call_9",
                                type: "function",
                                function: {
                                    name: "weather",
                                    arguments: '{"city":"Paris"}',
                                },
                            },
                        ],
                    },
                },
            ],
            usage: {
                prompt_tokens: 10,
                prompt_tokens_details: {
                    cached_tokens: 4,
                    cache_write_tokens: 2,
                },
                completion_tokens: 5,
                completion_tokens_details: { reasoning_tokens: 3 },
                total_tokens: 15,
            },
        });
    });

    it("maps incomplete responses to OpenAI finish reasons", async () => {
        mockJson({
            status: "incomplete",
            incomplete_details: { reason: "max_output_tokens" },
            output: [{ type: "message", content: [] }],
        });
        const completion = await callAzureResponses(
            [{ role: "user", content: "Write" }],
            { model: "gpt-5.6-sol", modelConfig },
        );
        expect(completion.choices?.[0]?.finish_reason).toBe("length");
    });

    it("emits OpenAI-compatible text, usage, and DONE stream chunks", async () => {
        mockStream([
            'data: {"type":"response.created","response":{"id":"resp_stream","created_at":1234}}\n\n',
            'data: {"type":"response.output_text.delta","delta":"Hello"}\n\n',
            'data: {"type":"response.completed","response":{"status":"completed","output":[{"type":"message"}],"usage":{"input_tokens":3,"input_tokens_details":{"cached_tokens":1,"cache_write_tokens":0},"output_tokens":2,"output_tokens_details":{"reasoning_tokens":0},"total_tokens":5}}}\n\n',
        ]);
        const completion = await callAzureResponses(
            [{ role: "user", content: "Hi" }],
            {
                model: "gpt-5.6-sol",
                modelConfig,
                stream: true,
                stream_options: { include_usage: true },
            },
        );
        const output = await chunks(completion);

        expect(output[0]).toMatchObject({
            id: "resp_stream",
            object: "chat.completion.chunk",
            created: 1234,
            usage: null,
            choices: [
                {
                    delta: { role: "assistant", content: "" },
                    finish_reason: null,
                },
            ],
        });
        expect(output[1].choices[0].delta).toEqual({ content: "Hello" });
        expect(output[2].choices[0].finish_reason).toBe("stop");
        expect(output[3]).toMatchObject({
            choices: [],
            usage: {
                prompt_tokens: 3,
                prompt_tokens_details: {
                    cached_tokens: 1,
                    cache_write_tokens: 0,
                },
                completion_tokens: 2,
                completion_tokens_details: { reasoning_tokens: 0 },
                total_tokens: 5,
            },
        });
        expect(output[4]).toBe("[DONE]");
    });

    it("streams reasoning and indexed function-call deltas", async () => {
        mockStream([
            'data: {"type":"response.created","response":{"id":"resp_tool","created_at":1}}\n\n',
            'data: {"type":"response.reasoning_summary_text.delta","delta":"Think"}\n\n',
            'data: {"type":"response.output_item.added","item":{"type":"function_call","id":"fc_1","call_id":"call_1","name":"weather"}}\n\n',
            'data: {"type":"response.function_call_arguments.delta","item_id":"fc_1","delta":"{\\"city\\":\\"Paris\\"}"}\n\n',
            'data: {"type":"response.completed","response":{"output":[{"type":"function_call"}]}}\n\n',
        ]);
        const completion = await callAzureResponses(
            [{ role: "user", content: "Weather?" }],
            { model: "gpt-5.6-sol", modelConfig, stream: true },
        );
        const output = await chunks(completion);

        expect(output[1].choices[0].delta).toEqual({
            reasoning_content: "Think",
        });
        expect(output[2].choices[0].delta.tool_calls[0]).toMatchObject({
            index: 0,
            id: "call_1",
            function: { name: "weather", arguments: "" },
        });
        expect(output[3].choices[0].delta.tool_calls[0]).toMatchObject({
            index: 0,
            function: { arguments: '{"city":"Paris"}' },
        });
        expect(output[4].choices[0].finish_reason).toBe("tool_calls");
        expect(output[5]).toBe("[DONE]");
    });

    it("surfaces truncated streams and Azure errors", async () => {
        mockStream([
            'data: {"type":"response.created","response":{"id":"resp_cut"}}\n\n',
            'data: {"type":"response.output_text.delta","delta":"partial"}\n\n',
        ]);
        const streamed = await callAzureResponses(
            [{ role: "user", content: "Hi" }],
            { model: "gpt-5.6-sol", modelConfig, stream: true },
        );
        expect(await chunks(streamed)).toContainEqual({
            error: {
                message: "Stream ended unexpectedly before completion.",
            },
        });

        mockJson({ error: { message: "bad request" } }, 400);
        await expect(
            callAzureResponses([{ role: "user", content: "Hi" }], {
                model: "gpt-5.6-sol",
                modelConfig,
            }),
        ).rejects.toMatchObject({ status: 400, upstreamStatus: 400 });

        await expect(
            callAzureResponses([{ role: "user", content: "Hi" }], {
                model: "gpt-5.6-sol",
                modelConfig: {
                    ...modelConfig,
                    "azure-api-key": undefined,
                },
            }),
        ).rejects.toThrow("AZURE_MYCELI_PROD_API_KEY is not configured");
    });
});
