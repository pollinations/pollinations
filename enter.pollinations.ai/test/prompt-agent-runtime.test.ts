import { env } from "cloudflare:test";
import * as schema from "@shared/db/better-auth.ts";
import { encryptSecret } from "@shared/secret-encryption.ts";
import { createTestUser } from "@shared/test/fixtures/index.ts";
import { drizzle } from "drizzle-orm/d1";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { agentRuntimeRoutes } from "../src/routes/agent-runtime.ts";
import {
    handlePromptAgentRequest,
    type PromptAgentRequest,
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

describe("prompt-agent runtime", () => {
    beforeEach(() => {
        vi.unstubAllGlobals();
    });

    it("rejects calls without the internal Enter token", async () => {
        const response = await agentRuntimeRoutes.fetch(
            new Request("https://enter.example/v1/chat/completions", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ model: crypto.randomUUID() }),
            }),
            env,
        );
        expect(response.status).toBe(401);
    });

    it("selects agents by the request model", async () => {
        const response = await agentRuntimeRoutes.fetch(
            new Request("https://enter.example/v1/chat/completions", {
                method: "POST",
                headers: {
                    "content-type": "application/json",
                    authorization: `Bearer ${env.PLN_ENTER_TOKEN}`,
                },
                body: JSON.stringify({ model: crypto.randomUUID() }),
            }),
            env,
        );
        expect(response.status).toBe(404);
    });

    it("loads the selected config and owner key from D1", async () => {
        const db = drizzle(env.DB, { schema });
        const agentId = crypto.randomUUID();
        await db.insert(schema.agent).values({
            id: agentId,
            ownerUserId: await createTestUser(),
            name: `runtime-${agentId}`,
            config: JSON.stringify({
                systemPrompt: "Answer briefly.",
                baseModel: "openai-fast",
                mcpServers: [],
            }),
            baseUrl: "https://enter.test/api/agent-runtime/v1",
            apiKeyCiphertext: await encryptSecret(
                "sk_agent_owner",
                env.BETTER_AUTH_SECRET,
            ),
            apiKeyId: crypto.randomUUID(),
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
                    "Bearer sk_agent_owner",
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
                    authorization: `Bearer ${env.PLN_ENTER_TOKEN}`,
                },
                body: JSON.stringify({
                    model: agentId,
                    messages: [{ role: "user", content: "hello" }],
                }),
            }),
            { ...env, GEN_BASE_URL: "https://gen.test" },
        );
        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toMatchObject({
            model: "openai-fast",
            choices: [{ message: { content: "done" } }],
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
                        { name: "docs", url: "https://mcp.example.com/rpc" },
                    ],
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
        expect(json.choices[0].message.content).toBe("done");
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
