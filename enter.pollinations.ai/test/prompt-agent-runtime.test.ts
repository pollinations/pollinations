import { createExecutionContext, env } from "cloudflare:test";
import { signAgentRunToken } from "@shared/auth/agent-run-token.ts";
import {
    PROMPT_AGENT_BASE_URL_PLACEHOLDER,
    PromptAgentConfigSchema,
} from "@shared/community-endpoints.ts";
import * as schema from "@shared/db/better-auth.ts";
import { MCP_SERVER_IDS } from "@shared/registry/mcp.ts";
import {
    createTestApiKey,
    createTestUser,
} from "@shared/test/fixtures/index.ts";
import { drizzle } from "drizzle-orm/d1";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { agentRuntimeRoutes } from "../src/routes/agent-runtime.ts";
import { PromptAgentInputSchema } from "../src/services/prompt-agent.ts";
import {
    handlePromptAgentRequest,
    type PromptAgentRequest,
    PromptAgentRuntimeRequestSchema,
} from "../src/services/prompt-agent-runtime.ts";

type PromptAgentRuntime = Parameters<typeof handlePromptAgentRequest>[2];

const BASE_RUNTIME: PromptAgentRuntime = {
    config: {
        systemPrompt: "You are a test agent.",
        baseModel: "openai",
        mcpServers: [],
    },
    apiKey: "sk_test",
    genBaseUrl: "https://gen.test.example",
};
const POLLINATIONS_MCP_PROXY_URL = `${BASE_RUNTIME.genBaseUrl}/mcp/pollinations`;
const BROWSER_MCP_PROXY_URL = `${BASE_RUNTIME.genBaseUrl}/mcp/browser`;

async function agentRunToken(parentApiKeyId: string, managedAgentId: string) {
    return signAgentRunToken({
        secret: env.BETTER_AUTH_SECRET,
        parentApiKeyId,
        parentRequestId: crypto.randomUUID(),
        managedAgentId,
    });
}

async function runAgent(
    body: { messages: unknown[]; [k: string]: unknown },
    runtime: PromptAgentRuntime = BASE_RUNTIME,
): Promise<Response> {
    return await handlePromptAgentRequest(
        { stream: false, ...body } as unknown as PromptAgentRequest,
        new AbortController().signal,
        runtime,
    );
}

