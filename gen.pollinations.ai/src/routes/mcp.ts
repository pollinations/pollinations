import { getPublicOrigin } from "@shared/public-origin.ts";
import { Hono } from "hono";
import type { Env } from "@/env.ts";

const MCP_SCOPE = "mcp:tools";

function isMcpOrigin(origin: string): boolean {
    return (
        origin === "https://mcp.pollinations.ai" ||
        origin === "https://staging.mcp.pollinations.ai"
    );
}

function authorizationServer(origin: string): string {
    return origin.replace(".mcp.", ".enter.");
}

export const mcpRoutes = new Hono<Env>().get(
    "/.well-known/oauth-protected-resource",
    (c) => {
        const resource = getPublicOrigin(c);
        if (!isMcpOrigin(resource)) return c.notFound();

        c.header("Cache-Control", "public, max-age=3600");
        return c.json({
            resource,
            authorization_servers: [authorizationServer(resource)],
            bearer_methods_supported: ["header"],
            scopes_supported: [MCP_SCOPE],
        });
    },
);
