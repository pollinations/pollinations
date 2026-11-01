import { getPublicOrigin } from "@shared/public-origin.ts";
import {
    getMcpServerDefinition,
    type McpServerDefinition,
} from "@shared/registry/mcp.ts";
import { buildServerEntry } from "@shared/registry/mcp-server-json.ts";
import { type Context, Hono } from "hono";
import { etag } from "hono/etag";
import { HTTPException } from "hono/http-exception";
import type { Env } from "@/env.ts";

// SEP-2127: MCP Server Cards - HTTP Server Discovery.
// https://modelcontextprotocol.io/seps/2127-mcp-server-cards
// Cards live at the reserved <streamable-http-url>/server-card location; the
// AI Catalog at /.well-known/ai-catalog.json (well-known.ts) lists them.
export const SERVER_CARD_MEDIA_TYPE = "application/mcp-server-card+json";
const SERVER_CARD_SCHEMA_URL =
    "https://static.modelcontextprotocol.io/schemas/v1/server-card.schema.json";
const SERVER_CARD_VERSION = "1.0.0";
// The default server whose card also backs the well-known discovery alias.
const DEFAULT_SERVER_ID = "pollinations";

// A Server Card uses the server.json shape; only its $schema differs.
function buildServerCard(server: McpServerDefinition, origin: string) {
    return {
        ...buildServerEntry(server, SERVER_CARD_VERSION, origin),
        $schema: SERVER_CARD_SCHEMA_URL,
    };
}

function serverCardResponse(
    c: Context<Env>,
    server: McpServerDefinition,
): Response {
    c.header("Content-Type", `${SERVER_CARD_MEDIA_TYPE}; charset=utf-8`);
    c.header("Cache-Control", "public, max-age=3600");
    return c.body(
        JSON.stringify(buildServerCard(server, getPublicOrigin(c)), null, 2),
    );
}

export const mcpCardRoutes = new Hono<Env>()
    .get("/mcp/:serverId/server-card", etag(), (c) => {
        const server = getMcpServerDefinition(c.req.param("serverId"));
        if (!server) {
            throw new HTTPException(404, { message: "MCP server not found" });
        }
        return serverCardResponse(c, server);
    })
    // Discovery alias for the default server card. Some agent scanners look
    // for the card at this well-known path; the reserved per-server path
    // above stays the SEP-2127 location.
    .get("/.well-known/mcp/server-card.json", etag(), (c) => {
        const server = getMcpServerDefinition(DEFAULT_SERVER_ID);
        if (!server) {
            throw new HTTPException(500, {
                message: "Default MCP server not found",
            });
        }
        return serverCardResponse(c, server);
    });
