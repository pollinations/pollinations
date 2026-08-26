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
        ).toEqual({ ...config, mcpServers: MCP_SERVER_IDS, delegateModels: [] });
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

    it("accepts an empty delegateModels list", () => {
        const result = PromptAgentConfigSchema.parse({
            ...config,
            delegateModels: [],
        });
        expect(result.delegateModels).toEqual([]);
    });

    it("accepts a single delegateModels entry", () => {
        // z.string().refine() is used (not z.enum), so single-element lists
        // must not crash.
        const result = PromptAgentConfigSchema.parse({
            ...config,
            delegateModels: ["model-a"],
        });
        expect(result.delegateModels).toEqual(["model-a"]);
    });

    it("accepts multiple delegateModels entries", () => {
        const result = PromptAgentConfigSchema.parse({
            ...config,
            delegateModels: ["model-a", "model-b"],
        });
        expect(result.delegateModels).toEqual(["model-a", "model-b"]);
    });

    it("rejects duplicate delegateModels entries", () => {
        const result = PromptAgentInputSchema.safeParse({
            ...config,
            delegateModels: ["model-a", "model-a"],
        });
        expect(result.error?.issues).toContainEqual(
            expect.objectContaining({
                message: "delegateModels must not contain duplicates",
            }),
        );
    });

    it("defaults delegateModels to [] when absent", () => {
        const result = PromptAgentConfigSchema.parse(config);
        expect(result.delegateModels).toEqual([]);
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
                    mcpServers: ["browser"],
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

// ---------------------------------------------------------------------------
// delegate tool — schema, runtime, and credential tests
// ---------------------------------------------------------------------------
describe("prompt-agent delegate tool", () => {
    beforeEach(() => {
        vi.unstubAllGlobals();
    });

    // Runtime helper pre-configured for delegation.
    function delegateRuntime(
        delegateModels: string[],
    ): Parameters<typeof runAgent>[1] {
        return {
            ...BASE_RUNTIME,
            config: {
                ...BASE_RUNTIME.config,
                delegateModels,
            },
        };
    }

    // Single non-streaming model call that the ToolLoopAgent drives.
    // On first call → returns a delegate tool invocation.
    // On second call → returns the final text.
    function makeModelAndDelegateMock({
        delegatedModel,
        delegatedPrompt,
        delegatedResponse,
        finalContent = "delegation complete",
        onDelegateRequest,
    }: {
        delegatedModel: string;
        delegatedPrompt: string;
        delegatedResponse: string;
        finalContent?: string;
        onDelegateRequest?: (req: Request) => void;
    }) {
        let modelCalls = 0;
        return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            const request = new Request(input, init);
            const url = new URL(request.url);

            // Delegate generateText call goes to /v1/chat/completions with the
            // delegated model as the `model` body field.
            const body = (await request.clone().json().catch(() => null)) as {
                model?: string;
                messages?: unknown[];
                stream?: boolean;
            } | null;

            // First model call: parent ToolLoopAgent decides to delegate.
            if (url.pathname === "/v1/chat/completions" && modelCalls === 0) {
                modelCalls++;
                if (body?.stream) {
                    return new Response(
                        `data: ${JSON.stringify({
                            choices: [
                                {
                                    index: 0,
                                    delta: {
                                        role: "assistant",
                                        content: "",
                                        tool_calls: [
                                            {
                                                index: 0,
                                                id: "delegate-call-1",
                                                type: "function",
                                                function: {
                                                    name: "delegate",
                                                    arguments: JSON.stringify({
                                                        model: delegatedModel,
                                                        prompt: delegatedPrompt,
                                                    }),
                                                },
                                            },
                                        ],
                                    },
                                    finish_reason: null,
                                },
                            ],
                        })}\n\ndata: ${JSON.stringify({
                            choices: [
                                {
                                    index: 0,
                                    delta: {},
                                    finish_reason: "tool_calls",
                                },
                            ],
                            usage: { prompt_tokens: 5, completion_tokens: 5 },
                        })}\n\ndata: [DONE]\n\n`,
                        { headers: { "content-type": "text/event-stream" } },
                    );
                }
                return Response.json({
                    choices: [
                        {
                            message: {
                                role: "assistant",
                                content: "",
                                tool_calls: [
                                    {
                                        id: "delegate-call-1",
                                        type: "function",
                                        function: {
                                            name: "delegate",
                                            arguments: JSON.stringify({
                                                model: delegatedModel,
                                                prompt: delegatedPrompt,
                                            }),
                                        },
                                    },
                                ],
                            },
                            finish_reason: "tool_calls",
                        },
                    ],
                    usage: { prompt_tokens: 5, completion_tokens: 5 },
                });
            }

            // Delegate call: generateText sends a second /v1/chat/completions
            // request with the delegated model.
            if (
                url.pathname === "/v1/chat/completions" &&
                body?.model === delegatedModel
            ) {
                onDelegateRequest?.(request);
                return Response.json({
                    choices: [
                        {
                            message: {
                                role: "assistant",
                                content: delegatedResponse,
                            },
                        },
                    ],
                    usage: { prompt_tokens: 3, completion_tokens: 3 },
                });
            }

            // Second parent call: agent produces its final answer.
            if (body?.stream) {
                return new Response(
                    `data: ${JSON.stringify({
                        choices: [
                            {
                                index: 0,
                                delta: {
                                    role: "assistant",
                                    content: finalContent,
                                },
                                finish_reason: null,
                            },
                        ],
                    })}\n\ndata: ${JSON.stringify({
                        choices: [
                            {
                                index: 0,
                                delta: {},
                                finish_reason: "stop",
                            },
                        ],
                        usage: { prompt_tokens: 4, completion_tokens: 4 },
                    })}\n\ndata: [DONE]\n\n`,
                    { headers: { "content-type": "text/event-stream" } },
                );
            }
            return Response.json({
                choices: [
                    {
                        message: { role: "assistant", content: finalContent },
                    },
                ],
                usage: { prompt_tokens: 4, completion_tokens: 4 },
            });
        });
    }

    // -----------------------------------------------------------------------
    // C. Empty configuration — delegate tool must be absent
    // -----------------------------------------------------------------------
    it("does not expose the delegate tool when delegateModels is empty", async () => {
        const toolNames: string[] = [];
        vi.stubGlobal(
            "fetch",
            vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
                const request = new Request(input, init);
                const body = (await request.json()) as {
                    tools?: Array<{ function: { name: string } }>;
                };
                if (body.tools) {
                    toolNames.push(
                        ...body.tools.map((t) => t.function?.name ?? ""),
                    );
                }
                return Response.json({
                    choices: [
                        {
                            message: { role: "assistant", content: "ok" },
                        },
                    ],
                    usage: { prompt_tokens: 1, completion_tokens: 1 },
                });
            }),
        );

        await runAgent(
            { messages: [{ role: "user", content: "hi" }] },
            delegateRuntime([]),
        );

        expect(toolNames).not.toContain("delegate");
    });

    // -----------------------------------------------------------------------
    // E-single. delegate.model schema — single-model enum
    // -----------------------------------------------------------------------
    it("serializes delegate.model as an enum when delegateModels has one entry", async () => {
        let capturedModelSchema: unknown = null;
        vi.stubGlobal(
            "fetch",
            vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
                const request = new Request(input, init);
                const body = (await request.json()) as {
                    tools?: Array<{
                        function: {
                            name: string;
                            parameters: {
                                properties?: {
                                    model?: unknown;
                                };
                            };
                        };
                    }>;
                };
                const delegateTool = body.tools?.find(
                    (t) => t.function?.name === "delegate",
                );
                if (delegateTool) {
                    capturedModelSchema =
                        delegateTool.function.parameters?.properties?.model ??
                        null;
                }
                return Response.json({
                    choices: [
                        { message: { role: "assistant", content: "ok" } },
                    ],
                    usage: { prompt_tokens: 1, completion_tokens: 1 },
                });
            }),
        );

        await runAgent(
            { messages: [{ role: "user", content: "go" }] },
            delegateRuntime(["model-a"]),
        );

        // The AI SDK must have serialized z.enum(["model-a"]) to a JSON Schema
        // object containing "enum": ["model-a"], not a bare { "type": "string" }.
        expect(capturedModelSchema).not.toBeNull();
        expect(capturedModelSchema).toMatchObject({
            enum: ["model-a"],
        });
        // Must not degrade to a generic string without enum constraint.
        expect(
            (capturedModelSchema as Record<string, unknown>)["enum"],
        ).toBeDefined();
    });

    // -----------------------------------------------------------------------
    // E-multi. delegate.model schema — multi-model enum
    // -----------------------------------------------------------------------
    it("serializes delegate.model as an enum when delegateModels has multiple entries", async () => {
        let capturedModelSchema: unknown = null;
        vi.stubGlobal(
            "fetch",
            vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
                const request = new Request(input, init);
                const body = (await request.json()) as {
                    tools?: Array<{
                        function: {
                            name: string;
                            parameters: {
                                properties?: {
                                    model?: unknown;
                                };
                            };
                        };
                    }>;
                };
                const delegateTool = body.tools?.find(
                    (t) => t.function?.name === "delegate",
                );
                if (delegateTool) {
                    capturedModelSchema =
                        delegateTool.function.parameters?.properties?.model ??
                        null;
                }
                return Response.json({
                    choices: [
                        { message: { role: "assistant", content: "ok" } },
                    ],
                    usage: { prompt_tokens: 1, completion_tokens: 1 },
                });
            }),
        );

        await runAgent(
            { messages: [{ role: "user", content: "go" }] },
            delegateRuntime(["model-a", "model-b"]),
        );

        expect(capturedModelSchema).not.toBeNull();
        expect(capturedModelSchema).toMatchObject({
            enum: ["model-a", "model-b"],
        });
        const schema = capturedModelSchema as Record<string, unknown>;
        // Both values must be present; order must be preserved.
        expect(schema["enum"]).toEqual(["model-a", "model-b"]);
    });

    // -----------------------------------------------------------------------
    // D/A. Single-element allowlist + allowed delegation
    // -----------------------------------------------------------------------
    it("exposes the delegate tool and succeeds with the allowed model", async () => {
        const fetchMock = makeModelAndDelegateMock({
            delegatedModel: "model-a",
            delegatedPrompt: "Summarise this",
            delegatedResponse: "Here is the summary.",
        });
        vi.stubGlobal("fetch", fetchMock);

        const res = await runAgent(
            { messages: [{ role: "user", content: "summarise this" }] },
            delegateRuntime(["model-a"]),
        );

        const text = await res.text();
        expect(res.status, text).toBe(200);
        const json = JSON.parse(text) as {
            choices: { message: { content: string } }[];
        };
        // The tool result text and the final answer must both appear.
        expect(json.choices[0].message.content).toContain(
            "Here is the summary.",
        );
        expect(json.choices[0].message.content).toContain(
            "delegation complete",
        );
    });

    // -----------------------------------------------------------------------
    // G. ag_ credential propagation
    // -----------------------------------------------------------------------
    it("sends the parent ag_ token in the delegate call Authorization header", async () => {
        const parentApiKey = "ag_test_credential_xyz";
        let capturedAuthHeader: string | null = null;

        const fetchMock = makeModelAndDelegateMock({
            delegatedModel: "model-a",
            delegatedPrompt: "check credential",
            delegatedResponse: "credential verified",
            onDelegateRequest: (req) => {
                capturedAuthHeader = req.headers.get("Authorization");
            },
        });
        vi.stubGlobal("fetch", fetchMock);

        const runtime: Parameters<typeof runAgent>[1] = {
            ...BASE_RUNTIME,
            apiKey: parentApiKey,
            config: {
                ...BASE_RUNTIME.config,
                delegateModels: ["model-a"],
            },
        };

        const res = await runAgent(
            { messages: [{ role: "user", content: "check" }] },
            runtime,
        );
        expect(res.status).toBe(200);
        // The delegate HTTP call must carry the same ag_ key that was given to
        // the runtime — no new credential is created by the runtime itself.
        expect(capturedAuthHeader).toBe(`Bearer ${parentApiKey}`);
    });

    // -----------------------------------------------------------------------
    // B. Rejected delegation — unlisted model must not reach Gen
    // -----------------------------------------------------------------------
    it("rejects delegation to a model not in the allowlist", async () => {
        let genCallCount = 0;
        vi.stubGlobal(
            "fetch",
            vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
                const request = new Request(input, init);
                const body = (await request.json()) as {
                    model?: string;
                    tools?: unknown[];
                };

                // First call: model asks to delegate to the disallowed model.
                if (body.tools !== undefined) {
                    genCallCount++;
                    return Response.json({
                        choices: [
                            {
                                message: {
                                    role: "assistant",
                                    content: "",
                                    tool_calls: [
                                        {
                                            id: "bad-delegate",
                                            type: "function",
                                            function: {
                                                name: "delegate",
                                                arguments: JSON.stringify({
                                                    model: "model-b",
                                                    prompt: "do something",
                                                }),
                                            },
                                        },
                                    ],
                                },
                                finish_reason: "tool_calls",
                            },
                        ],
                        usage: { prompt_tokens: 5, completion_tokens: 5 },
                    });
                }

                // Any call whose model is model-b must never reach here.
                if (body.model === "model-b") {
                    throw new Error(
                        "model-b was called despite not being in the allowlist",
                    );
                }

                // Subsequent calls after the tool-error: final answer.
                genCallCount++;
                return Response.json({
                    choices: [
                        {
                            message: {
                                role: "assistant",
                                content: "handled error",
                            },
                        },
                    ],
                    usage: { prompt_tokens: 2, completion_tokens: 2 },
                });
            }),
        );

        const res = await runAgent(
            { messages: [{ role: "user", content: "try model-b" }] },
            delegateRuntime(["model-a"]),
        );
        const text = await res.text();
        expect(res.status, text).toBe(200);
        const json = JSON.parse(text) as {
            choices: { message: { content: string } }[];
        };
        // The tool failure must be surfaced in the response, not silently swallowed.
        expect(json.choices[0].message.content).toContain("Tool Failed");
        expect(json.choices[0].message.content).toMatch(
            /Invalid input|not in the configured delegateModels list/i,
        );
    });

    // -----------------------------------------------------------------------
    // F. Nested agent delegation
    // -----------------------------------------------------------------------
    it("routes agent-model delegation through Gen so existing routing handles it", async () => {
        // Agent B is another prompt agent registered in Gen.
        // From the agent runtime's perspective it is just a model ID string.
        // Gen's routing middleware resolves it to the agent endpoint.
        const agentBId = "agent-b-uuid";
        let delegateRequest: Request | null = null;

        const fetchMock = makeModelAndDelegateMock({
            delegatedModel: agentBId,
            delegatedPrompt: "nested question",
            delegatedResponse: "nested agent response",
            onDelegateRequest: (req) => {
                delegateRequest = req;
            },
        });
        vi.stubGlobal("fetch", fetchMock);

        const res = await runAgent(
            { messages: [{ role: "user", content: "ask agent b" }] },
            delegateRuntime([agentBId]),
        );

        expect(res.status).toBe(200);
        // The delegated request must go to the existing Gen endpoint, not a
        // different URL. Gen handles nested agent routing from there.
        expect(delegateRequest).not.toBeNull();
        const delegateUrl = new URL((delegateRequest as Request).url);
        expect(delegateUrl.origin).toBe(BASE_RUNTIME.genBaseUrl);
        expect(delegateUrl.pathname).toBe("/v1/chat/completions");
        // The parent ag_ token must be forwarded to Gen so it can mint a
        // nested ag_ token for Agent B.
        expect(
            (delegateRequest as Request).headers.get("Authorization"),
        ).toBe(`Bearer ${BASE_RUNTIME.apiKey}`);
    });

    // -----------------------------------------------------------------------
    // H. Billing path — delegate goes through the same Gen endpoint
    // -----------------------------------------------------------------------
    it("sends delegated requests to the Gen endpoint with the parent credential", async () => {
        const delegateRequests: Request[] = [];
        const fetchMock = makeModelAndDelegateMock({
            delegatedModel: "model-a",
            delegatedPrompt: "billing check",
            delegatedResponse: "billed correctly",
            onDelegateRequest: (req) => delegateRequests.push(req),
        });
        vi.stubGlobal("fetch", fetchMock);

        const res = await runAgent(
            { messages: [{ role: "user", content: "run" }] },
            delegateRuntime(["model-a"]),
        );
        expect(res.status).toBe(200);
        // Exactly one delegate call must have gone through Gen.
        expect(delegateRequests).toHaveLength(1);
        const url = new URL(delegateRequests[0].url);
        expect(url.origin).toBe(BASE_RUNTIME.genBaseUrl);
        // The credential is the parent's ag_ key — Gen's billing middleware
        // will apply charges to the owner of that key.
        expect(delegateRequests[0].headers.get("Authorization")).toBe(
            `Bearer ${BASE_RUNTIME.apiKey}`,
        );
    });

    // -----------------------------------------------------------------------
    // I. Non-streaming: delegation in the non-streaming path
    // -----------------------------------------------------------------------
    it("surfaces delegation as a tool result in non-streaming mode", async () => {
        const fetchMock = makeModelAndDelegateMock({
            delegatedModel: "model-a",
            delegatedPrompt: "non-streaming test",
            delegatedResponse: "non-streaming result",
            finalContent: "final answer",
        });
        vi.stubGlobal("fetch", fetchMock);

        const res = await runAgent(
            {
                messages: [{ role: "user", content: "go" }],
                stream: false,
            },
            delegateRuntime(["model-a"]),
        );

        expect(res.status).toBe(200);
        const json = (await res.json()) as {
            object: string;
            choices: { message: { content: string }; finish_reason: string }[];
        };
        expect(json.object).toBe("chat.completion");
        // Tool result block must appear before the final answer.
        expect(json.choices[0].message.content).toContain(
            "non-streaming result",
        );
        expect(json.choices[0].message.content).toContain("final answer");
    });

    // -----------------------------------------------------------------------
    // J. Streaming: delegation in the streaming path
    // -----------------------------------------------------------------------
    it("surfaces delegation as a tool-result chunk in streaming mode", async () => {
        const fetchMock = makeModelAndDelegateMock({
            delegatedModel: "model-a",
            delegatedPrompt: "streaming test",
            delegatedResponse: "streamed tool output",
            finalContent: "streamed final",
        });
        vi.stubGlobal("fetch", fetchMock);

        const res = await runAgent(
            {
                messages: [{ role: "user", content: "stream it" }],
                stream: true,
            },
            delegateRuntime(["model-a"]),
        );

        expect(res.headers.get("content-type")).toContain("text/event-stream");

        const text = await res.text();
        // Parse SSE events to assert actual content.
        const chunks = text
            .split("\n\n")
            .filter((line) => line.startsWith("data: ") && !line.includes("[DONE]"))
            .map((line) => {
                try {
                    return JSON.parse(line.slice("data: ".length)) as {
                        choices?: Array<{
                            delta?: { content?: string };
                            finish_reason?: string | null;
                        }>;
                    };
                } catch {
                    return null;
                }
            })
            .filter(Boolean);

        const allContent = chunks
            .flatMap((c) => c?.choices ?? [])
            .map((ch) => ch.delta?.content ?? "")
            .join("");

        // The delegate tool result must be present in the stream.
        expect(allContent).toContain("streamed tool output");
        // The final content must also be present.
        expect(allContent).toContain("streamed final");

        // There must be a finish chunk with finish_reason.
        const finishChunk = chunks.find((c) =>
            c?.choices?.some((ch) => ch.finish_reason),
        );
        expect(finishChunk).toBeDefined();
    });
});
