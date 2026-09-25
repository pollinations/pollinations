import { runtimeModule, sdkModules } from "virtual:code-agent-sdk";
import { generateText, jsonSchema, tool } from "ai";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createWorker as createComposioWorker } from "../../apps/composio-mcp/worker.js";
import { functionOutputText } from "../../shared/schemas/response-function-items.ts";
import {
    deleteCodeAgent,
    deployCodeAgent,
    loadCodeAgentSource,
    resolveCodeAgentRepository,
} from "../src/services/code-agent.ts";
import createCodeAgentWorker from "../src/services/code-agent-runtime.js";

const deploymentEnv = {
    ENVIRONMENT: "test",
    CLOUDFLARE_ACCOUNT_ID: "account-id",
    CODE_AGENT_DEPLOY_API_TOKEN: "deploy-token",
    CODE_AGENT_DISPATCH_NAMESPACE: "code-agents-test",
    GEN_BASE_URL: "https://gen.pollinations.ai",
};

afterEach(() => vi.unstubAllGlobals());

describe("code agent AI SDK", () => {
    const runtimeEnv = {
        POLLINATIONS_BASE_URL: "https://staging.gen.pollinations.ai",
    };
    const request = (body: unknown) =>
        new Request("https://agent.test/v1/responses", {
            method: "POST",
            headers: {
                "content-type": "application/json",
            },
            body: JSON.stringify(body),
        });

    it("uses the staging model with caller settings and no exposed credential", async () => {
        const fetchMock = vi.fn(async (url, init) => {
            expect(String(url)).toBe(
                "https://staging.gen.pollinations.ai/v1/chat/completions",
            );
            expect(new Headers(init.headers).has("authorization")).toBe(false);
            expect(JSON.parse(init.body)).toMatchObject({
                model: "test-model",
                max_tokens: 123,
                temperature: 0,
                messages: [
                    { role: "system", content: "Answer briefly." },
                    { role: "user", content: "Hello" },
                ],
            });
            return Response.json({
                id: "completion",
                object: "chat.completion",
                created: 1,
                model: "test-model",
                choices: [
                    {
                        index: 0,
                        message: { role: "assistant", content: "Hello!" },
                        finish_reason: "stop",
                    },
                ],
                usage: {
                    prompt_tokens: 4,
                    completion_tokens: 2,
                    total_tokens: 6,
                },
            });
        });
        vi.stubGlobal("fetch", fetchMock);
        const worker = createCodeAgentWorker(
            async ({ request, model, respond }) => {
                expect(await request.json()).toMatchObject({ input: "Hello" });
                return respond({
                    model: model("test-model"),
                    instructions: "Answer briefly.",
                    temperature: 1,
                });
            },
        );
        const response = await worker.fetch(
            request({
                model: "example/agent",
                input: "Hello",
                max_output_tokens: 123,
                temperature: 0,
            }),
            runtimeEnv,
        );
        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({
            model: "example/agent",
            status: "completed",
            output: [
                {
                    type: "message",
                    content: [{ type: "output_text", text: "Hello!" }],
                },
            ],
            usage: { input_tokens: 4, output_tokens: 2, total_tokens: 6 },
        });
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it.each([
        { stream: false, fail: false },
        { stream: true, fail: false },
        { stream: false, fail: true },
        { stream: true, fail: true },
    ])("replays final tool output without re-execution (stream:$stream, fail:$fail)", async ({
        stream,
        fail,
    }) => {
        let modelCalls = 0;
        let executions = 0;
        let conversions = 0;
        vi.stubGlobal("fetch", async (_url, init) => {
            const body = JSON.parse(init.body);
            modelCalls++;
            if (modelCalls > 1) {
                const result = body.messages.find(
                    (message) => message.role === "tool",
                ).content;
                if (fail) expect(result).toContain("Lookup unavailable");
                else expect(result).toBe("lookup-call: weather = 42");
            }
            const message =
                modelCalls === 1
                    ? {
                          role: "assistant",
                          content: null,
                          tool_calls: [
                              {
                                  id: "lookup-call",
                                  type: "function",
                                  function: {
                                      name: "lookup",
                                      arguments: '{"topic":"weather"}',
                                  },
                              },
                          ],
                      }
                    : { role: "assistant", content: "Done." };
            const finishReason = modelCalls === 1 ? "tool_calls" : "stop";
            const usage = {
                prompt_tokens: 4,
                completion_tokens: 2,
                total_tokens: 6,
            };
            if (!body.stream)
                return Response.json({
                    choices: [
                        { index: 0, message, finish_reason: finishReason },
                    ],
                    usage,
                });
            const delta = {
                ...message,
                ...(message.tool_calls
                    ? {
                          tool_calls: message.tool_calls.map((call, index) => ({
                              ...call,
                              index,
                          })),
                      }
                    : {}),
            };
            return new Response(
                `data: ${JSON.stringify({ choices: [{ index: 0, delta, finish_reason: null }] })}\n\n` +
                    `data: ${JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: finishReason }], usage })}\n\n` +
                    "data: [DONE]\n\n",
                { headers: { "content-type": "text/event-stream" } },
            );
        });
        const worker = createCodeAgentWorker(({ model, respond }) =>
            respond({
                model: model("test-model"),
                tools: {
                    lookup: tool({
                        description: "Look up a topic",
                        inputSchema: jsonSchema<{ topic: string }>({
                            type: "object",
                            properties: { topic: { type: "string" } },
                            required: ["topic"],
                        }),
                        async *execute() {
                            executions++;
                            if (fail) throw new Error("Lookup unavailable");
                            yield { answer: 0 };
                            yield { answer: 42 };
                        },
                        async toModelOutput({ toolCallId, input, output }) {
                            conversions++;
                            return {
                                type: "text",
                                value: `${toolCallId}: ${input.topic} = ${output.answer.toString()}`,
                            };
                        },
                    }),
                },
            }),
        );
        async function responseBody(response: Response) {
            expect(response.status).toBe(200);
            if (!stream) return response.json();
            const events = (await response.text())
                .split("\n\n")
                .flatMap((block) => {
                    const data = block
                        .split("\n")
                        .find((line) => line.startsWith("data: "))
                        ?.slice(6);
                    return data && data !== "[DONE]" ? [JSON.parse(data)] : [];
                });
            expect(events.at(-1)?.type).toBe("response.completed");
            return events.at(-1).response;
        }
        const first = await responseBody(
            await worker.fetch(
                request({
                    model: "example/agent",
                    input: "Look up weather",
                    stream,
                }),
                runtimeEnv,
            ),
        );
        expect(
            first.output.filter((item) => item.type === "function_call_output"),
        ).toEqual([
            expect.objectContaining({
                call_id: "lookup-call",
                output: [
                    {
                        type: "input_text",
                        text: fail
                            ? JSON.stringify({
                                  isError: true,
                                  content: [
                                      {
                                          type: "text",
                                          text: "Lookup unavailable",
                                      },
                                  ],
                              })
                            : '{"answer":42}',
                    },
                ],
            }),
        ]);
        const replay = await responseBody(
            await worker.fetch(
                request({
                    model: "example/agent",
                    input: [
                        ...first.output,
                        { role: "user", content: "Remember the result" },
                    ],
                    stream,
                }),
                runtimeEnv,
            ),
        );
        expect(replay.output).toEqual([
            expect.objectContaining({
                type: "message",
                content: [expect.objectContaining({ text: "Done." })],
            }),
        ]);
        expect(modelCalls).toBe(3);
        expect(executions).toBe(1);
        expect(conversions).toBe(fail ? 0 : 2);
    });

    it.each([
        undefined,
        { prompt_tokens: 1, completion_tokens: -1, total_tokens: 0 },
    ])("rejects invalid upstream usage without retrying", async (usage) => {
        const fetchMock = vi.fn(async () =>
            Response.json({
                choices: [
                    {
                        index: 0,
                        message: { role: "assistant", content: "Hello" },
                        finish_reason: "stop",
                    },
                ],
                usage,
            }),
        );
        vi.stubGlobal("fetch", fetchMock);
        const worker = createCodeAgentWorker(({ model, respond }) =>
            respond({ model: model("test-model") }),
        );
        const response = await worker.fetch(
            request({ input: "Hello" }),
            runtimeEnv,
        );
        expect(response.status).toBe(502);
        expect(await response.json()).toHaveProperty("error");
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("validates the external Responses request before invoking a model", async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal("fetch", fetchMock);
        const worker = createCodeAgentWorker(({ model, respond }) =>
            respond({ model: model("test-model") }),
        );
        const response = await worker.fetch(
            request({ input: "Hello", max_output_tokens: -1 }),
            runtimeEnv,
        );
        expect(response.status).toBe(400);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("passes model errors raised outside respond through to the caller", async () => {
        vi.stubGlobal("fetch", async () =>
            Response.json(
                { error: { message: "Insufficient balance" } },
                { status: 402 },
            ),
        );
        const worker = createCodeAgentWorker(async ({ model }) => {
            const { text } = await generateText({
                model: model("test-model"),
                prompt: "Hello",
                maxRetries: 0,
            });
            return new Response(text);
        });
        const response = await worker.fetch(
            request({ input: "Hello" }),
            runtimeEnv,
        );
        expect(response.status).toBe(402);
        await expect(response.json()).resolves.toEqual({
            error: {
                message: "Insufficient balance",
                type: "server_error",
                code: "agent_error",
                param: null,
            },
        });
    });

    it("caps executed MCP calls and reports only actual executions", async () => {
        let modelCalls = 0;
        let mcpCalls = 0;
        vi.stubGlobal("fetch", async (url, init) => {
            const body = JSON.parse(init.body);
            if (String(url).endsWith("/mcp/pollinations")) {
                if (body.method === "tools/list")
                    return Response.json({
                        jsonrpc: "2.0",
                        id: body.id,
                        result: {
                            tools: [
                                {
                                    name: "echo",
                                    inputSchema: {
                                        type: "object",
                                        properties: {},
                                    },
                                },
                            ],
                        },
                    });
                mcpCalls++;
                return Response.json({
                    jsonrpc: "2.0",
                    id: body.id,
                    result: { content: [{ type: "text", text: "ok" }] },
                });
            }
            modelCalls++;
            return Response.json({
                choices: [
                    {
                        index: 0,
                        message:
                            modelCalls === 1
                                ? {
                                      role: "assistant",
                                      content: null,
                                      tool_calls: Array.from(
                                          { length: 17 },
                                          (_, i) => ({
                                              id: `call-${i}`,
                                              type: "function",
                                              function: {
                                                  name: "mcp__pollinations__echo",
                                                  arguments: "{}",
                                              },
                                          }),
                                      ),
                                  }
                                : { role: "assistant", content: "Finished." },
                        finish_reason: modelCalls === 1 ? "tool_calls" : "stop",
                    },
                ],
                usage: {
                    prompt_tokens: 4,
                    completion_tokens: 2,
                    total_tokens: 6,
                },
            });
        });
        const worker = createCodeAgentWorker(async ({ model, mcp, respond }) =>
            respond({
                model: model("test-model"),
                tools: await mcp.tools("pollinations"),
            }),
        );
        const response = await worker.fetch(
            request({ input: "Run tools" }),
            runtimeEnv,
        );
        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.usage.tool_call_counts).toEqual({ mcp_call: 16 });
        expect(body.usage.total_tokens).toBe(12);
        expect(mcpCalls).toBe(16);
        expect(modelCalls).toBe(2);
        const results = body.output.filter(
            (item) => item.type === "function_call_output",
        );
        expect(results).toHaveLength(17);
        expect(
            JSON.parse(functionOutputText(results[16].output)),
        ).toMatchObject({ isError: true });
    });
});

describe("code agent deployment", () => {
    it("uploads the platform wrapper and owner source", async () => {
        const fetchMock = vi.fn(async () => Response.json({ success: true }));
        vi.stubGlobal("fetch", fetchMock);

        const source = `type AgentContext = { request: Request };
export default async ({ request }: AgentContext) => new Response(request.url);`;
        await deployCodeAgent(deploymentEnv, "agent-id", source);

        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toContain(
            "/workers/dispatch/namespaces/code-agents-test/scripts/agent-id",
        );
        expect(init?.method).toBe("PUT");
        expect(init?.headers).toEqual({
            Authorization: "Bearer deploy-token",
        });
        const form = init?.body as FormData;
        const metadata = JSON.parse(
            await (form.get("metadata") as Blob).text(),
        );
        expect(metadata).toMatchObject({
            main_module: "index.mjs",
            bindings: [
                {
                    type: "plain_text",
                    name: "POLLINATIONS_BASE_URL",
                    text: "https://gen.pollinations.ai",
                },
            ],
        });
        const deployedSource = await (form.get("agent.mjs") as Blob).text();
        expect(deployedSource).toContain("export default async");
        expect(deployedSource).not.toContain("AgentContext");
        expect(await (form.get("runtime.mjs") as Blob).text()).toBe(
            runtimeModule,
        );
        for (const [name, source] of Object.entries(sdkModules)) {
            expect(await (form.get(name) as Blob).text()).toBe(source);
        }
        expect(await (form.get("index.mjs") as Blob).text()).toContain(
            'import createCodeAgentWorker from "./runtime.mjs"',
        );
    });

    it("loads agent.ts from an immutable public GitHub revision", async () => {
        const source = "export default () => new Response('ok');";
        const commit = "a".repeat(40);
        const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
            const url = String(input);
            if (url.endsWith("/repos/example/agents")) {
                return Response.json({
                    name: "agents",
                    full_name: "example/agents",
                    description: "Example agents",
                    private: false,
                });
            }
            if (url.endsWith("/repos/example/agents/commits/HEAD")) {
                return Response.json({ sha: commit });
            }
            if (
                url ===
                `https://raw.githubusercontent.com/example/agents/${commit}/agent.ts`
            ) {
                return new Response(source);
            }
            return new Response(null, { status: 404 });
        });
        vi.stubGlobal("fetch", fetchMock);

        const repository = await resolveCodeAgentRepository(
            deploymentEnv,
            "https://github.com/example/agents",
        );
        expect(repository).toEqual({
            repository: "https://github.com/example/agents",
            name: "agents",
            description: "Example agents",
            deployedCommitSha: commit,
        });
        await expect(
            loadCodeAgentSource(
                repository.repository,
                repository.deployedCommitSha,
            ),
        ).resolves.toBe(source);
        expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({
            Authorization: "token mock_github_auth_token",
        });
    });

    it("rejects a private GitHub repository", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async (input: RequestInfo | URL) =>
                String(input).endsWith("/commits/HEAD")
                    ? Response.json({ sha: "a".repeat(40) })
                    : Response.json({
                          name: "private-agent",
                          full_name: "example/private-agent",
                          description: null,
                          private: true,
                      }),
            ),
        );

        await expect(
            resolveCodeAgentRepository(
                deploymentEnv,
                "https://github.com/example/private-agent",
            ),
        ).rejects.toMatchObject({ status: 400 });
    });

    it("fails closed when deployment is not configured", async () => {
        await expect(
            deployCodeAgent(
                {
                    ...deploymentEnv,
                    CODE_AGENT_DEPLOY_API_TOKEN: undefined,
                },
                "agent-id",
                "export default () => new Response();",
            ),
        ).rejects.toMatchObject({ status: 503 });
    });

    it("rejects invalid TypeScript before upload", async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal("fetch", fetchMock);

        await expect(
            deployCodeAgent(
                deploymentEnv,
                "agent-id",
                "export default function (: string) {}",
            ),
        ).rejects.toMatchObject({
            status: 400,
            message: "agent.ts contains invalid TypeScript",
        });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("treats an already absent Worker as deleted", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => new Response(null, { status: 404 })),
        );
        await expect(
            deleteCodeAgent(deploymentEnv, "agent-id"),
        ).resolves.toBeUndefined();
    });
});

