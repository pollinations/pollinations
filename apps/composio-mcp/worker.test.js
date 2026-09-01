import assert from "node:assert/strict";
import test from "node:test";
import {
    Client,
    StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import {
    MCP_TOOLKIT_HEADER,
    MCP_USAGE_HEADERS,
    MCP_USER_ID_HEADER,
} from "../../shared/registry/mcp.ts";
import { createWorker } from "./worker.js";

function createHarness() {
    const calls = [];
    const worker = createWorker({
        fetchImpl: async (url, init) => {
            const parsed = new URL(url);
            calls.push({ url: parsed, init });
            assert.equal(
                new Headers(init.headers).get("x-api-key"),
                "test-key",
            );

            if (parsed.pathname.endsWith("/connected_accounts")) {
                return Response.json({
                    items: [
                        {
                            id: "ca_github",
                            toolkit: { slug: "github" },
                            status: "ACTIVE",
                        },
                    ],
                });
            }
            if (
                parsed.pathname.endsWith("/tool_router/session") &&
                init.method === "POST"
            ) {
                return Response.json({
                    session_id: "trs_user_1",
                    mcp: {
                        url: "https://app.composio.test/tool_router/v3/trs_user_1/mcp",
                    },
                });
            }
            if (parsed.pathname.endsWith("/tool_router/session/trs_user_1")) {
                return Response.json({
                    session_id: "trs_user_1",
                    mcp: {
                        url: "https://app.composio.test/tool_router/v3/trs_user_1/mcp",
                    },
                    config: { user_id: "user-1" },
                });
            }
            if (parsed.host === "app.composio.test") {
                const payload = await new Response(init.body).json();
                const headers = new Headers({
                    "Content-Type": "application/json",
                    "mcp-session-id": "upstream-session",
                });
                if (payload.method === "initialize") {
                    return Response.json(
                        {
                            jsonrpc: "2.0",
                            id: payload.id,
                            result: {
                                protocolVersion: "2025-06-18",
                                capabilities: { tools: {} },
                                serverInfo: {
                                    name: "composio",
                                    version: "1.0.0",
                                },
                            },
                        },
                        { headers },
                    );
                }
                return Response.json(
                    {
                        jsonrpc: "2.0",
                        id: payload.id,
                        result: {
                            content: [{ type: "text", text: "executed" }],
                        },
                    },
                    { headers },
                );
            }

            if (parsed.pathname.endsWith("/tools")) {
                return Response.json({
                    items: [
                        {
                            slug: "GITHUB_CREATE_AN_ISSUE",
                            toolkit: { slug: "github" },
                            description: "Create an issue",
                            input_parameters: {
                                owner: { type: "string", required: true },
                            },
                        },
                    ],
                });
            }
            if (parsed.pathname.includes("/tools/execute/")) {
                return Response.json({ successful: true, data: { id: 42 } });
            }
            return new Response("Not found", { status: 404 });
        },
    });
    return { calls, env: { COMPOSIO_API_KEY: "test-key" }, worker };
}

async function connect(worker, env, toolkit, responses = []) {
    const client = new Client(
        { name: "composio-mcp-test", version: "0.0.1" },
        { capabilities: {} },
    );
    const transport = new StreamableHTTPClientTransport(
        new URL("https://composio.internal"),
        {
            fetch: async (input, init) => {
                const original =
                    input instanceof Request ? input : new Request(input, init);
                const headers = new Headers(original.headers);
                headers.set(MCP_USER_ID_HEADER, "user-1");
                headers.set(MCP_TOOLKIT_HEADER, toolkit);
                const response = await worker.fetch(
                    new Request(original, { headers }),
                    env,
                );
                responses.push(response.clone());
                return response;
            },
        },
    );
    await client.connect(transport);
    return client;
}

test("exposes only GitHub-scoped discovery and execution tools", async () => {
    const { calls, env, worker } = createHarness();
    const client = await connect(worker, env, "github");
    const { tools } = await client.listTools();
    assert.deepEqual(
        tools.map(({ name }) => name),
        ["find_github_tools", "run_github_tool"],
    );

    const result = await client.callTool({
        name: "find_github_tools",
        arguments: { query: "create an issue" },
    });
    assert.match(result.content[0].text, /GITHUB_CREATE_AN_ISSUE/);
    assert.equal(calls[0].url.searchParams.get("toolkit_slug"), "github");
    await client.close();
});

test("executes only tools belonging to the selected toolkit and reports usage", async () => {
    const { env, worker } = createHarness();
    const responses = [];
    const client = await connect(worker, env, "github", responses);
    const result = await client.callTool({
        name: "run_github_tool",
        arguments: {
            tool: "GITHUB_CREATE_AN_ISSUE",
            arguments: { owner: "pollinations" },
        },
    });
    assert.match(result.content[0].text, /"id":42/);
    assert.equal(
        responses.at(-1).headers.get(MCP_USAGE_HEADERS.cost),
        "0.0005",
    );
    assert.equal(
        responses.at(-1).headers.get(MCP_USAGE_HEADERS.adjustmentId),
        "composio.tool_call.v1",
    );
    await client.close();
});

test("rejects a tool from another connected app", async () => {
    const { env, worker } = createHarness();
    const client = await connect(worker, env, "github");
    const result = await client.callTool({
        name: "run_github_tool",
        arguments: { tool: "DISCORD_SEND_MESSAGE", arguments: {} },
    });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /Unknown github tool/);
    await client.close();
});

