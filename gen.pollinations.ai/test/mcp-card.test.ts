import { MCP_SERVERS } from "@shared/registry/mcp.ts";
import { describe, expect, it } from "vitest";
import { mcpCardRoutes } from "../src/routes/mcp-card.ts";

const CARD_MEDIA_TYPE = "application/mcp-server-card+json";

describe("SEP-2127 MCP Server Cards", () => {
    it("serves an AI Catalog listing a card for every hosted MCP server", async () => {
        const res = await mcpCardRoutes.request("/.well-known/ai-catalog.json");
        expect(res.status).toBe(200);
        expect(res.headers.get("Content-Type")).toContain(
            "application/ai-catalog+json",
        );
        const catalog = (await res.json()) as {
            specVersion: string;
            entries: {
                identifier: string;
                type: string;
                url: string;
            }[];
        };
        expect(catalog.specVersion).toBe("1.0");
        expect(catalog.entries).toHaveLength(MCP_SERVERS.length);
        for (const server of MCP_SERVERS) {
            const entry = catalog.entries.find(
                (e) =>
                    e.identifier === `urn:air:pollinations.ai:mcp:${server.id}`,
            );
            expect(entry, `catalog entry for ${server.id}`).toBeTruthy();
            expect(entry?.type).toBe(CARD_MEDIA_TYPE);
            expect(entry?.url).toBe(
                `http://localhost/mcp/${server.id}/server-card`,
            );
        }
    });

    it("serves a schema-valid Server Card at the reserved /server-card location", async () => {
        const res = await mcpCardRoutes.request(
            "/mcp/pollinations/server-card",
        );
        expect(res.status).toBe(200);
        expect(res.headers.get("Content-Type")).toContain(CARD_MEDIA_TYPE);
        const card = (await res.json()) as {
            $schema: string;
            name: string;
            version: string;
            description: string;
            remotes: {
                type: string;
                url: string;
                headers: { name: string }[];
            }[];
        };
        expect(card.$schema).toBe(
            "https://static.modelcontextprotocol.io/schemas/v1/server-card.schema.json",
        );
        // Reverse-DNS name: exactly one slash separating namespace from name.
        expect(card.name).toMatch(/^[a-zA-Z0-9.-]+\/[a-zA-Z0-9._-]+$/);
        expect(card.version).toMatch(/^\d+\.\d+\.\d+$/);
        expect(card.description.length).toBeGreaterThan(0);
        const [remote] = card.remotes;
        expect(remote.type).toBe("streamable-http");
        expect(remote.url).toBe("http://localhost/mcp/pollinations");
        expect(remote.headers.some((h) => h.name === "Authorization")).toBe(
            true,
        );
    });

    it("returns 404 for an unknown server id", async () => {
        const res = await mcpCardRoutes.request("/mcp/nope/server-card");
        expect(res.status).toBe(404);
    });

    it("honors If-None-Match with 304 and sends caching/CORS headers", async () => {
        const first = await mcpCardRoutes.request(
            "/mcp/pollinations/server-card",
        );
        const etag = first.headers.get("ETag");
        expect(etag).toBeTruthy();
        expect(first.headers.get("Cache-Control")).toContain("max-age=3600");
        expect(first.headers.get("Access-Control-Allow-Origin")).toBe("*");
        expect(first.headers.get("Access-Control-Expose-Headers")).toContain(
            "ETag",
        );

        const cached = await mcpCardRoutes.request(
            "/mcp/pollinations/server-card",
            { headers: { "If-None-Match": etag ?? "" } },
        );
        expect(cached.status).toBe(304);

        const different = await mcpCardRoutes.request(
            "/mcp/pollinations/server-card",
            { headers: { "If-None-Match": '"stale"' } },
        );
        expect(different.status).toBe(200);
    });

    it("reflects the requested origin, not a hardcoded host", async () => {
        const res = await mcpCardRoutes.request(
            "https://staging.gen.pollinations.ai/mcp/pollinations/server-card",
        );
        const card = (await res.json()) as {
            remotes: { url: string }[];
        };
        expect(card.remotes[0].url).toBe(
            "https://staging.gen.pollinations.ai/mcp/pollinations",
        );
    });
});