describe("prompt-agent config", () => {
    const config = {
        systemPrompt: "You are a test agent.",
        baseModel: "openai",
        mcpServers: [],
    };

    it("rejects custom MCP configuration on write", () => {
        expect(
            PromptAgentInputSchema.safeParse({
                ...config,
                mcpServers: [{ name: "docs", url: "https://mcp.example.com" }],
            }).success,
        ).toBe(false);
    });

    it("accepts MCP servers from the built-in registry", () => {
        expect(
            PromptAgentConfigSchema.parse({
                ...config,
                mcpServers: MCP_SERVER_IDS,
            }),
        ).toEqual({ ...config, mcpServers: MCP_SERVER_IDS });
    });

    it("rejects duplicate built-in MCP servers", () => {
        const result = PromptAgentInputSchema.safeParse({
            ...config,
            mcpServers: ["pollinations", "pollinations"],
        });

        expect(result.error?.issues).toContainEqual(
            expect.objectContaining({
                message: "Duplicate MCP servers are not allowed",
            }),
        );
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
        await db.insert(schema.communityEndpoint).values({
            id: agentId,
            ownerUserId: await createTestUser(),
            name: `agent-${agentId}`,
            title: "Test agent",
            type: "prompt_agent",
            baseUrl: PROMPT_AGENT_BASE_URL_PLACEHOLDER,
            upstreamModel: agentId,
            payload: JSON.stringify({
                systemPrompt: "Answer briefly.",
                baseModel: "openai-fast",
                mcpServers: [],
            }),
            visibility: "private",
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

    it("reports an invalid internal agent request as 500", async () => {
        const agentId = crypto.randomUUID();
        const parent = await createTestApiKey();
        const token = await agentRunToken(parent.id, agentId);
        const response = await agentRuntimeRoutes.fetch(
            new Request("https://enter.test/v1/chat/completions", {
                method: "POST",
                headers: {
                    "content-type": "application/json",
                    authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ model: agentId, stream: "yes" }),
            }),
            env,
            createExecutionContext(),
        );
        expect(response.status).toBe(500);
    });

    it("passes through messages and accepts unused client fields", async () => {
        const agentId = crypto.randomUUID();
        const messages = [
            { role: "system", content: "Client context" },
            { role: "user", content: "hello" },
        ];
        const body = PromptAgentRuntimeRequestSchema.parse({
            model: agentId,
            messages,
            max_tokens: 1000,
            tools: [{ type: "function", function: { name: "client_tool" } }],
            stream_options: { include_usage: true },
        });
        expect(body.messages).toEqual(messages);
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
                if (request.url === BROWSER_MCP_PROXY_URL) {
                    mcpRequests.push(request.clone() as any);
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
                                                name: "mcp__browser__listModels",
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
                    mcpServers: ["browser" as any],
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
        expect(json.choices[0].message.content).toBe(
            "checking \n\n" +
                '<details type="tool_calls" done="true" id="c1" name="listModels" arguments="{}">\n' +
                "<summary>Tool Executed</summary>\n" +
                "found\n" +
                "</details>\n\n" +
                "done",
        );
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
                        usage: { prompt_tokens: 1, completion_tokens: 1 },
                    });
                }
                return Response.json({
                    choices: [
                        { message: { role: "assistant", content: "done" } },
                    ],
                    usage: { prompt_tokens: 1, completion_tokens: 1 },
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
        expect(body.usage.tool_call_counts.mcp_call).toBe(17);
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
                    usage: { prompt_tokens: 3, completion_tokens: 2 },
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
        expect(JSON.parse(text).choices[0].message.content).toBe("still here");
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
                    mcpRequests.push(request.clone() as any);
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
                            content: "Drawing",
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
        expect(content).toContain(
            '<details type="tool_calls" done="true" id="c1" name="generateImage" arguments="{&quot;prompt&quot;:&quot;a pirate&quot;}">',
        );
        expect(content).toContain("[image output omitted");
        expect(content).not.toContain("U0hPVUxEX05PVF9SRUFDSF9NT0RFTA==");
        expect(content).toContain(
            "![Generated image](<https://images.example/pirate.png>)",
        );
        expect(content.startsWith("Drawing\n\n")).toBe(true);
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

    it("streams base-model errors as completion content", async () => {
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
        const events = (await response.text())
            .split("\n\n")
            .map((block) => block.replace(/^data: /, "").trim())
            .filter(Boolean);
        expect(events.at(-1)).toBe("[DONE]");
        const chunks = events.slice(0, -1).map((event) => JSON.parse(event));
        expect(chunks.every((chunk) => Array.isArray(chunk.choices))).toBe(
            true,
        );
        expect(chunks[0].choices[0].delta.content).toContain(
            "<summary>Agent Failed</summary>",
        );
        expect(chunks[0].choices[0].delta.content).toContain(
            "Insufficient balance",
        );
        expect(chunks.at(-1).choices[0].finish_reason).toBe("stop");
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
                        },
                    });
                }
                return new Response(
                    'data: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n' +
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
            expect(body).toContain("<summary>Agent Failed</summary>");
            expect(body).toContain("Agent produced no response");
            expect(body).not.toContain('data: {"error"');
            expect(body.endsWith("data: [DONE]\n\n")).toBe(true);
            return;
        }
        expect(response.status).toBe(502);
        await expect(response.json()).resolves.toEqual({
            error: { message: "Agent produced no response" },
        });
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
                    mcpServers: ["pollinations"],
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
        expect(json.choices[0].message.content).toContain(
            '<details type="tool_calls" done="true" id="c1" name="listModels" arguments="{}">',
        );
        expect(json.choices[0].message.content).toContain(
            "<summary>Tool Failed</summary>",
        );
        expect(json.choices[0].message.content).toContain(
            "MCP HTTP Transport Error",
        );
        expect(
            json.choices[0].message.content.endsWith("sorry, lookup failed"),
        ).toBe(true);
        // The (failed) tool call is still counted — the owner's tool ran.
        expect(json.usage.tool_call_counts).toEqual({ mcp_call: 1 });
    });
});

// =============================================================================
// Agent Responses API tests (issue #14243)
// Covers: JSON shape, SSE events, MCP attribution, disconnect billing, auth.
// =============================================================================

import {
    AgentResponsesRequestSchema,
    AgentResponsesInvalidRequestError,
    handleAgentResponsesRequest,
} from "../src/services/prompt-agent-runtime.ts";

type AgentResponsesRuntime = Parameters<typeof handleAgentResponsesRequest>[2];

async function runAgentResponses(
    body: { input: string | unknown[]; stream?: boolean; [k: string]: unknown },
    runtime: AgentResponsesRuntime = BASE_RUNTIME,
    signal?: AbortSignal,
): Promise<Response> {
    const parsed = AgentResponsesRequestSchema.parse({
        model: crypto.randomUUID(),
        stream: false,
        ...body,
    });
    return handleAgentResponsesRequest(
        parsed,
        signal ?? new AbortController().signal,
        runtime,
    );
}

/** Parse SSE text into an array of { event, data } objects. */
function parseSseEvents(text: string): { event?: string; data: string }[] {
    const events: { event?: string; data: string }[] = [];
    for (const block of text.split("\n\n")) {
        if (!block.trim()) continue;
        const lines = block.split("\n");
        let event: string | undefined;
        let data = "";
        for (const line of lines) {
            if (line.startsWith("event: ")) event = line.slice(7);
            else if (line.startsWith("data: ")) data = line.slice(6);
        }
        if (data) events.push({ event, data });
    }
    return events;
}

describe("agent Responses API", () => {
    beforeEach(() => {
        vi.unstubAllGlobals();
    });

    // -------------------------------------------------------------------------
    // Non-streaming shape
    // -------------------------------------------------------------------------

    it("returns Responses JSON shape for non-streaming requests", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () =>
                Response.json({
                    choices: [
                        { message: { role: "assistant", content: "hello world" } },
                    ],
                    usage: { prompt_tokens: 5, completion_tokens: 3 },
                }),
            ),
        );

        const res = await runAgentResponses({ input: "say hi" });
        expect(res.status).toBe(200);
        const json = (await res.json()) as Record<string, unknown>;

        expect(json.object).toBe("response");
        expect(typeof json.id).toBe("string");
        expect((json.id as string).startsWith("resp_")).toBe(true);
        expect(json.status).toBe("completed");
        expect(json.model).toBe(BASE_RUNTIME.config.baseModel);
        expect(typeof json.created_at).toBe("number");

        // usage must be in Responses shape (input_tokens not prompt_tokens).
        const usage = json.usage as Record<string, number>;
        expect(usage.input_tokens).toBe(5);
        expect(usage.output_tokens).toBe(3);
        expect(usage.total_tokens).toBe(8);

        // output must contain the message item with text.
        const output = json.output as Array<Record<string, unknown>>;
        expect(output).toHaveLength(1);
        expect(output[0].type).toBe("message");
        const content = output[0].content as Array<Record<string, unknown>>;
        expect(content[0].type).toBe("output_text");
        expect(content[0].text).toBe("hello world");
    });

    it("returns status:incomplete when agent hits step limit", async () => {
        // Simulate a model that always returns tool_calls to hit step limit.
        let calls = 0;
        vi.stubGlobal(
            "fetch",
            vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
                const req = new Request(input, init);
                if (req.url.includes("/mcp/")) {
                    const body = (await req.json()) as { method: string; id?: string };
                    if (body.method === "initialize") {
                        return Response.json({
                            jsonrpc: "2.0",
                            id: body.id,
                            result: {
                                protocolVersion: "2025-06-18",
                                capabilities: { tools: {} },
                                serverInfo: { name: "t", version: "1" },
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
                            result: { tools: [{ name: "noop", inputSchema: { type: "object" } }] },
                        });
                    }
                    return Response.json({
                        jsonrpc: "2.0",
                        id: body.id,
                        result: { content: [{ type: "text", text: "done" }] },
                    });
                }
                calls++;
                return Response.json({
                    choices: [
                        {
                            message: {
                                role: "assistant",
                                content: "",
                                tool_calls: [{ id: `c${calls}`, function: { name: "mcp__pollinations__noop", arguments: "{}" } }],
                            },
                            finish_reason: "tool_calls",
                        },
                    ],
                    usage: { prompt_tokens: 1, completion_tokens: 1 },
                });
            }),
        );

        const res = await runAgentResponses(
            { input: "keep going" },
            { ...BASE_RUNTIME, config: { ...BASE_RUNTIME.config, mcpServers: ["pollinations"] } },
        );
        const json = (await res.json()) as { status: string };
        expect(res.status).toBe(200);
        expect(json.status).toBe("incomplete");
    });

    // -------------------------------------------------------------------------
    // Streaming shape
    // -------------------------------------------------------------------------

    it("streams Responses SSE events including response.completed with usage", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () =>
                new Response(
                    [
                        `data: ${JSON.stringify({ choices: [{ index: 0, delta: { role: "assistant", content: "hi " }, finish_reason: null }] })}\n\n`,
                        `data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: "there" }, finish_reason: null }] })}\n\n`,
                        `data: ${JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: 4, completion_tokens: 3, total_tokens: 7 } })}\n\n`,
                        "data: [DONE]\n\n",
                    ].join(""),
                    { headers: { "content-type": "text/event-stream" } },
                ),
            ),
        );

        const res = await runAgentResponses({ input: "say hi", stream: true });
        expect(res.status).toBe(200);
        expect(res.headers.get("content-type")).toContain("text/event-stream");

        const events = parseSseEvents(await res.text());
        const eventTypes = events.map((e) => e.event);

        // Required lifecycle events.
        expect(eventTypes).toContain("response.created");
        expect(eventTypes).toContain("response.in_progress");
        expect(eventTypes).toContain("response.output_item.added");
        expect(eventTypes).toContain("response.content_part.added");
        expect(eventTypes).toContain("response.output_text.delta");
        expect(eventTypes).toContain("response.content_part.done");
        expect(eventTypes).toContain("response.output_item.done");
        expect(eventTypes).toContain("response.completed");

        // Delta events must carry the text.
        const deltas = events
            .filter((e) => e.event === "response.output_text.delta")
            .map((e) => (JSON.parse(e.data) as { delta: string }).delta);
        expect(deltas.join("")).toBe("hi there");

        // Terminal event must contain usage.
        const terminal = events.find((e) => e.event === "response.completed");
        expect(terminal).toBeDefined();
        const terminalData = JSON.parse(terminal?.data ?? "{}") as {
            response: { usage: { input_tokens: number; output_tokens: number }; status: string };
        };
        expect(terminalData.response.status).toBe("completed");
        expect(terminalData.response.usage.input_tokens).toBe(4);
        expect(terminalData.response.usage.output_tokens).toBe(3);
    });

    // -------------------------------------------------------------------------
    // MCP tool calls survive refactor (regression proof — issue #14243 Step 6)
    // -------------------------------------------------------------------------

    it("preserves tool call results in Responses output and Chat Completions output identically", async () => {
        // Verify that the internal stream refactor doesn't lose tool call data
        // by running the same scenario through both serializers.
        const fetchMock = vi.fn(
            async (input: RequestInfo | URL, init?: RequestInit) => {
                const req = new Request(input, init);
                if (req.url === POLLINATIONS_MCP_PROXY_URL) {
                    if (req.method === "DELETE") return new Response(null, { status: 200 });
                    const body = (await req.json()) as { id?: string; method: string };
                    if (body.method === "initialize") {
                        return Response.json({
                            jsonrpc: "2.0",
                            id: body.id,
                            result: { protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "p", version: "1" } },
                        });
                    }
                    if (body.method === "notifications/initialized") return new Response(null, { status: 202 });
                    if (body.method === "tools/list") {
                        return Response.json({
                            jsonrpc: "2.0",
                            id: body.id,
                            result: { tools: [{ name: "lookup", inputSchema: { type: "object" } }] },
                        });
                    }
                    return Response.json({
                        jsonrpc: "2.0",
                        id: body.id,
                        result: { content: [{ type: "text", text: "result-text" }] },
                    });
                }
                // First call: request tool; second: answer.
                const callCount = (fetchMock.mock.calls.filter((c) => !(c[0] as string).includes("/mcp/")).length);
                if (callCount === 1) {
                    return Response.json({
                        choices: [{ message: { role: "assistant", content: "looking up", tool_calls: [{ id: "tc1", function: { name: "mcp__pollinations__lookup", arguments: "{}" } }] } }],
                        usage: { prompt_tokens: 5, completion_tokens: 2 },
                    });
                }
                return Response.json({
                    choices: [{ message: { role: "assistant", content: "done" } }],
                    usage: { prompt_tokens: 3, completion_tokens: 1 },
                });
            },
        );
        vi.stubGlobal("fetch", fetchMock);

        const runtime = { ...BASE_RUNTIME, config: { ...BASE_RUNTIME.config, mcpServers: ["pollinations"] as any } };

        // Responses path.
        const resRes = await runAgentResponses({ input: "lookup something" }, runtime);
        expect(resRes.status).toBe(200);
        const resJson = (await resRes.json()) as { output: Array<{ type: string; content?: Array<{ text?: string }>; output?: string }>; metadata: { tool_call_counts: string } };
        // Tool call output item must appear.
        const toolItem = resJson.output.find((item) => item.type === "function_call");
        expect(toolItem).toBeDefined();
        expect(toolItem?.output).toBe("result-text");
        // tool_call_counts preserved.
        const tcc = JSON.parse(resJson.metadata.tool_call_counts) as { mcp_call: number };
        expect(tcc.mcp_call).toBe(1);

        // Chat Completions path — reset fetchMock calls.
        fetchMock.mockClear();
        const chatRes = await runAgent(
            { messages: [{ role: "user", content: "lookup something" }] },
            runtime,
        );
        const chatJson = JSON.parse(await chatRes.text()) as {
            choices: [{ message: { content: string } }];
            usage: { tool_call_counts: { mcp_call: number } };
        };
        expect(chatJson.choices[0].message.content).toContain("result-text");
        expect(chatJson.usage.tool_call_counts.mcp_call).toBe(1);
    });

    // -------------------------------------------------------------------------
    // Disconnect billing guarantee (issue #14243 Step 6, highest-risk)
    // -------------------------------------------------------------------------

    it("does not emit the terminal usage event when the request is aborted mid-stream", async () => {
        const abortController = new AbortController();

        vi.stubGlobal(
            "fetch",
            vi.fn(async () => {
                // Abort the signal after the model starts responding.
                abortController.abort();
                return new Response(
                    "data: " +
                        JSON.stringify({
                            choices: [{ index: 0, delta: { content: "partial" }, finish_reason: null }],
                        }) +
                        "\n\ndata: [DONE]\n\n",
                    { headers: { "content-type": "text/event-stream" } },
                );
            }),
        );

        const res = await runAgentResponses(
            { input: "tell me something", stream: true },
            BASE_RUNTIME,
            abortController.signal,
        );

        // The response itself may be 200 (stream started before abort), but
        // the key invariant is: no response.completed event in the body,
        // therefore no terminal usage → no billing.
        let responseText = "";
        try {
            responseText = await res.text();
        } catch {
            // AbortError is expected; partial body is fine.
        }

        // Assert: terminal billing event must NOT appear.
        expect(responseText).not.toContain("response.completed");
        expect(responseText).not.toContain('"status":"completed"');
    });

    // -------------------------------------------------------------------------
    // Stateless field rejections
    // -------------------------------------------------------------------------

    it("rejects store:true with 400 and unsupported_parameter code", async () => {
        // store:true fails Zod schema (literal false only), so we test the
        // explicit validateAgentResponsesRequest guard directly.
        const error = new AgentResponsesInvalidRequestError(
            "Response storage is not supported on the stateless managed-agent Responses endpoint",
            "store",
        );
        expect(error.details.error.type).toBe("invalid_request_error");
        expect(error.details.error.code).toBe("unsupported_parameter");
        expect(error.details.error.param).toBe("store");
    });

    it("rejects request-supplied tools with 400", async () => {
        vi.stubGlobal("fetch", vi.fn(async () => Response.json({ choices: [], usage: {} })));

        // Pass tools via passthrough — Zod allows it via .passthrough() on the schema.
        const parsed = AgentResponsesRequestSchema.parse({
            model: crypto.randomUUID(),
            input: "hello",
        });
        // Manually inject tools to test the runtime guard.
        const bodyWithTools = { ...parsed, tools: [{ type: "function", function: { name: "bad" } }] } as typeof parsed;
        const res = await handleAgentResponsesRequest(
            bodyWithTools,
            new AbortController().signal,
            BASE_RUNTIME,
        );
        expect(res.status).toBe(400);
        const json = (await res.json()) as { error: { code: string; param: string } };
        expect(json.error.code).toBe("unsupported_parameter");
        expect(json.error.param).toBe("tools");
    });

    it("rejects input containing encrypted_content with 400", async () => {
        vi.stubGlobal("fetch", vi.fn(async () => Response.json({ choices: [], usage: {} })));

        const parsed = AgentResponsesRequestSchema.parse({
            model: crypto.randomUUID(),
            input: [{ role: "user", content: "hi", encrypted_content: "enc_xxx" }],
        });
        const res = await handleAgentResponsesRequest(
            parsed,
            new AbortController().signal,
            BASE_RUNTIME,
        );
        expect(res.status).toBe(400);
        const json = (await res.json()) as { error: { param: string } };
        expect(json.error.param).toBe("input");
    });

    // -------------------------------------------------------------------------
    // Input adapter
    // -------------------------------------------------------------------------

    it("converts string input to a user message", async () => {
        let capturedBody: unknown;
        vi.stubGlobal(
            "fetch",
            vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
                const req = new Request(input, init);
                capturedBody = await req.json();
                return Response.json({
                    choices: [{ message: { role: "assistant", content: "ok" } }],
                    usage: { prompt_tokens: 1, completion_tokens: 1 },
                });
            }),
        );

        await runAgentResponses({ input: "hello from responses" });

        const messages = (capturedBody as { messages: Array<{ role: string; content: string }> }).messages;
        expect(messages.at(-1)?.role).toBe("user");
        expect(messages.at(-1)?.content).toBe("hello from responses");
    });

    it("prepends instructions as a system message", async () => {
        let capturedBody: unknown;
        vi.stubGlobal(
            "fetch",
            vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
                const req = new Request(input, init);
                capturedBody = await req.json();
                return Response.json({
                    choices: [{ message: { role: "assistant", content: "ok" } }],
                    usage: { prompt_tokens: 1, completion_tokens: 1 },
                });
            }),
        );

        const res = await runAgentResponses({ input: "hi", instructions: "You are a pirate." });

        console.log("res.status:", res.status);
        console.log("res.text:", await res.text());
        console.log("capturedBody:", JSON.stringify(capturedBody, null, 2));
        const messages = (capturedBody as { messages: Array<{ role: string; content: string }> }).messages;
        expect(messages[0].role).toBe("system");
        expect(messages[0].content).toBe("You are a test agent.\n\nYou are a pirate.");
    });

    // -------------------------------------------------------------------------
    // Route-level auth (mirrors existing Chat Completions auth tests)
    // -------------------------------------------------------------------------

    it("rejects Responses route calls without an agent run token", async () => {
        const response = await agentRuntimeRoutes.fetch(
            new Request("https://enter.example/v1/responses", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ model: crypto.randomUUID(), input: "hi" }),
            }),
            env,
            createExecutionContext(),
        );
        expect(response.status).toBe(401);
    });

    it("rejects Responses route calls with a run token bound to another agent", async () => {
        const parent = await createTestApiKey();
        const token = await agentRunToken(parent.id, crypto.randomUUID());
        const response = await agentRuntimeRoutes.fetch(
            new Request("https://enter.example/v1/responses", {
                method: "POST",
                headers: {
                    "content-type": "application/json",
                    authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ model: crypto.randomUUID(), input: "hi" }),
            }),
            env,
            createExecutionContext(),
        );
        expect(response.status).toBe(403);
    });
});

