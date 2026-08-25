import { getPublicOrigin } from "@shared/public-origin.ts";
import { getMcpServerDefinition, MCP_SERVERS } from "@shared/registry/mcp.ts";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Env } from "@/env.ts";
import { auth } from "@/middleware/auth.ts";
import { frontendKeyRateLimit } from "@/middleware/rate-limit-durable.ts";
import { edgeRateLimit } from "@/middleware/rate-limit-edge.ts";

function requestForMcp(request: Request): Request {
    const headers = new Headers(request.headers);
    headers.delete("cookie");
    const url = new URL(request.url);
    url.protocol = "https:";
    url.host = "mcp.internal";
    url.pathname = "/";
    return new Request(url, {
        method: request.method,
        headers,
        body:
            request.method === "GET" || request.method === "HEAD"
                ? undefined
                : request.body,
        redirect: "manual",
    });
}

function responseForCaller(response: Response): Response {
    return new Response(response.body, response);
}

export const mcpRoutes = new Hono<Env>()
    .use("/mcp", edgeRateLimit)
    .use("/mcp/*", edgeRateLimit)
    .get("/mcp", (c) =>
        c.json({
            data: MCP_SERVERS.map((server) => ({
                id: server.id,
                name: server.name,
                description: server.description,
                url: `${getPublicOrigin(c)}/mcp/${server.id}`,
            })),
        }),
    )
    .use("/mcp/:serverId", auth(), frontendKeyRateLimit)
    .all("/mcp/:serverId", async (c) => {
        c.var.auth.requireUser();
        if (
            c.req.method === "POST" &&
            Array.isArray(
                await c.req.raw
                    .clone()
                    .json()
                    .catch(() => null),
            )
        ) {
            throw new HTTPException(400, {
                message: "MCP batch requests are not supported",
            });
        }
        const serverId = c.req.param("serverId");
        const server = getMcpServerDefinition(serverId);
        if (!server) {
            throw new HTTPException(404, { message: "MCP server not found" });
        }
        const binding = c.env[server.binding] as Fetcher;

        const response = await binding.fetch(requestForMcp(c.req.raw));
        return responseForCaller(response);
    });