describe("code agent runtime", () => {
    const runtimeEnv = { POLLINATIONS_BASE_URL: "https://gen.pollinations.ai" };

    it("accepts the credential-free dispatch request and passes through the agent response", async () => {
        const upstream = new Response("streamed result");
        const fetchMock = vi.fn(async () => upstream);
        vi.stubGlobal("fetch", fetchMock);
        const worker = createCodeAgentWorker(
            async ({ request, pollinations }) => {
                expect(request.headers.get("authorization")).toBeNull();
                expect(request.headers.get("cookie")).toBeNull();
                expect(await request.json()).toEqual({ input: "hello" });
                return pollinations("/v1/responses", {
                    method: "POST",
                    body: "{}",
                });
            },
        );

        const response = await worker.fetch(
            new Request("https://code-agent-runtime.invalid/v1/responses", {
                method: "POST",
                headers: {
                    "content-type": "application/json",
                },
                body: JSON.stringify({ input: "hello" }),
            }),
            runtimeEnv,
        );

        expect(response).toBe(upstream);
        expect(String(fetchMock.mock.calls[0][0])).toBe(
            "https://gen.pollinations.ai/v1/responses",
        );
    });

    it.each([
        "json",
        "sse",
    ])("reads a stateless MCP %s result", async (format) => {
        const result = { content: [{ type: "text", text: "model list" }] };
        const fetchMock = vi.fn(async (_url, init) => {
            const message = JSON.parse(init.body);
            expect(message.method).toBe("tools/call");
            expect(message.params).toEqual({
                name: "listModels",
                arguments: {},
            });
            if (format === "json") {
                return Response.json({
                    jsonrpc: "2.0",
                    id: message.id,
                    result,
                });
            }
            return new Response(
                [
                    ": keepalive",
                    "",
                    'data: {"jsonrpc":"2.0","method":"notifications/progress","params":{"progress":1}}',
                    "",
                    'data: {"jsonrpc":"2.0","id":"another-call","result":{}}',
                    "",
                    "event: message",
                    'data: {"jsonrpc":"2.0",',
                    `data: "id":"${message.id}",`,
                    `data: "result":${JSON.stringify(result)}}`,
                    "",
                    "data: [DONE]",
                    "",
                ].join("\r\n"),
                { headers: { "content-type": "text/event-stream" } },
            );
        });
        vi.stubGlobal("fetch", fetchMock);
        const worker = createCodeAgentWorker(async ({ mcp }) =>
            Response.json(await mcp("pollinations", "listModels")),
        );

        const response = await worker.fetch(
            new Request("https://agent.test"),
            runtimeEnv,
        );
        await expect(response.json()).resolves.toEqual(result);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("discovers raw MCP tool definitions without calling them", async () => {
        const tools = [
            {
                name: "generateImage",
                description: "Generate an image",
                inputSchema: {
                    type: "object",
                    properties: { prompt: { type: "string" } },
                    required: ["prompt"],
                },
                annotations: { title: "Image generator" },
            },
        ];
        const fetchMock = vi.fn(async (url, init) => {
            expect(String(url)).toBe(
                "https://gen.pollinations.ai/mcp/pollinations",
            );
            const message = JSON.parse(init.body);
            expect(message.method).toBe("tools/list");
            expect(message.params).toEqual({});
            return Response.json({
                jsonrpc: "2.0",
                id: message.id,
                result: { tools },
            });
        });
        vi.stubGlobal("fetch", fetchMock);
        const worker = createCodeAgentWorker(async ({ mcp }) =>
            Response.json(await mcp.listTools("pollinations")),
        );

        const response = await worker.fetch(
            new Request("https://agent.test"),
            runtimeEnv,
        );
        await expect(response.json()).resolves.toEqual(tools);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("shares one Composio session for discovery and calls per invocation", async () => {
        let createdSessions = 0;
        const methods: string[] = [];
        const tools = [
            { name: "COMPOSIO_SEARCH_TOOLS", inputSchema: { type: "object" } },
        ];
        const composio = createComposioWorker({
            fetchImpl: async (url, init) => {
                if (String(url).startsWith("https://backend.composio.dev/")) {
                    if (init.method === "POST") createdSessions++;
                    return Response.json({
                        session_id: "router-session",
                        mcp: { url: "https://composio.test/mcp" },
                        config: { user_id: "test-caller" },
                    });
                }
                const message = await new Response(init.body).json();
                methods.push(message.method);
                if (message.method === "initialize") {
                    return Response.json(
                        {
                            jsonrpc: "2.0",
                            id: message.id,
                            result: { protocolVersion: "2025-06-18" },
                        },
                        { headers: { "mcp-session-id": "transport-session" } },
                    );
                }
                expect(new Headers(init.headers).get("mcp-session-id")).toBe(
                    "transport-session",
                );
                expect(
                    new Headers(init.headers).get("mcp-protocol-version"),
                ).toBe("2025-06-18");
                if (message.method === "notifications/initialized") {
                    return new Response(null, { status: 202 });
                }
                if (message.method === "tools/list") {
                    return Response.json({
                        jsonrpc: "2.0",
                        id: message.id,
                        result: { tools },
                    });
                }
                return Response.json({
                    jsonrpc: "2.0",
                    id: message.id,
                    result: {
                        content: [{ type: "text", text: "connected tools" }],
                    },
                });
            },
        });
        vi.stubGlobal("fetch", async (url, init) => {
            expect(String(url)).toBe(
                "https://gen.pollinations.ai/mcp/composio",
            );
            const headers = new Headers(init.headers);
            headers.set("x-pollinations-user-id", "test-caller");
            return composio.fetch(
                new Request("https://mcp.internal/", { ...init, headers }),
                { COMPOSIO_API_KEY: "test-key" },
            );
        });
        const worker = createCodeAgentWorker(async ({ mcp }) =>
            Response.json(
                await Promise.all([
                    mcp.listTools("composio"),
                    mcp("composio", "COMPOSIO_SEARCH_TOOLS", { queries: [] }),
                    mcp("composio", "COMPOSIO_SEARCH_TOOLS", { queries: [] }),
                ]),
            ),
        );

        for (let invocation = 0; invocation < 2; invocation++) {
            const response = await worker.fetch(
                new Request("https://agent.test"),
                runtimeEnv,
            );
            expect(response.status).toBe(200);
            await expect(response.json()).resolves.toEqual([
                tools,
                { content: [{ type: "text", text: "connected tools" }] },
                { content: [{ type: "text", text: "connected tools" }] },
            ]);
        }
        expect(createdSessions).toBe(2);
        expect(methods).toEqual([
            "initialize",
            "notifications/initialized",
            "tools/list",
            "tools/call",
            "tools/call",
            "initialize",
            "notifications/initialized",
            "tools/list",
            "tools/call",
            "tools/call",
        ]);
    });

    it.each([
        ["http", "MCP tool call failed (503)"],
        ["rpc", "upstream detail"],
        ["missing-result", "MCP tool call returned no result"],
    ])("reports MCP %s errors to the caller", async (failure, message) => {
        vi.stubGlobal("fetch", async (_url, init) => {
            if (failure === "http")
                return new Response("upstream detail", { status: 503 });
            const message = JSON.parse(init.body);
            return Response.json({
                jsonrpc: "2.0",
                id: message.id,
                ...(failure === "rpc"
                    ? { error: { message: "upstream detail" } }
                    : {}),
            });
        });
        const worker = createCodeAgentWorker(async ({ mcp }) =>
            Response.json(await mcp("pollinations", "listModels")),
        );

        const response = await worker.fetch(
            new Request("https://agent.test"),
            runtimeEnv,
        );
        expect(response.status).toBe(502);
        await expect(response.json()).resolves.toEqual({
            error: {
                message,
                type: "server_error",
                code: "agent_error",
                param: null,
            },
        });
    });
});
