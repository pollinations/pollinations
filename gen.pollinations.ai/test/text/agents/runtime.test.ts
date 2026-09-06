import OpenAI from "openai";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
    handlePromptAgentResponsesRequest,
    PromptAgentResponsesRequestSchema,
} from "../../../src/text/agents/responses.ts";
import type { PromptAgentRuntime } from "../../../src/text/agents/runtime.ts";
import {
    responsesToChatCompletion,
    responsesToChatStream,
} from "../../../src/text/responses/chatResponse.ts";

type PromptAgentRequest = {
    messages?: unknown[];
    stream?: boolean;
};

const BASE_RUNTIME: PromptAgentRuntime = {
    config: {
        systemPrompt: "You are a test agent.",
        baseModel: "openai",
        mcpServers: [],
    },
    apiKey: "sk_test",
    genBaseUrl: "https://gen.test.example",
    fetcher: (input, init) => globalThis.fetch(input, init),
};
const POLLINATIONS_MCP_PROXY_URL = `${BASE_RUNTIME.genBaseUrl}/mcp/pollinations`;
const EXA_MCP_PROXY_URL = `${BASE_RUNTIME.genBaseUrl}/mcp/exa`;

async function runAgent(
    body: PromptAgentRequest,
    runtime: PromptAgentRuntime = BASE_RUNTIME,
): Promise<Response> {
    return handlePromptAgentResponsesRequest(
        PromptAgentResponsesRequestSchema.parse({
            model: "00000000-0000-4000-8000-000000000001",
            input: body.messages ?? [],
            stream: body.stream ?? false,
        }),
        new AbortController().signal,
        runtime,
    );
}

function responseOutputText(body: unknown): string {
    return (
        body as {
            output: { type: string; content?: { text: string }[] }[];
        }
    ).output
        .filter((item) => item.type === "message")
        .flatMap((item) => item.content ?? [])
        .map((part) => part.text)
        .join("");
}

function chatOutputText(body: unknown): string {
    const completion = responsesToChatCompletion(
        body,
        "test-agent",
        new URL("https://gen.test/v1/responses"),
    );
    const content = completion.choices?.[0]?.message?.content;
    if (typeof content !== "string") throw new Error("Missing Chat content");
    return content;
}

function responseStreamEvents(body: string): Record<string, unknown>[] {
    return body
        .split("\n\n")
        .map((block) =>
            block.split("\n").find((line) => line.startsWith("data: ")),
        )
        .filter(
            (line): line is string => Boolean(line) && line !== "data: [DONE]",
        )
        .map((line) => JSON.parse(line.slice(6)) as Record<string, unknown>);
}

