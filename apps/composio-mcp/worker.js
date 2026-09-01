import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { withMcpUsageHeaders } from "../../shared/mcp-usage.ts";
import {
    COMPOSIO_TOOL_CALL_PRICE,
    MCP_SERVERS,
    MCP_TOOLKIT_HEADER,
    MCP_USER_ID_HEADER,
} from "../../shared/registry/mcp.ts";

const COMPOSIO_API_URL = "https://backend.composio.dev/api/v3.1";
const COMPOSIO_TOOL_CALL_RATE = "composio.tool_call.v1";
const SPECIALIZED_TOOLKITS = new Set(
    MCP_SERVERS.filter(({ binding }) => binding === "COMPOSIO_MCP")
        .map(({ toolkit }) => toolkit)
        .filter(Boolean),
);

class ComposioFailure extends Error {
    constructor(status, message, cost = 0) {
        super(message);
        this.status = status;
        this.cost = cost;
    }
}

function requireUserId(request) {
    const userId = request.headers.get(MCP_USER_ID_HEADER);
    if (!userId) throw new ComposioFailure(401, "Missing Pollinations user");
    return userId;
}

function selectedToolkit(request) {
    const toolkit = request.headers.get(MCP_TOOLKIT_HEADER);
    if (toolkit && !SPECIALIZED_TOOLKITS.has(toolkit)) {
        throw new ComposioFailure(404, "MCP server not found");
    }
    return toolkit;
}

async function callComposio(path, env, fetchImpl, init = {}) {
    if (!env.COMPOSIO_API_KEY) {
        throw new ComposioFailure(500, "Composio API key is not configured");
    }
    const headers = new Headers(init.headers);
    headers.set("x-api-key", env.COMPOSIO_API_KEY);
    if (init.body) headers.set("Content-Type", "application/json");
    let response;
    try {
        response = await fetchImpl(`${COMPOSIO_API_URL}${path}`, {
            ...init,
            headers,
        });
    } catch {
        throw new ComposioFailure(502, "Composio request failed");
    }
    const body = await response.json().catch(() => null);
    if (!response.ok) {
        const error = body?.error;
        throw new ComposioFailure(
            response.status >= 500 ? 502 : response.status,
            body?.message ||
                (typeof error === "string" ? error : error?.message) ||
                `Composio returned HTTP ${response.status}`,
        );
    }
    return body;
}

async function listConnections(userId, env, fetchImpl) {
    const params = new URLSearchParams({
        user_ids: userId,
        statuses: "ACTIVE",
        limit: "100",
    });
    const body = await callComposio(
        `/connected_accounts?${params}`,
        env,
        fetchImpl,
    );
    return Array.isArray(body?.items) ? body.items : [];
}

function connectionSummary(account) {
    return {
        id: account.id,
        toolkit: account.toolkit?.slug,
        alias: account.alias || null,
        status: account.status,
    };
}

async function listToolkits(env, fetchImpl) {
    const params = new URLSearchParams({
        managed_by: "composio",
        sort_by: "usage",
        limit: "20",
    });
    const body = await callComposio(`/toolkits?${params}`, env, fetchImpl);
    const items = Array.isArray(body?.items) ? body.items : [];
    return items
        .filter((toolkit) => !toolkit.no_auth)
        .map((toolkit) => ({
            slug: toolkit.slug,
            name: toolkit.name,
            description: toolkit.meta?.description || "",
            logo: toolkit.meta?.logo || null,
        }));
}

function createSession(
    userId,
    toolkits,
    env,
    fetchImpl,
    manageConnections = false,
) {
    const config = {
        user_id: userId,
        manage_connections: manageConnections
            ? {
                  enable: true,
                  enable_wait_for_connections: false,
                  enable_connection_removal: false,
              }
            : { enable: false },
        sandbox: { enable: false },
    };
    if (toolkits.length) config.toolkits = { enable: toolkits };
    return callComposio("/tool_router/session", env, fetchImpl, {
        method: "POST",
        body: JSON.stringify(config),
    });
}

async function createConnectionLink(
    userId,
    toolkit,
    callbackUrl,
    env,
    fetchImpl,
) {
    const session = await createSession(userId, [toolkit], env, fetchImpl);
    return callComposio(
        `/tool_router/session/${encodeURIComponent(session.session_id)}/link`,
        env,
        fetchImpl,
        {
            method: "POST",
            body: JSON.stringify({
                toolkit,
                callback_url: callbackUrl,
            }),
        },
    );
}

async function deleteConnection(userId, connectionId, env, fetchImpl) {
    const params = new URLSearchParams({
        user_ids: userId,
        connected_account_ids: connectionId,
    });
    const body = await callComposio(
        `/connected_accounts?${params}`,
        env,
        fetchImpl,
    );
    if (!body?.items?.some((account) => account.id === connectionId)) {
        throw new ComposioFailure(404, "Connection not found");
    }
    await callComposio(
        `/connected_accounts/${encodeURIComponent(connectionId)}`,
        env,
        fetchImpl,
        { method: "DELETE" },
    );
}

