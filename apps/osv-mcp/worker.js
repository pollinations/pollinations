import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
    createMCPResponse,
    createTextContent,
} from "../../packages/mcp/src/utils/coreUtils.js";

function buildServer() {
    const server = new McpServer(
        { name: "osv-mcp", title: "OSV MCP", version: "0.1.0" },
        { capabilities: { tools: {} } },
    );
    server.registerTool(
        "osv_query",
        {
            description:
                "Look up known vulnerabilities for a package version in OSV. " +
                "Use OSV ecosystem names, such as npm, PyPI, Go, Maven or crates.io. " +
                "Returns OSV records and any next_page_token; pass that as pageToken with the same query to continue. " +
                "No matches means no known records, not proof that a package is safe.",
            inputSchema: z.object({
                ecosystem: z.string().trim().min(1).max(100),
                name: z.string().trim().min(1).max(500),
                version: z.string().trim().min(1).max(200),
                pageToken: z.string().min(1).max(4096).optional(),
            }),
            annotations: {
                readOnlyHint: true,
                idempotentHint: true,
                openWorldHint: true,
            },
        },
        async ({ ecosystem, name, version, pageToken }) => {
            const data = await fetchOsv("query", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    package: { ecosystem, name },
                    version,
                    page_token: pageToken,
                }),
            });
            return createMCPResponse([createTextContent(data, true)]);
        },
    );
    server.registerTool(
        "osv_vulnerability",
        {
            description:
                "Read a complete OSV advisory by id, including aliases, affected ranges, fix events and references. " +
                "OSV data describes known vulnerabilities; assess whether the affected code is reachable separately.",
            inputSchema: z.object({
                id: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/),
            }),
            annotations: {
                readOnlyHint: true,
                idempotentHint: true,
                openWorldHint: true,
            },
        },
        async ({ id }) =>
            createMCPResponse([
                createTextContent(
                    await fetchOsv(`vulns/${encodeURIComponent(id)}`),
                    true,
                ),
            ]),
    );
    return server;
}

async function fetchOsv(path, options = {}) {
    const response = await fetch(`https://api.osv.dev/v1/${path}`, {
        ...options,
        redirect: "manual",
        signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`OSV returned HTTP ${response.status}.`);
    return response.json();
}

const mcpHandler = createMcpHandler(() => buildServer(), {
    legacy: "stateless",
    onerror: (error) => console.error(error),
});

function readBearerToken(request) {
    const authorization = request.headers.get("authorization");
    if (!authorization) return null;

    const [scheme, token] = authorization.trim().split(/\s+/, 2);
    if (scheme?.toLowerCase() !== "bearer" || !token) {
        return null;
    }
    return token;
}

function unauthorizedResponse() {
    return Response.json(
        {
            error: "unauthorized",
            message: "Send a Pollinations API key as a bearer token.",
        },
        {
            status: 401,
            headers: {
                "WWW-Authenticate": 'Bearer realm="osv-mcp.pollinations.ai"',
            },
        },
    );
}

export default {
    async fetch(request) {
        const url = new URL(request.url);

        if (url.pathname === "/health" && request.method === "GET") {
            return Response.json({
                name: "osv-mcp",
                transport: "streamable-http",
                endpoint: "/",
                stateless: true,
            });
        }

        if (url.pathname !== "/") {
            return new Response("Not found", { status: 404 });
        }

        const token = readBearerToken(request);
        if (!token) return unauthorizedResponse();

        if (
            request.method === "POST" &&
            Array.isArray(
                await request
                    .clone()
                    .json()
                    .catch(() => null),
            )
        ) {
            return Response.json(
                {
                    error: "invalid_request",
                    message: "Batch requests are not supported.",
                },
                { status: 400 },
            );
        }

        return mcpHandler.fetch(request, {
            authInfo: {
                token,
                clientId: "pollinations-api-key",
                scopes: [],
            },
        });
    },
};
