import { createExecutionContext, env } from "cloudflare:test";
import { signAgentRunToken } from "@shared/auth/agent-run-token.ts";
import * as schema from "@shared/db/better-auth.ts";
import {
    createTestApiKey,
    createTestUser,
} from "@shared/test/fixtures/index.ts";
import { drizzle } from "drizzle-orm/d1";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { agentRuntimeRoutes } from "../src/routes/agent-runtime.ts";
import { PromptAgentSchema } from "../src/services/prompt-agent.ts";
import {
    handlePromptAgentRequest,
    type PromptAgentRequest,
} from "../src/services/prompt-agent-runtime.ts";

type PromptAgentRuntime = Parameters<typeof handlePromptAgentRequest>[2];

const BASE_RUNTIME: PromptAgentRuntime = {
    config: {
        systemPrompt: "You are a test agent.",
        baseModel: "openai",
        pollinationsTools: false,
        mcpServers: [],
    },
    mcpHeaders: {},
    apiKey: "sk_test",
    genBaseUrl: "https://gen.test.example",
    pollinationsMcpUrl: "https://mcp.pollinations.test/",
};

async function agentRunToken(parentApiKeyId: string, managedAgentId: string) {
    return signAgentRunToken({
        secret: env.BETTER_AUTH_SECRET,
        parentApiKeyId,
        managedAgentId,
        runId: crypto.randomUUID(),
    });
}

async function runAgent(
    body: PromptAgentRequest,
    runtime: PromptAgentRuntime = BASE_RUNTIME,
): Promise<Response> {
    return await handlePromptAgentRequest(
        body,
        new AbortController().signal,
        runtime,
    );
}

describe("prompt-agent config", () => {
    const config = {
        systemPrompt: "You are a test agent.",
        baseModel: "openai",
        pollinationsTools: false,
    };

    it("accepts public HTTPS MCP servers", () => {
        expect(
            PromptAgentSchema.parse({
                ...config,
                mcpServers: [
                    { name: "docs", url: "https://mcp.example.com/rpc/" },
                ],
            }).mcpServers,
        ).toEqual([
            {
                name: "docs",
                url: "https://mcp.example.com/rpc",
                headers: [],
            },
        ]);
    });

    it("rejects plaintext and private-host MCP servers", () => {
        for (const url of [
            "http://mcp.example.com/rpc",
            "https://localhost/rpc",
            "https://127.0.0.1/rpc",
        ]) {
            expect(
                PromptAgentSchema.safeParse({
                    ...config,
                    mcpServers: [{ name: "docs", url }],
                }).success,
            ).toBe(false);
        }
    });

    it("rejects duplicate MCP server names", () => {
        expect(
            PromptAgentSchema.safeParse({
                ...config,
                mcpServers: [
                    { name: "docs", url: "https://one.example.com/mcp" },
                    { name: "docs", url: "https://two.example.com/mcp" },
                ],
            }).success,
        ).toBe(false);
        expect(
            PromptAgentSchema.safeParse({
                ...config,
                pollinationsTools: true,
                mcpServers: [
                    {
                        name: "pollinations",
                        url: "https://example.com/mcp",
                    },
                ],
            }).success,
        ).toBe(false);
    });
});