async function findTools(toolkit, query, env, fetchImpl) {
    const params = new URLSearchParams({
        toolkit_slug: toolkit,
        query,
        limit: "10",
    });
    const body = await callComposio(`/tools?${params}`, env, fetchImpl);
    const tools = Array.isArray(body?.items) ? body.items : [];
    return tools.map((tool) => ({
        tool: tool.slug,
        description: tool.description || tool.human_description,
        arguments: tool.input_parameters,
    }));
}

async function executeTool(userId, toolkit, tool, args, env, fetchImpl) {
    if (!tool.startsWith(`${toolkit.toUpperCase()}_`)) {
        throw new ComposioFailure(400, `Unknown ${toolkit} tool`);
    }
    const body = await callComposio(
        `/tools/execute/${encodeURIComponent(tool)}`,
        env,
        fetchImpl,
        {
            method: "POST",
            body: JSON.stringify({
                user_id: userId,
                version: "latest",
                arguments: args,
            }),
        },
    );
    if (body?.successful === false) {
        throw new ComposioFailure(
            422,
            body.error || "Connected app tool failed",
            COMPOSIO_TOOL_CALL_PRICE,
        );
    }
    return body;
}

function textResult(value) {
    return {
        content: [
            {
                type: "text",
                text: typeof value === "string" ? value : JSON.stringify(value),
            },
        ],
    };
}

async function runBilled(reportUsage, tool, run) {
    try {
        const result = await run();
        reportUsage({
            cost: COMPOSIO_TOOL_CALL_PRICE,
            tool,
            status: 200,
            adjustmentId: COMPOSIO_TOOL_CALL_RATE,
            adjustmentUnits: 1,
        });
        return result;
    } catch (error) {
        const failure =
            error instanceof ComposioFailure
                ? error
                : new ComposioFailure(502, "Connected app tool failed");
        reportUsage({
            cost: failure.cost,
            tool,
            status: failure.status,
            adjustmentId: COMPOSIO_TOOL_CALL_RATE,
            adjustmentUnits: failure.cost > 0 ? 1 : 0,
            error: failure.message,
        });
        throw failure;
    }
}

function buildSpecializedServer(userId, toolkit, env, fetchImpl, reportUsage) {
    const toolNamespace = toolkit.replaceAll("-", "_");
    const findToolName = `find_${toolNamespace}_tools`;
    const runToolName = `run_${toolNamespace}_tool`;
    const server = new McpServer(
        { name: `pollinations-${toolkit}-mcp`, version: "0.1.0" },
        {
            instructions: `Use ${toolkit} on behalf of the current Pollinations user. Find the right action, inspect its arguments, then run it.`,
            capabilities: { tools: {} },
        },
    );

    server.registerTool(
        findToolName,
        {
            description: `Find ${toolkit} actions for a task. Returns action names, descriptions, and arguments.`,
            inputSchema: z.object({ query: z.string().min(1) }),
        },
        async ({ query }) =>
            textResult(await findTools(toolkit, query, env, fetchImpl)),
    );

    server.registerTool(
        runToolName,
        {
            description: `Run an action returned by ${findToolName} using the current user's connected ${toolkit} account.`,
            inputSchema: z.object({
                tool: z.string().min(1),
                arguments: z.record(z.string(), z.unknown()).default({}),
            }),
        },
        ({ tool, arguments: args }) =>
            runBilled(reportUsage, tool, async () =>
                textResult(
                    await executeTool(
                        userId,
                        toolkit,
                        tool,
                        args,
                        env,
                        fetchImpl,
                    ),
                ),
            ),
    );
    return server;
}

function encodeSession(sessionId, transportSessionId) {
    return btoa(JSON.stringify([sessionId, transportSessionId || null]))
        .replaceAll("+", "-")
        .replaceAll("/", "_")
        .replace(/=+$/, "");
}

function decodeSession(value) {
    try {
        const encoded = value.replaceAll("-", "+").replaceAll("_", "/");
        const [sessionId, transportSessionId] = JSON.parse(
            atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, "=")),
        );
        if (typeof sessionId !== "string") throw new Error();
        return {
            sessionId,
            transportSessionId:
                typeof transportSessionId === "string"
                    ? transportSessionId
                    : undefined,
        };
    } catch {
        throw new ComposioFailure(400, "Invalid MCP session");
    }
}

async function createRouterSession(userId, env, fetchImpl) {
    return createSession(userId, [], env, fetchImpl, true);
}

async function loadRouterSession(userId, sessionId, env, fetchImpl) {
    const session = await callComposio(
        `/tool_router/session/${encodeURIComponent(sessionId)}`,
        env,
        fetchImpl,
    );
    if (session?.config?.user_id !== userId) {
        throw new ComposioFailure(403, "MCP session belongs to another user");
    }
    return session;
}

