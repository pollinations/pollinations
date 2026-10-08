import { getPublicOrigin } from "@shared/public-origin.ts";
import { MCP_SERVERS, type McpServerDefinition } from "@shared/registry/mcp.ts";
import { type Context, Hono } from "hono";
import type { Env } from "@/env.ts";

// SEP-2127: MCP Server Cards - HTTP Server Discovery.
// https://modelcontextprotocol.io/seps/2127-mcp-server-cards
// Card discovery: AI Catalog at /.well-known/ai-catalog.json, cards hosted at
// the reserved <streamable-http-url>/server-card location.
const SERVER_CARD_MEDIA_TYPE = "application/mcp-server-card+json";
const AI_CATALOG_MEDIA_TYPE = "application/ai-catalog+json";
const SERVER_CARD_SCHEMA_URL =
    "https://static.modelcontextprotocol.io/schemas/v1/server-card.schema.json";

function etagFor(body: string): string {
    // Small deterministic content hash (FNV-1a) for ETag validation; the
    // card body is tiny and public, so cryptographic strength is not needed.
    let hash = 0x811c9dc5;
    for (let i = 0; i < body.length; i++) {
        hash ^= body.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
    }
    return `"${(hash >>> 0).toString(16).padStart(8, "0")}"`;
}

function cardResponse(
    c: Context<Env>,
    body: string,
    etag: string,
    mediaType: string,
): Response {
    if (c.req.header("If-None-Match") === etag) {
        return new Response(null, { status: 304, headers: { ETag: etag } });
    }
    return new Response(body, {
        headers: {
            "Content-Type": `${mediaType}; charset=utf-8`,
            "Cache-Control": "public, max-age=3600",
            ETag: etag,
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET",
            "Access-Control-Allow-Headers": "Content-Type, If-None-Match",
            "Access-Control-Expose-Headers": "ETag",
        },
    });
}

function buildServerCard(
    server: McpServerDefinition,
    origin: string,
): Record<string, unknown> {
    return {
        $schema: SERVER_CARD_SCHEMA_URL,
        name: `io.pollinations.mcp/${server.id}`,
        title: server.name,
        version: "1.0.0",
        description: server.description,
        websiteUrl: "https://pollinations.ai",
        remotes: [
            {
                type: "streamable-http",
                url: `${origin}/mcp/${server.id}`,
                headers: [
                    {
                        name: "Authorization",
                        description:
                            "Bearer API key from enter.pollinations.ai/keys. Keyless requests are rejected for these endpoints.",
                        isRequired: true,
                        isSecret: true,
                        value: "Bearer {apiKey}",
                        variables: {
                            apiKey: {
                                description: "Pollinations API key",
                                isRequired: true,
                                isSecret: true,
                            },
                        },
                    },
                ],
            },
        ],
    };
}

export const mcpCardRoutes = new Hono<Env>()
    .get("/mcp/:serverId/server-card", (c) => {
        const serverId = c.req.param("serverId");
        const server = MCP_SERVERS.find((s) => s.id === serverId);
        if (!server) {
            return c.json({ error: "MCP server not found" }, 404);
        }
        const origin = getPublicOrigin(c);
        const body = JSON.stringify(buildServerCard(server, origin), null, 2);
        return cardResponse(c, body, etagFor(body), SERVER_CARD_MEDIA_TYPE);
    })
    .get("/.well-known/ai-catalog.json", (c) => {
        const origin = getPublicOrigin(c);
        const catalog = {
            specVersion: "1.0",
            entries: MCP_SERVERS.map((server) => ({
                identifier: `urn:air:pollinations.ai:mcp:${server.id}`,
                type: SERVER_CARD_MEDIA_TYPE,
                url: `${origin}/mcp/${server.id}/server-card`,
            })),
        };
        const body = JSON.stringify(catalog, null, 2);
        return cardResponse(c, body, etagFor(body), AI_CATALOG_MEDIA_TYPE);
    });
