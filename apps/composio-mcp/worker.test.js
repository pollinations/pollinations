import assert from "node:assert/strict";
import test from "node:test";
import {
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
            return new Response("Not found", { status: 404 });
        },
    });
    return { calls, env: { COMPOSIO_API_KEY: "test-key" }, worker };
}

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
    assert.equal(call.headers.get(MCP_USAGE_HEADERS.cost), "0.0004");
    assert.equal(call.headers.get(MCP_USAGE_HEADERS.adjustmentUnits), "2");
    const sessionRequest = calls.find(({ url }) =>
        url.pathname.endsWith("/tool_router/session"),
    );
    assert.deepEqual(JSON.parse(sessionRequest.init.body), {
        user_id: "user-1",
        manage_connections: {
            enable: true,
            enable_wait_for_connections: false,
            enable_connection_removal: false,
        },
        sandbox: { enable: false },
    });
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

test("includes toolkit names and logos with connected accounts", async () => {
    const requests = [];
    const worker = createWorker({
        fetchImpl: async (url, init) => {
            const parsed = new URL(url);
            requests.push({ url: parsed, init });
            if (parsed.pathname.endsWith("/connected_accounts")) {
                return Response.json({
                    items: [
                        {
                            id: "ca_github",
                            toolkit: { slug: "github" },
                            alias: "octocat",
                            status: "ACTIVE",
                        },
                    ],
                });
            }
            if (parsed.pathname.endsWith("/toolkits/multi")) {
                return Response.json({
                    items: [
                        {
                            slug: "github",
                            name: "GitHub",
                            meta: {
                                logo: "https://logos.composio.test/github",
                            },
                        },
                    ],
                });
            }
            return new Response("Not found", { status: 404 });
        },
    });

    const response = await worker.fetch(
        new Request("https://composio.internal/connections", {
            headers: { [MCP_USER_ID_HEADER]: "user-1" },
        }),
        { COMPOSIO_API_KEY: "test-key" },
    );

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
        data: [
            {
                id: "ca_github",
                toolkit: "github",
                name: "GitHub",
                logo: "https://logos.composio.test/github",
                alias: "octocat",
                status: "ACTIVE",
            },
        ],
    });
    assert.deepEqual(JSON.parse(requests[1].init.body), {
        toolkits: ["github"],
    });
});