function routerUsage(payload, status) {
    if (
        payload?.method !== "tools/call" ||
        payload?.params?.name !== "COMPOSIO_MULTI_EXECUTE_TOOL" ||
        status < 200 ||
        status >= 300
    ) {
        return undefined;
    }
    const tools = payload.params.arguments?.tools;
    const units = Array.isArray(tools) ? Math.max(1, tools.length) : 1;
    return {
        cost: units * COMPOSIO_TOOL_CALL_PRICE,
        tool: payload.params.name,
        status,
        adjustmentId: COMPOSIO_TOOL_CALL_RATE,
        adjustmentUnits: units,
    };
}

async function proxyRouter(request, userId, payload, env, fetchImpl) {
    const incomingSession = request.headers.get("mcp-session-id");
    let session;
    let transportSessionId;
    if (payload?.method === "initialize") {
        session = await createRouterSession(userId, env, fetchImpl);
    } else {
        if (!incomingSession) {
            throw new ComposioFailure(400, "Missing MCP session");
        }
        const decoded = decodeSession(incomingSession);
        session = await loadRouterSession(
            userId,
            decoded.sessionId,
            env,
            fetchImpl,
        );
        transportSessionId = decoded.transportSessionId;
    }
    if (!session?.session_id || !session?.mcp?.url) {
        throw new ComposioFailure(502, "Composio session has no MCP endpoint");
    }

    const headers = new Headers(request.headers);
    headers.set("x-api-key", env.COMPOSIO_API_KEY);
    headers.delete(MCP_TOOLKIT_HEADER);
    headers.delete(MCP_USER_ID_HEADER);
    if (transportSessionId) {
        headers.set("mcp-session-id", transportSessionId);
    } else {
        headers.delete("mcp-session-id");
    }
    let response;
    try {
        response = await fetchImpl(session.mcp.url, {
            method: request.method,
            headers,
            body:
                request.method === "GET" || request.method === "HEAD"
                    ? undefined
                    : request.body,
            redirect: "manual",
        });
    } catch {
        throw new ComposioFailure(502, "Composio MCP request failed");
    }
    const result = withMcpUsageHeaders(
        new Response(response.body, response),
        routerUsage(payload, response.status),
    );
    result.headers.set(
        "mcp-session-id",
        encodeSession(
            session.session_id,
            response.headers.get("mcp-session-id") || transportSessionId,
        ),
    );
    return result;
}

function jsonError(error) {
    const failure =
        error instanceof ComposioFailure
            ? error
            : new ComposioFailure(500, "Connected apps request failed");
    return Response.json(
        { error: "connected_apps_error", message: failure.message },
        { status: failure.status },
    );
}

async function handleManagement(request, userId, env, fetchImpl) {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/connections") {
        return Response.json({
            data: (await listConnections(userId, env, fetchImpl)).map(
                connectionSummary,
            ),
        });
    }
    if (request.method === "GET" && url.pathname === "/toolkits") {
        return Response.json({
            data: await listToolkits(env, fetchImpl),
        });
    }
    if (request.method === "POST" && url.pathname === "/connections") {
        const body = await request.json();
        const link = await createConnectionLink(
            userId,
            body.toolkit,
            body.callbackUrl,
            env,
            fetchImpl,
        );
        return Response.json({ redirectUrl: link.redirect_url });
    }
    const connectionMatch = url.pathname.match(/^\/connections\/([^/]+)$/);
    if (request.method === "DELETE" && connectionMatch) {
        await deleteConnection(
            userId,
            decodeURIComponent(connectionMatch[1]),
            env,
            fetchImpl,
        );
        return new Response(null, { status: 204 });
    }
    return new Response("Not found", { status: 404 });
}

export function createWorker({ fetchImpl }) {
    return {
        async fetch(request, env) {
            try {
                const userId = requireUserId(request);
                const url = new URL(request.url);
                if (url.pathname !== "/") {
                    return await handleManagement(
                        request,
                        userId,
                        env,
                        fetchImpl,
                    );
                }
                const toolkit = selectedToolkit(request);
                const payload = await request
                    .clone()
                    .json()
                    .catch(() => null);
                if (!toolkit) {
                    return await proxyRouter(
                        request,
                        userId,
                        payload,
                        env,
                        fetchImpl,
                    );
                }

                let usage;
                const handler = createMcpHandler(
                    () =>
                        buildSpecializedServer(
                            userId,
                            toolkit,
                            env,
                            fetchImpl,
                            (reportedUsage) => {
                                usage = reportedUsage;
                            },
                        ),
                    { onerror: (error) => console.error(error) },
                );
                const response = await handler.fetch(request);
                const body = await response.arrayBuffer();
                return withMcpUsageHeaders(new Response(body, response), usage);
            } catch (error) {
                return jsonError(error);
            }
        },
    };
}
