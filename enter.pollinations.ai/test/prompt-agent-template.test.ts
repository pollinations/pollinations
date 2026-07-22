import { beforeEach, describe, expect, it, vi } from "vitest";
import { PROMPT_AGENT_TEMPLATE_SOURCE } from "../src/services/prompt-agent-template.ts";

// Load the template (a self-contained ES module string) as a real module and
// drive its default fetch handler, mocking global fetch so the base-model and
// tool calls are controllable. This exercises the tool loop, streaming SSE
// framing, and tool-error recovery for real rather than by string match.
type AgentModule = {
    default: {
        fetch: (
            request: Request,
            env: Record<string, string>,
        ) => Promise<Response>;
    };
};

async function loadTemplate(): Promise<AgentModule["default"]> {
    // The template is a single-file ES module string. The Workers test pool
    // can't dynamically import a data: URL, so evaluate the body directly:
    // rewrite `export default {` to `return {` and run it in a function scope.
    // The template has no imports, so nothing else needs resolving.
    const body = PROMPT_AGENT_TEMPLATE_SOURCE.replace(
        /export default \{/,
        "return {",
    );
    const factory = new Function(`${body}`);
    return factory() as AgentModule["default"];
}

const BASE_ENV = {
    SYSTEM_PROMPT: "You are a test agent.",
    BASE_MODEL: "openai",
    MCP_JSON: "[]",
    POLLINATIONS_KEY: "sk_test",
    GEN_BASE_URL: "https://gen.test.example",
    BEE_AUTH_TOKEN: "secret-token",
};

function chatRequest(body: Record<string, unknown>): Request {
    return new Request("https://bee.example.com/v1/chat/completions", {
        method: "POST",
        headers: {
            "content-type": "application/json",
            authorization: "Bearer secret-token",
        },
        body: JSON.stringify(body),
    });
}

describe("prompt-agent template", () => {
    beforeEach(() => {
        vi.unstubAllGlobals();
    });

    it("rejects callers without the auth token", async () => {
        const agent = await loadTemplate();
        const res = await agent.fetch(
            new Request("https://bee.example.com/v1/chat/completions", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ messages: [] }),
            }),
            BASE_ENV,
        );
        expect(res.status).toBe(401);
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
                    const body = (await request.json()) as {
                        method: string;
                    };
                    if (body.method === "initialize") {
                        return Response.json(
                            {
                                jsonrpc: "2.0",
                                id: 1,
                                result: { protocolVersion: "2025-06-18" },
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
                            id: 2,
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
                        id: 3,
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

        const agent = await loadTemplate();
        const res = await agent.fetch(
            chatRequest({ messages: [{ role: "user", content: "hi" }] }),
            {
                ...BASE_ENV,
                MCP_JSON: JSON.stringify([
                    { name: "docs", url: "https://mcp.example.com/rpc" },
                ]),
            },
        );

        expect(res.status).toBe(200);
        const json = (await res.json()) as {
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
        const bodies = await Promise.all(
            mcpRequests.map(
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
        expect(bodies.map((body) => body.id)).toEqual([1, undefined, 2, 3]);
        expect(mcpRequests[0].headers.get("Mcp-Session-Id")).toBeNull();
        for (const request of mcpRequests.slice(1)) {
            expect(request.headers.get("Mcp-Session-Id")).toBe("session-1");
            expect(request.headers.get("MCP-Protocol-Version")).toBe(
                "2025-06-18",
            );
        }
    });

    it("streams SSE with usage on the final chunk when stream:true", async () => {
        const fetchMock = vi.fn(async () =>
            Response.json({
                choices: [
                    { message: { role: "assistant", content: "hello world" } },
                ],
                usage: { prompt_tokens: 6, completion_tokens: 4 },
            }),
        );
        vi.stubGlobal("fetch", fetchMock);

        const agent = await loadTemplate();
        const res = await agent.fetch(
            chatRequest({
                messages: [{ role: "user", content: "hi" }],
                stream: true,
            }),
            BASE_ENV,
        );
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
        // First chunk carries the content delta; final chunk carries the
        // finish_reason and usage (where the gateway reads tool_call_counts).
        expect(dataEvents[0].choices[0].delta.content).toBe("hello world");
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
                    const body = (await request.json()) as { method: string };
                    if (body.method === "initialize") {
                        return Response.json({
                            jsonrpc: "2.0",
                            id: 1,
                            result: { protocolVersion: "2025-06-18" },
                        });
                    }
                    if (body.method === "notifications/initialized") {
                        return new Response(null, { status: 202 });
                    }
                    if (body.method === "tools/list") {
                        return Response.json({
                            jsonrpc: "2.0",
                            id: 2,
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

        const agent = await loadTemplate();
        const res = await agent.fetch(
            chatRequest({
                messages: [{ role: "user", content: "look up cats" }],
            }),
            {
                ...BASE_ENV,
                MCP_JSON: JSON.stringify([
                    { name: "docs", url: "https://mcp.example.com/rpc" },
                ]),
            },
        );
        // A tool failure does not fail the request.
        expect(res.status).toBe(200);
        const json = (await res.json()) as {
            choices: { message: { content: string } }[];
            usage: { tool_call_counts: Record<string, number> };
        };
        expect(json.choices[0].message.content).toBe("sorry, lookup failed");
        // The (failed) tool call is still counted — the owner's tool ran.
        expect(json.usage.tool_call_counts).toEqual({ mcp_call: 1 });
    });
});
