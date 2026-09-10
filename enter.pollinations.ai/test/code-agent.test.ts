import { afterEach, describe, expect, it, vi } from "vitest";
import { createWorker as createComposioWorker } from "../../apps/composio-mcp/worker.js";
import {
    deleteCodeAgent,
    deployCodeAgent,
    loadCodeAgentSource,
    resolveCodeAgentRepository,
} from "../src/services/code-agent.ts";
import createCodeAgentWorker from "../src/services/code-agent-runtime.js";
import runtimeModule from "../src/services/code-agent-runtime.js?raw";

const deploymentEnv = {
    ENVIRONMENT: "test",
    CLOUDFLARE_ACCOUNT_ID: "account-id",
    CODE_AGENT_DEPLOY_API_TOKEN: "deploy-token",
    CODE_AGENT_DISPATCH_NAMESPACE: "code-agents-test",
    GEN_BASE_URL: "https://gen.pollinations.ai",
};

afterEach(() => vi.unstubAllGlobals());

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

    it("strips caller credentials and passes through the agent response", async () => {
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
                    authorization: "Bearer caller-key",
                    cookie: "session=caller",
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
        "http",
        "rpc",
        "missing-result",
    ])("returns a generic failure for MCP %s errors", async (failure) => {
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
        expect(response.status).toBe(500);
        await expect(response.json()).resolves.toEqual({
            error: { message: "Code agent execution failed" },
        });
    });
});