describe("prompt-agent runtime", () => {
    beforeEach(() => {
        vi.unstubAllGlobals();
    });

    it("propagates base-model HTTP errors", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () =>
                Response.json(
                    { error: { message: "Insufficient balance" } },
                    { status: 402 },
                ),
            ),
        );

        const response = await runAgent({
            messages: [{ role: "user", content: "hello" }],
        });

        expect(response.status).toBe(402);
        await expect(response.json()).resolves.toMatchObject({
            error: { message: "Insufficient balance" },
        });
    });

    it("runs the MCP tool loop and reuses the negotiated session", async () => {
        const mcpRequests: Request[] = [];
        let modelCalls = 0;
        const fetchMock = vi.fn(
            async (input: RequestInfo | URL, init?: RequestInit) => {
                const request = new Request(input, init);
                const url = new URL(request.url);
                if (request.url === EXA_MCP_PROXY_URL) {
                    mcpRequests.push(request.clone() as unknown as Request);
                    if (request.method === "GET") {
                        return new Response(null, { status: 405 });
                    }
                    if (request.method === "DELETE") {
                        return new Response(null, { status: 200 });
                    }
                    const body = (await request.json()) as {
                        id?: string;
                        method: string;
                    };
                    if (body.method === "initialize") {
                        return Response.json(
                            {
                                jsonrpc: "2.0",
                                id: body.id,
                                result: {
                                    protocolVersion: "2025-06-18",
                                    capabilities: { tools: {} },
                                    serverInfo: {
                                        name: "test-mcp",
                                        version: "1.0.0",
                                    },
                                },
                            },
                            { headers: { "Mcp-Session-Id": "session-1" } },
                        );
                    }
                    if (body.method === "notifications/initialized") {
                        return new Response(null, { status: 202 });
                    }
                    if (body.method === "tools/list") {
                        return Response.json({
                            jsonrpc: "2.0",
                            id: body.id,
                            result: {
                                tools: [
                                    {
                                        name: "listModels",
                                        inputSchema: { type: "object" },
                                    },
                                ],
                            },
                        });
                    }
                    return Response.json({
                        jsonrpc: "2.0",
                        id: body.id,
                        result: { content: [{ type: "text", text: "found" }] },
                    });
                }

                modelCalls++;
                // Base-model calls go to the injected gateway (the minted key
                // is only valid there), never the hardcoded production origin.
                expect(url.origin).toBe("https://gen.test.example");
                if (modelCalls === 1) {
                    return Response.json({
                        choices: [
                            {
                                message: {
                                    role: "assistant",
                                    content: "checking ",
                                    tool_calls: [
                                        {
                                            id: "c1",
                                            function: {
                                                name: "mcp__exa__listModels",
                                                arguments: "{}",
                                            },
                                        },
                                    ],
                                },
                            },
                        ],
                        usage: {
                            prompt_tokens: 10,
                            completion_tokens: 5,
                            total_tokens: 15,
                        },
                    });
                }
                return Response.json({
                    choices: [
                        { message: { role: "assistant", content: "done" } },
                    ],
                    usage: {
                        prompt_tokens: 4,
                        completion_tokens: 2,
                        total_tokens: 6,
                    },
                });
            },
        );
        vi.stubGlobal("fetch", fetchMock);

        const res = await runAgent(
            { messages: [{ role: "user", content: "hi" }] },
            {
                ...BASE_RUNTIME,
                config: {
                    ...BASE_RUNTIME.config,
                    mcpServers: ["exa"],
                },
            },
        );

        const responseText = await res.text();
        expect(res.status, responseText).toBe(200);
        const json = JSON.parse(responseText) as {
            output: { type: string; content: { text: string }[] }[];
            status: string;
            usage: {
                input_tokens: number;
                tool_call_counts: Record<string, number>;
            };
        };
        expect(responseOutputText(json)).toBe("checking done");
        expect(json.output.map((item) => item.type)).toEqual([
            "message",
            "mcp_call",
            "message",
        ]);
        expect(json.output[1]).toMatchObject({
            id: "c1",
            type: "mcp_call",
            server_label: "exa",
            name: "listModels",
            arguments: "{}",
            status: "completed",
            output: JSON.stringify({
                content: [{ type: "text", text: "found" }],
            }),
            error: null,
        });
        expect(chatOutputText(json)).toBe(
            "checking \n\n" +
                '<details type="tool_calls" done="true" id="c1" name="listModels" arguments="{}">\n' +
                "<summary>Tool Executed</summary>\n" +
                "found\n" +
                "</details>\n\n" +
                "done",
        );
        expect(json.status).toBe("completed");
        expect(json.usage.tool_call_counts).toEqual({ mcp_call: 1 });
        // Usage from both model rounds is summed into the total.
        expect(json.usage.input_tokens).toBe(14);
        const mcpPosts = mcpRequests.filter(
            (request) => request.method === "POST",
        );
        const bodies = await Promise.all(
            mcpPosts.map(
                (request) =>
                    request.json() as Promise<{
                        id?: number;
                        method: string;
                    }>,
            ),
        );
        expect(bodies.map((body) => body.method)).toEqual([
            "initialize",
            "notifications/initialized",
            "tools/list",
            "tools/call",
        ]);
        expect(bodies[1].id).toBeUndefined();
        expect(bodies.filter((body) => body.id !== undefined).length).toBe(3);
        expect(mcpPosts[0].headers.get("Mcp-Session-Id")).toBeNull();
        for (const request of mcpPosts.slice(1)) {
            expect(request.headers.get("Mcp-Session-Id")).toBe("session-1");
            expect(request.headers.get("MCP-Protocol-Version")).toBe(
                "2025-06-18",
            );
        }
        for (const request of mcpRequests) {
            expect(request.headers.get("Authorization")).toBe(
                `Bearer ${BASE_RUNTIME.apiKey}`,
            );
        }
    });

    it("limits the number of MCP tool executions per request", async () => {
        let modelCalls = 0;
        let mcpToolCalls = 0;
        vi.stubGlobal(
            "fetch",
            vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
                const request = new Request(input, init);
                if (request.url === POLLINATIONS_MCP_PROXY_URL) {
                    if (request.method === "DELETE") {
                        return new Response(null, { status: 200 });
                    }
                    const body = (await request.json()) as {
                        id?: string;
                        method: string;
                    };
                    if (body.method === "initialize") {
                        return Response.json({
                            jsonrpc: "2.0",
                            id: body.id,
                            result: {
                                protocolVersion: "2025-06-18",
                                capabilities: { tools: {} },
                                serverInfo: { name: "test", version: "1" },
                            },
                        });
                    }
                    if (body.method === "notifications/initialized") {
                        return new Response(null, { status: 202 });
                    }
                    if (body.method === "tools/list") {
                        return Response.json({
                            jsonrpc: "2.0",
                            id: body.id,
                            result: {
                                tools: [
                                    {
                                        name: "listModels",
                                        inputSchema: { type: "object" },
                                    },
                                ],
                            },
                        });
                    }
                    mcpToolCalls += 1;
                    return Response.json({
                        jsonrpc: "2.0",
                        id: body.id,
                        result: {
                            content: [{ type: "text", text: "found" }],
                        },
                    });
                }

                modelCalls += 1;
                if (modelCalls === 1) {
                    return Response.json({
                        choices: [
                            {
                                message: {
                                    role: "assistant",
                                    content: "",
                                    tool_calls: Array.from(
                                        { length: 17 },
                                        (_, index) => ({
                                            id: `call-${index}`,
                                            type: "function",
                                            function: {
                                                name: "mcp__pollinations__listModels",
                                                arguments: "{}",
                                            },
                                        }),
                                    ),
                                },
                                finish_reason: "tool_calls",
                            },
                        ],
                        usage: {
                            prompt_tokens: 1,
                            completion_tokens: 1,
                            total_tokens: 2,
                        },
                    });
                }
                return Response.json({
                    choices: [
                        { message: { role: "assistant", content: "done" } },
                    ],
                    usage: {
                        prompt_tokens: 1,
                        completion_tokens: 1,
                        total_tokens: 2,
                    },
                });
            }),
        );

        const response = await runAgent(
            { messages: [{ role: "user", content: "look up everything" }] },
            {
                ...BASE_RUNTIME,
                config: {
                    ...BASE_RUNTIME.config,
                    mcpServers: ["pollinations"],
                },
            },
        );
        const body = (await response.json()) as {
            usage: { tool_call_counts: { mcp_call: number } };
        };
        expect(response.status).toBe(200);
        expect(mcpToolCalls).toBe(16);
        expect(body.usage.tool_call_counts.mcp_call).toBe(16);
    });

    it("keeps running when the Pollinations MCP fails to load", async () => {
        let modelCalls = 0;
        vi.stubGlobal(
            "fetch",
            vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
                const request = new Request(input, init);
                if (request.url === POLLINATIONS_MCP_PROXY_URL) {
                    return new Response("Method Not Allowed", { status: 405 });
                }
                modelCalls++;
                return Response.json({
                    choices: [
                        {
                            message: {
                                role: "assistant",
                                content: "still here",
                            },
                        },
                    ],
                    usage: {
                        prompt_tokens: 3,
                        completion_tokens: 2,
                        total_tokens: 5,
                    },
                });
            }),
        );

        const res = await runAgent(
            { messages: [{ role: "user", content: "hi" }] },
            {
                ...BASE_RUNTIME,
                config: {
                    ...BASE_RUNTIME.config,
                    mcpServers: ["pollinations"],
                },
            },
        );

        const text = await res.text();
        expect(res.status, text).toBe(200);
        expect(modelCalls).toBeGreaterThan(0);
        expect(responseOutputText(JSON.parse(text))).toBe("still here");
    });

    it("passes the caller token and exposes the Pollinations MCP tools", async () => {
        const mcpRequests: Request[] = [];
        vi.stubGlobal(
            "fetch",
            vi.fn(async function (
                this: unknown,
                input: RequestInfo | URL,
                init?: RequestInit,
            ) {
                const request = new Request(input, init);
                if (request.url === POLLINATIONS_MCP_PROXY_URL) {
                    expect(this).toBe(globalThis);
                    mcpRequests.push(request.clone() as unknown as Request);
                    const body = (await request.json()) as {
                        id?: string;
                        method: string;
                    };
                    if (body.method === "initialize") {
                        return Response.json({
                            jsonrpc: "2.0",
                            id: body.id,
                            result: {
                                protocolVersion: "2025-06-18",
                                capabilities: { tools: {} },
                                serverInfo: {
                                    name: "pollinations",
                                    version: "1.0.0",
                                },
                            },
                        });
                    }
                    if (body.method === "notifications/initialized") {
                        return new Response(null, { status: 202 });
                    }
                    return Response.json({
                        jsonrpc: "2.0",
                        id: body.id,
                        result: {
                            tools: [
                                {
                                    name: "generateImage",
                                    inputSchema: { type: "object" },
                                },
                                {
                                    name: "getBalance",
                                    inputSchema: { type: "object" },
                                },
                                {
                                    name: "getUsage",
                                    inputSchema: { type: "object" },
                                },
                            ],
                        },
                    });
                }

                const body = (await request.json()) as {
                    tools: { function: { name: string } }[];
                };
                expect(body.tools.map((tool) => tool.function.name)).toEqual([
                    "mcp__pollinations__generateImage",
                    "mcp__pollinations__getBalance",
                    "mcp__pollinations__getUsage",
                ]);
                return Response.json({
                    choices: [
                        { message: { role: "assistant", content: "done" } },
                    ],
                    usage: {
                        prompt_tokens: 1,
                        completion_tokens: 1,
                        total_tokens: 2,
                    },
                });
            }),
        );

        const response = await runAgent(
            { messages: [{ role: "user", content: "draw a bee" }] },
            {
                ...BASE_RUNTIME,
                config: {
                    ...BASE_RUNTIME.config,
                    mcpServers: ["pollinations"],
                },
            },
        );

        expect(response.status).toBe(200);
        expect(mcpRequests.length).toBeGreaterThan(0);
        for (const request of mcpRequests) {
            expect(request.headers.get("Authorization")).toBe(
                `Bearer ${BASE_RUNTIME.apiKey}`,
            );
        }
    });

    it.each([
        false,
        true,
    ])("returns generated image links when stream:%s", async (stream) => {
        let modelCalls = 0;
        const modelResponse = (
            message: Record<string, unknown>,
            finishReason: "stop" | "tool_calls",
        ) => {
            const usage = {
                prompt_tokens: 2,
                completion_tokens: 1,
                total_tokens: 3,
            };
            if (!stream) {
                return Response.json({
                    choices: [
                        {
                            message,
                            finish_reason: finishReason,
                        },
                    ],
                    usage,
                });
            }
            return new Response(
                `${[
                    {
                        choices: [
                            {
                                index: 0,
                                delta: message,
                                finish_reason: null,
                            },
                        ],
                    },
                    {
                        choices: [
                            {
                                index: 0,
                                delta: {},
                                finish_reason: finishReason,
                            },
                        ],
                        usage,
                    },
                ]
                    .map((event) => `data: ${JSON.stringify(event)}\n\n`)
                    .join("")}data: [DONE]\n\n`,
                { headers: { "content-type": "text/event-stream" } },
            );
        };
        vi.stubGlobal(
            "fetch",
            vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
                const request = new Request(input, init);
                if (request.url === POLLINATIONS_MCP_PROXY_URL) {
                    if (request.method === "GET") {
                        return new Response(null, { status: 405 });
                    }
                    if (request.method === "DELETE") {
                        return new Response(null, { status: 200 });
                    }
                    const body = (await request.json()) as {
                        id?: string;
                        method: string;
                        params?: {
                            arguments?: Record<string, unknown>;
                        };
                    };
                    if (body.method === "initialize") {
                        return Response.json({
                            jsonrpc: "2.0",
                            id: body.id,
                            result: {
                                protocolVersion: "2025-06-18",
                                capabilities: { tools: {} },
                                serverInfo: {
                                    name: "pollinations",
                                    version: "1.0.0",
                                },
                            },
                        });
                    }
                    if (body.method === "notifications/initialized") {
                        return new Response(null, { status: 202 });
                    }
                    if (body.method === "tools/list") {
                        return Response.json({
                            jsonrpc: "2.0",
                            id: body.id,
                            result: {
                                tools: [
                                    {
                                        name: "generateImage",
                                        inputSchema: { type: "object" },
                                    },
                                ],
                            },
                        });
                    }
                    expect(body.params?.arguments).toMatchObject({
                        prompt: "a pirate",
                    });
                    return Response.json({
                        jsonrpc: "2.0",
                        id: body.id,
                        result: {
                            content: [
                                {
                                    type: "image",
                                    data: "U0hPVUxEX05PVF9SRUFDSF9NT0RFTA==",
                                    mimeType: "image/png",
                                },
                                {
                                    type: "resource_link",
                                    uri: "https://images.example/pirate.png",
                                    name: "Generated image",
                                },
                                {
                                    type: "text",
                                    text: '{"data":[{"url":"https://images.example/pirate.png"}]}',
                                },
                            ],
                        },
                    });
                }

                modelCalls++;
                const body = (await request.json()) as {
                    messages: { role: string; content: string }[];
                };
                if (modelCalls === 2) {
                    const toolMessage = body.messages.find(
                        (message) => message.role === "tool",
                    );
                    expect(toolMessage?.content).toContain(
                        "https://images.example/pirate.png",
                    );
                    expect(JSON.stringify(toolMessage)).not.toContain(
                        "U0hPVUxEX05PVF9SRUFDSF9NT0RFTA==",
                    );
                }
                if (modelCalls === 1) {
                    return modelResponse(
                        {
                            role: "assistant",
                            content: "",
                            tool_calls: [
                                {
                                    index: 0,
                                    id: "c1",
                                    type: "function",
                                    function: {
                                        name: "mcp__pollinations__generateImage",
                                        arguments: '{"prompt":"a pirate"}',
                                    },
                                },
                            ],
                        },
                        "tool_calls",
                    );
                }
                return modelResponse(
                    {
                        role: "assistant",
                        content: "Finished",
                    },
                    "stop",
                );
            }),
        );

        const response = await runAgent(
            {
                messages: [{ role: "user", content: "draw a pirate" }],
                stream,
            },
            {
                ...BASE_RUNTIME,
                config: {
                    ...BASE_RUNTIME.config,
                    mcpServers: ["pollinations"],
                },
            },
        );
        expect(response.status).toBe(200);

        let content: string;
        let body: unknown;
        if (stream) {
            const sdkResponse = response.clone();
            const sdk = new OpenAI({
                apiKey: "test",
                fetch: async () => sdkResponse,
            });
            const aggregated = sdk.responses
                .stream({
                    model: "test-agent",
                    input: "draw a pirate",
                    store: false,
                })
                .finalResponse();
            const source = response.clone().body;
            if (!source) throw new Error("Missing response stream");
            const chatStream = responsesToChatStream(source, "test-agent");
            const events = responseStreamEvents(await response.text());
            expect(events.map((event) => event.sequence_number)).toEqual(
                events.map((_, index) => index),
            );
            expect(events.map((event) => event.type)).toEqual([
                "response.created",
                "response.output_item.added",
                "response.mcp_call.in_progress",
                "response.mcp_call_arguments.done",
                "response.mcp_call.completed",
                "response.output_item.done",
                "response.output_item.added",
                "response.content_part.added",
                "response.output_text.delta",
                "response.output_text.done",
                "response.content_part.done",
                "response.output_item.done",
                "response.completed",
            ]);
            body = events.at(-1)?.response;
            expect((await aggregated).output).toMatchObject(
                (body as { output: unknown[] }).output,
            );
            const chunks = responseStreamEvents(
                await new Response(chatStream).text(),
            );
            content = chunks
                .map((chunk) => {
                    const choices = chunk.choices as {
                        delta: { content?: string };
                    }[];
                    return choices?.[0]?.delta.content ?? "";
                })
                .join("");
        } else {
            body = await response.json();
            content = chatOutputText(body);
        }
        expect(responseOutputText(body)).toBe("Finished");
        expect(body).toMatchObject({
            output: [
                {
                    type: "mcp_call",
                    id: "c1",
                    server_label: "pollinations",
                    name: "generateImage",
                    arguments: '{"prompt":"a pirate"}',
                    status: "completed",
                    output: expect.stringContaining(
                        "https://images.example/pirate.png",
                    ),
                    error: null,
                },
                {
                    type: "message",
                    content: [{ type: "output_text", text: "Finished" }],
                },
            ],
        });
        expect(JSON.stringify(body)).not.toContain(
            "U0hPVUxEX05PVF9SRUFDSF9NT0RFTA==",
        );
        expect(content).toContain(
            '<details type="tool_calls" done="true" id="c1" name="generateImage" arguments="{&quot;prompt&quot;:&quot;a pirate&quot;}">',
        );
        expect(content).toContain("[image output omitted");
        expect(content).not.toContain("U0hPVUxEX05PVF9SRUFDSF9NT0RFTA==");
        expect(content).toContain(
            "![Generated image](<https://images.example/pirate.png>)",
        );
        expect(content.startsWith('\n\n<details type="tool_calls"')).toBe(true);
        expect(content.endsWith("Finished")).toBe(true);
    });

    it("streams SSE with usage on the final chunk when stream:true", async () => {
        const upstreamEvents = [
            {
                id: "chatcmpl-upstream",
                object: "chat.completion.chunk",
                created: 0,
                model: "openai",
                choices: [
                    {
                        index: 0,
                        delta: { role: "assistant", content: "hello " },
                        finish_reason: null,
                    },
                ],
            },
            {
                id: "chatcmpl-upstream",
                object: "chat.completion.chunk",
                created: 0,
                model: "openai",
                choices: [
                    {
                        index: 0,
                        delta: { content: "world" },
                        finish_reason: null,
                    },
                ],
            },
            {
                id: "chatcmpl-upstream",
                object: "chat.completion.chunk",
                created: 0,
                model: "openai",
                choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
                usage: {
                    prompt_tokens: 6,
                    completion_tokens: 4,
                    total_tokens: 10,
                },
            },
        ];
        const fetchMock = vi.fn(
            async () =>
                new Response(
                    `${upstreamEvents
                        .map((event) => `data: ${JSON.stringify(event)}\n\n`)
                        .join("")}data: [DONE]\n\n`,
                    { headers: { "content-type": "text/event-stream" } },
                ),
        );
        vi.stubGlobal("fetch", fetchMock);

        const res = await runAgent({
            messages: [{ role: "user", content: "hi" }],
            stream: true,
        });
        expect(res.status).toBe(200);
        expect(res.headers.get("content-type")).toContain("text/event-stream");
        const text = await res.text();
        expect(text.trimEnd().endsWith("data: [DONE]")).toBe(true);
        const dataEvents = responseStreamEvents(text);
        expect(dataEvents.find((event) => event.error)).toBeUndefined();
        const contentEvents = dataEvents.filter(
            (event) => event.type === "response.output_text.delta",
        );
        expect(contentEvents).toHaveLength(2);
        expect(contentEvents.map((event) => event.delta).join("")).toBe(
            "hello world",
        );
        const finalChunk = dataEvents.at(-1);
        expect(finalChunk?.type).toBe("response.completed");
        const completed = finalChunk?.response as {
            usage: {
                input_tokens: number;
                tool_call_counts: Record<string, number>;
            };
        };
        expect(completed.usage.tool_call_counts).toEqual({});
        expect(completed.usage.input_tokens).toBe(6);
    });

    it.each([
        "complete",
        "partial",
        "missing",
    ])("validates %s final usage after provisional streamed usage", async (finalUsage) => {
        const events = [
            {
                choices: [{ index: 0, delta: { content: "Hello" } }],
                usage: {
                    prompt_tokens: 6,
                    ...(finalUsage === "partial"
                        ? { completion_tokens: 0, total_tokens: 6 }
                        : {}),
                },
            },
            ...(finalUsage === "missing"
                ? []
                : [
                      {
                          choices: [
                              { index: 0, delta: {}, finish_reason: "stop" },
                          ],
                          usage:
                              finalUsage === "partial"
                                  ? { prompt_tokens: 6 }
                                  : {
                                        prompt_tokens: 6,
                                        completion_tokens: 4,
                                        total_tokens: 10,
                                    },
                      },
                  ]),
        ];
        const response = await runAgent(
            { messages: [{ role: "user", content: "hi" }], stream: true },
            {
                ...BASE_RUNTIME,
                fetcher: async () =>
                    new Response(
                        `${events
                            .map(
                                (event) => `data: ${JSON.stringify(event)}\n\n`,
                            )
                            .join("")}data: [DONE]\n\n`,
                        { headers: { "content-type": "text/event-stream" } },
                    ),
            },
        );
        const output = responseStreamEvents(await response.text());
        if (finalUsage !== "complete") {
            expect(output.at(-1)).toMatchObject({ type: "response.failed" });
            expect(
                output.some((event) => event.type === "response.completed"),
            ).toBe(false);
            return;
        }
        expect(output.at(-1)).toMatchObject({
            type: "response.completed",
            response: {
                usage: { input_tokens: 6, output_tokens: 4, total_tokens: 10 },
            },
        });
        expect(output.some((event) => event.type === "error")).toBe(false);
    });

    it("streams base-model errors as terminal errors", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () =>
                Response.json(
                    { error: { message: "Insufficient balance" } },
                    { status: 402 },
                ),
            ),
        );

        const response = await runAgent({
            messages: [{ role: "user", content: "hello" }],
            stream: true,
        });

        expect(response.status).toBe(200);
        const sdkResponse = response.clone();
        const sdk = new OpenAI({
            apiKey: "test",
            fetch: async () => sdkResponse,
        });
        await expect(
            sdk.responses
                .stream({ model: "test-agent", input: "hello", store: false })
                .finalResponse(),
        ).rejects.toThrow("Insufficient balance");
        const events = responseStreamEvents(await response.text());
        expect(events.find((event) => event.type === "error")).toMatchObject({
            message: "Insufficient balance",
            code: "agent_error",
            param: null,
        });
    });

    it.each([
        false,
        true,
    ])("reports an empty base-model response when stream:%s", async (stream) => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => {
                if (!stream) {
                    return Response.json({
                        choices: [
                            {
                                message: {
                                    role: "assistant",
                                    content: null,
                                },
                                finish_reason: "stop",
                            },
                        ],
                        usage: {
                            prompt_tokens: 1,
                            completion_tokens: 0,
                            total_tokens: 1,
                        },
                    });
                }
                return new Response(
                    'data: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":1,"completion_tokens":0,"total_tokens":1}}\n\n' +
                        "data: [DONE]\n\n",
                    {
                        headers: {
                            "content-type": "text/event-stream",
                        },
                    },
                );
            }),
        );

        const response = await runAgent({
            messages: [{ role: "user", content: "hello" }],
            stream,
        });

        if (stream) {
            expect(response.status).toBe(200);
            const body = await response.text();
            expect(body).toContain("Agent produced no response");
            expect(body).toContain('"type":"error"');
            expect(body).toContain("data: [DONE]");
            return;
        }
        expect(response.status).toBe(502);
        await expect(response.json()).resolves.toMatchObject({
            error: { message: "Agent produced no response" },
        });
    });

    it.each(
        [false, true].flatMap((stream) =>
            [
                { kind: "unknown tool", name: "search", arguments: "{}" },
                {
                    kind: "malformed arguments",
                    name: "mcp__pollinations__listModels",
                    arguments: "{",
                },
            ].map((attempt) => ({ stream, ...attempt })),
        ),
    )("recovers from $kind with stream=$stream and returns replayable history", async ({
        stream,
        name,
        arguments: toolArguments,
    }) => {
        let modelCalls = 0;
        let toolCalls = 0;
        const fetchMock = vi.fn(
            async (input: RequestInfo | URL, init?: RequestInit) => {
                const request = new Request(input, init);
                if (request.url === POLLINATIONS_MCP_PROXY_URL) {
                    if (request.method === "GET")
                        return new Response(null, { status: 405 });
                    if (request.method === "DELETE")
                        return new Response(null, { status: 200 });
                    const body = (await request.json()) as {
                        id?: string;
                        method: string;
                    };
                    if (body.method === "notifications/initialized")
                        return new Response(null, { status: 202 });
                    if (body.method === "tools/call") {
                        toolCalls++;
                        throw new Error("Invalid tool must not execute");
                    }
                    return Response.json({
                        jsonrpc: "2.0",
                        id: body.id,
                        result:
                            body.method === "initialize"
                                ? {
                                      protocolVersion: "2025-06-18",
                                      capabilities: { tools: {} },
                                      serverInfo: {
                                          name: "test-mcp",
                                          version: "1.0.0",
                                      },
                                  }
                                : {
                                      tools: [
                                          {
                                              name: "listModels",
                                              inputSchema: {
                                                  type: "object",
                                              },
                                          },
                                      ],
                                  },
                    });
                }
                modelCalls++;
                const body = (await request.json()) as {
                    stream?: boolean;
                    messages: { role: string; content?: unknown }[];
                };
                if (modelCalls === 2) {
                    expect(body.messages).toEqual(
                        expect.arrayContaining([
                            expect.objectContaining({
                                role: "tool",
                                content: expect.any(String),
                            }),
                        ]),
                    );
                }
                if (modelCalls === 3) {
                    expect(
                        body.messages.some((item) => item.role === "tool"),
                    ).toBe(false);
                }
                const message = {
                    role: "assistant",
                    content:
                        modelCalls === 1 ? "checking " : "Recovered answer",
                    ...(modelCalls === 1
                        ? {
                              tool_calls: [
                                  {
                                      index: 0,
                                      id: "invalid-call",
                                      type: "function",
                                      function: {
                                          name,
                                          arguments: toolArguments,
                                      },
                                  },
                              ],
                          }
                        : {}),
                };
                const finishReason = modelCalls === 1 ? "tool_calls" : "stop";
                const usage = {
                    prompt_tokens: 3,
                    completion_tokens: 2,
                    total_tokens: 5,
                };
                if (!body.stream) {
                    return Response.json({
                        choices: [{ message, finish_reason: finishReason }],
                        usage,
                    });
                }
                return new Response(
                    `${[
                        {
                            choices: [
                                {
                                    index: 0,
                                    delta: message,
                                    finish_reason: null,
                                },
                            ],
                        },
                        {
                            choices: [
                                {
                                    index: 0,
                                    delta: {},
                                    finish_reason: finishReason,
                                },
                            ],
                            usage,
                        },
                    ]
                        .map((event) => `data: ${JSON.stringify(event)}\n\n`)
                        .join("")}data: [DONE]\n\n`,
                    { headers: { "content-type": "text/event-stream" } },
                );
            },
        );
        vi.stubGlobal("fetch", fetchMock);
        const runtime: PromptAgentRuntime = {
            ...BASE_RUNTIME,
            config: { ...BASE_RUNTIME.config, mcpServers: ["pollinations"] },
        };
        const response = await runAgent(
            { messages: [{ role: "user", content: "look up cats" }], stream },
            runtime,
        );
        expect(response.status).toBe(200);
        let result: {
            output: unknown[];
            usage: { tool_call_counts: Record<string, number> };
        };
        if (stream) {
            const events = responseStreamEvents(await response.text());
            expect(events.some((event) => event.type === "error")).toBe(false);
            expect(
                events.some((event) => event.type === "response.failed"),
            ).toBe(false);
            result = events.find((event) => event.type === "response.completed")
                ?.response as typeof result;
        } else {
            result = await response.json();
        }
        expect(modelCalls).toBe(2);
        expect(toolCalls).toBe(0);
        expect(responseOutputText(result)).toBe("checking Recovered answer");
        expect(result.output).toEqual([
            expect.objectContaining({ type: "message", status: "completed" }),
        ]);
        expect(result.usage.tool_call_counts).toEqual({});
        const replay = await runAgent(
            {
                messages: [
                    ...result.output,
                    { role: "user", content: "Continue" },
                ],
            },
            runtime,
        );
        expect(replay.status).toBe(200);
        expect(responseOutputText(await replay.json())).toBe(
            "Recovered answer",
        );
        expect(modelCalls).toBe(3);
        expect(toolCalls).toBe(0);
    });

    it("feeds a failing tool's error back to the model instead of 502", async () => {
        let modelCalls = 0;
        const fetchMock = vi.fn(
            async (input: RequestInfo | URL, init?: RequestInit) => {
                const request = new Request(input, init);
                if (request.url === POLLINATIONS_MCP_PROXY_URL) {
                    if (request.method === "GET") {
                        return new Response(null, { status: 405 });
                    }
                    if (request.method === "DELETE") {
                        return new Response(null, { status: 200 });
                    }
                    const body = (await request.json()) as {
                        id?: string;
                        method: string;
                    };
                    if (body.method === "initialize") {
                        return Response.json({
                            jsonrpc: "2.0",
                            id: body.id,
                            result: {
                                protocolVersion: "2025-06-18",
                                capabilities: { tools: {} },
                                serverInfo: {
                                    name: "test-mcp",
                                    version: "1.0.0",
                                },
                            },
                        });
                    }
                    if (body.method === "notifications/initialized") {
                        return new Response(null, { status: 202 });
                    }
                    if (body.method === "tools/list") {
                        return Response.json({
                            jsonrpc: "2.0",
                            id: body.id,
                            result: {
                                tools: [
                                    {
                                        name: "listModels",
                                        inputSchema: { type: "object" },
                                    },
                                ],
                            },
                        });
                    }
                    // tools/call fails upstream.
                    return new Response("upstream boom", { status: 500 });
                }

                modelCalls++;
                // First turn: ask for the MCP tool.
                if (modelCalls === 1) {
                    return Response.json({
                        choices: [
                            {
                                message: {
                                    role: "assistant",
                                    content: "",
                                    tool_calls: [
                                        {
                                            id: "c1",
                                            function: {
                                                name: "mcp__pollinations__listModels",
                                                arguments: "{}",
                                            },
                                        },
                                    ],
                                },
                            },
                        ],
                        usage: {
                            prompt_tokens: 3,
                            completion_tokens: 1,
                            total_tokens: 4,
                        },
                    });
                }
                // Next model turn recovers and answers.
                return Response.json({
                    choices: [
                        {
                            message: {
                                role: "assistant",
                                content: "sorry, lookup failed",
                            },
                        },
                    ],
                    usage: {
                        prompt_tokens: 2,
                        completion_tokens: 2,
                        total_tokens: 4,
                    },
                });
            },
        );
        vi.stubGlobal("fetch", fetchMock);

        const res = await runAgent(
            {
                messages: [{ role: "user", content: "look up cats" }],
            },
            {
                ...BASE_RUNTIME,
                config: {
                    ...BASE_RUNTIME.config,
                    mcpServers: ["pollinations"],
                },
            },
        );
        // A tool failure does not fail the request.
        const responseText = await res.text();
        expect(res.status, responseText).toBe(200);
        const json = JSON.parse(responseText) as {
            output: { content: { text: string }[] }[];
            usage: { tool_call_counts: Record<string, number> };
        };
        expect(responseOutputText(json)).toBe("sorry, lookup failed");
        expect(json.output[0]).toMatchObject({
            type: "mcp_call",
            id: "c1",
            status: "failed",
            error: expect.stringContaining("MCP HTTP Transport Error"),
            output: null,
        });
        const content = chatOutputText(json);
        expect(content).toContain(
            '<details type="tool_calls" done="true" id="c1" name="listModels" arguments="{}">',
        );
        expect(content).toContain("<summary>Tool Failed</summary>");
        expect(content).toContain("MCP HTTP Transport Error");
        expect(content.endsWith("sorry, lookup failed")).toBe(true);
        // The (failed) tool call is still counted — the owner's tool ran.
        expect(json.usage.tool_call_counts).toEqual({ mcp_call: 1 });
    });
});