test("thin-proxies the generic Composio router and reports executed actions", async () => {
    const { calls, env, worker } = createHarness();
    const initialize = await worker.fetch(
        new Request("https://composio.internal", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                [MCP_USER_ID_HEADER]: "user-1",
            },
            body: JSON.stringify({
                jsonrpc: "2.0",
                id: 1,
                method: "initialize",
                params: {
                    protocolVersion: "2025-06-18",
                    capabilities: {},
                    clientInfo: { name: "test", version: "1" },
                },
            }),
        }),
        env,
    );
    assert.equal(initialize.status, 200);
    const sessionId = initialize.headers.get("mcp-session-id");
    assert.ok(sessionId);

    const call = await worker.fetch(
        new Request("https://composio.internal", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                [MCP_USER_ID_HEADER]: "user-1",
                "mcp-session-id": sessionId,
            },
            body: JSON.stringify({
                jsonrpc: "2.0",
                id: 2,
                method: "tools/call",
                params: {
                    name: "COMPOSIO_MULTI_EXECUTE_TOOL",
                    arguments: {
                        tools: [
                            { slug: "GITHUB_CREATE_AN_ISSUE", arguments: {} },
                            { slug: "GITHUB_ADD_A_COMMENT", arguments: {} },
                        ],
                    },
                },
            }),
        }),
        env,
    );
    assert.equal(call.status, 200);
    assert.equal(call.headers.get(MCP_USAGE_HEADERS.cost), "0.001");
    assert.equal(call.headers.get(MCP_USAGE_HEADERS.adjustmentUnits), "2");
    const proxiedCalls = calls.filter(
        ({ url }) => url.host === "app.composio.test",
    );
    assert.equal(proxiedCalls.length, 2);
    assert.equal(
        new Headers(proxiedCalls[0].init.headers).get("x-api-key"),
        "test-key",
    );
    assert.equal(
        new Headers(proxiedCalls[1].init.headers).get("mcp-session-id"),
        "upstream-session",
    );
});

test("creates a hosted connection link with the current session contract", async () => {
    const requests = [];
    const worker = createWorker({
        fetchImpl: async (url, init) => {
            requests.push({ url: new URL(url), init });
            if (new URL(url).pathname.endsWith("/tool_router/session")) {
                return Response.json({ session_id: "trs_user_1" });
            }
            return Response.json({ redirect_url: "https://connect.example" });
        },
    });
    const response = await worker.fetch(
        new Request("https://composio.internal/connections", {
            method: "POST",
            headers: {
                "content-type": "application/json",
                [MCP_USER_ID_HEADER]: "user-1",
            },
            body: JSON.stringify({
                toolkit: "googledrive",
                callbackUrl: "https://staging.enter.pollinations.ai/account",
            }),
        }),
        { COMPOSIO_API_KEY: "test-key" },
    );

    assert.equal(response.status, 200);
    assert.deepEqual(JSON.parse(requests[0].init.body), {
        user_id: "user-1",
        toolkits: { enable: ["googledrive"] },
        manage_connections: { enable: false },
        sandbox: { enable: false },
    });
    assert.deepEqual(await response.json(), {
        redirectUrl: "https://connect.example",
    });
});