describe("prompt-agent runtime", () => {
    beforeEach(() => {
        vi.unstubAllGlobals();
    });

    it("rejects calls without an agent run token", async () => {
        const response = await agentRuntimeRoutes.fetch(
            new Request("https://enter.example/v1/chat/completions", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ model: crypto.randomUUID() }),
            }),
            env,
            createExecutionContext(),
        );
        expect(response.status).toBe(401);
    });

    it("selects agents by the request model", async () => {
        const agentId = crypto.randomUUID();
        const parent = await createTestApiKey();
        const token = await agentRunToken(parent.id, agentId);
        const response = await agentRuntimeRoutes.fetch(
            new Request("https://enter.example/v1/chat/completions", {
                method: "POST",
                headers: {
                    "content-type": "application/json",
                    authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ model: agentId }),
            }),
            env,
            createExecutionContext(),
        );
        expect(response.status).toBe(404);
    });

    it("uses the caller's run token for the selected agent", async () => {
        const db = drizzle(env.DB, { schema });
        const agentId = crypto.randomUUID();
        const parent = await createTestApiKey();
        const token = await agentRunToken(parent.id, agentId);
        await db.insert(schema.agent).values({
            id: agentId,
            ownerUserId: await createTestUser(),
            config: JSON.stringify({
                systemPrompt: "Answer briefly.",
                baseModel: "openai-fast",
                pollinationsTools: false,
                mcpServers: [],
            }),
            createdAt: new Date(),
            updatedAt: new Date(),
        });
        vi.stubGlobal(
            "fetch",
            vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
                const request = new Request(input, init);
                expect(request.url).toBe(
                    "https://gen.test/v1/chat/completions",
                );
                expect(request.headers.get("Authorization")).toBe(
                    `Bearer ${token}`,
                );
                return Response.json({
                    choices: [
                        { message: { role: "assistant", content: "done" } },
                    ],
                    usage: { prompt_tokens: 1, completion_tokens: 1 },
                });
            }),
        );

        const response = await agentRuntimeRoutes.fetch(
            new Request("https://enter.test/v1/chat/completions", {
                method: "POST",
                headers: {
                    "content-type": "application/json",
                    authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    model: agentId,
                    messages: [{ role: "user", content: "hello" }],
                }),
            }),
            { ...env, GEN_BASE_URL: "https://gen.test" },
            createExecutionContext(),
        );
        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toMatchObject({
            model: "openai-fast",
            choices: [{ message: { content: "done" } }],
        });
    });

    it("rejects a run token bound to another agent", async () => {
        const parent = await createTestApiKey();
        const token = await agentRunToken(parent.id, crypto.randomUUID());
        const response = await agentRuntimeRoutes.fetch(
            new Request("https://enter.test/v1/chat/completions", {
                method: "POST",
                headers: {
                    "content-type": "application/json",
                    authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ model: crypto.randomUUID() }),
            }),
            env,
            createExecutionContext(),
        );
        expect(response.status).toBe(403);
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
        await expect(response.json()).resolves.toEqual({
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
                if (url.hostname === "mcp.example.com") {
                    mcpRequests.push(request.clone());
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
                                        name: "lookup",
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
                                                name: "mcp__docs__lookup",
                                                arguments: "{}",
                                            },
                                        },
                                    ],
                                },
                            },
                        ],
                        usage: { prompt_tokens: 10, completion_tokens: 5 },
                    });
                }
                return Response.json({
                    choices: [
                        { message: { role: "assistant", content: "done" } },
                    ],
                    usage: { prompt_tokens: 4, completion_tokens: 2 },
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
                    mcpServers: [
                        {
                            name: "docs",
                            url: "https://mcp.example.com/rpc",
                            headers: ["Authorization", "X-Tenant"],
                        },
                    ],
                },
                mcpHeaders: {
                    docs: {
                        Authorization: "Bearer mcp-secret",
                        "X-Tenant": "pollinations",
                    },
                },
            },
        );

        const responseText = await res.text();
        expect(res.status, responseText).toBe(200);
        const json = JSON.parse(responseText) as {
            choices: { message: { content: string }; finish_reason: string }[];
            usage: {
                prompt_tokens: number;
                tool_call_counts: Record<string, number>;
            };
        };
        expect(json.choices[0].message.content).toBe("checking done");
        expect(json.choices[0].finish_reason).toBe("stop");
        expect(json.usage.tool_call_counts).toEqual({ mcp_call: 1 });
        // Usage from both model rounds is summed into the total.
        expect(json.usage.prompt_tokens).toBe(14);
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
                "Bearer mcp-secret",
            );
            expect(request.headers.get("X-Tenant")).toBe("pollinations");
        }
    });

    it("passes the caller token only to the built-in Pollinations MCP", async () => {
        const mcpRequests: Request[] = [];
        vi.stubGlobal(
            "fetch",
            vi.fn(async function (
                this: unknown,
                input: RequestInfo | URL,
                init?: RequestInit,
            ) {
                const request = new Request(input, init);
                if (request.url === BASE_RUNTIME.pollinationsMcpUrl) {
                    expect(this).toBe(globalThis);
                    mcpRequests.push(request.clone());
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
                ]);
                return Response.json({
                    choices: [
                        { message: { role: "assistant", content: "done" } },
                    ],
                    usage: { prompt_tokens: 1, completion_tokens: 1 },
                });
            }),
        );

        const response = await runAgent(
            { messages: [{ role: "user", content: "draw a bee" }] },
            {
                ...BASE_RUNTIME,
                config: {
                    ...BASE_RUNTIME.config,
                    pollinationsTools: true,
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

    it.each([false, true])(
        "returns generated image links when stream:%s",
        async (stream) => {
            let modelCalls = 0;
            const modelResponse = (
                message: Record<string, unknown>,
                finishReason: "stop" | "tool_calls",
            ) => {
                const usage = { prompt_tokens: 2, completion_tokens: 1 };
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
                    if (request.url === BASE_RUNTIME.pollinationsMcpUrl) {
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
                            response_format: "url",
                        });
                        return Response.json({
                            jsonrpc: "2.0",
                            id: body.id,
                            result: {
                                content: [
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
                    }
                    if (modelCalls === 1) {
                        return modelResponse(
                            {
                                role: "assistant",
                                content: "Drawing",
                                tool_calls: [
                                    {
                                        index: 0,
                                        id: "c1",
                                        type: "function",
                                        function: {
                                            name: "mcp__pollinations__generateImage",
                                            arguments:
                                                '{"prompt":"a pirate","response_format":"b64_json"}',
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
                        pollinationsTools: true,
                    },
                },
            );
            expect(response.status).toBe(200);

            let content: string;
            if (stream) {
                content = (await response.text())
                    .split("\n\n")
                    .filter((block) => block.startsWith("data: {"))
                    .map((block) => JSON.parse(block.slice(6)))
                    .map((event) => event.choices?.[0]?.delta?.content ?? "")
                    .join("");
            } else {
                const json = (await response.json()) as {
                    choices: { message: { content: string } }[];
                };
                content = json.choices[0].message.content;
            }
            expect(content).toBe(
                "Drawing\n\n" +
                    "![Generated image](<https://images.example/pirate.png>)\n\n" +
                    "Finished",
            );
        },
    );

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
        const events = text
            .split("\n\n")
            .map((block) => block.replace(/^data: /, "").trim())
            .filter((line) => line.length > 0);
        expect(events.at(-1)).toBe("[DONE]");
        const dataEvents = events
            .filter((e) => e !== "[DONE]")
            .map((e) => JSON.parse(e));
        expect(dataEvents.find((event) => event.error)).toBeUndefined();
        const contentEvents = dataEvents.filter(
            (event) => event.choices[0].delta.content,
        );
        expect(contentEvents).toHaveLength(2);
        expect(
            contentEvents
                .map((event) => event.choices[0].delta.content)
                .join(""),
        ).toBe("hello world");
        const finalChunk = dataEvents.at(-1);
        expect(finalChunk.choices[0].finish_reason).toBe("stop");
        expect(finalChunk.usage.tool_call_counts).toEqual({});
        expect(finalChunk.usage.prompt_tokens).toBe(6);
    });

    it("streams base-model errors as SSE", async () => {
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
        expect(await response.text()).toBe(
            'data: {"error":{"message":"Insufficient balance"}}\n\n' +
                "data: [DONE]\n\n",
        );
    });

    it("feeds a failing tool's error back to the model instead of 502", async () => {
        let modelCalls = 0;
        const fetchMock = vi.fn(
            async (input: RequestInfo | URL, init?: RequestInit) => {
                const request = new Request(input, init);
                const url = new URL(request.url);
                if (url.hostname === "mcp.example.com") {
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
                                        name: "lookup",
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
                                                name: "mcp__docs__lookup",
                                                arguments: "{}",
                                            },
                                        },
                                    ],
                                },
                            },
                        ],
                        usage: { prompt_tokens: 3, completion_tokens: 1 },
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
                    usage: { prompt_tokens: 2, completion_tokens: 2 },
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
                    mcpServers: [
                        {
                            name: "docs",
                            url: "https://mcp.example.com/rpc",
                            headers: [],
                        },
                    ],
                },
            },
        );
        // A tool failure does not fail the request.
        const responseText = await res.text();
        expect(res.status, responseText).toBe(200);
        const json = JSON.parse(responseText) as {
            choices: { message: { content: string } }[];
            usage: { tool_call_counts: Record<string, number> };
        };
        expect(json.choices[0].message.content).toBe("sorry, lookup failed");
        // The (failed) tool call is still counted — the owner's tool ran.
        expect(json.usage.tool_call_counts).toEqual({ mcp_call: 1 });
    });
});
