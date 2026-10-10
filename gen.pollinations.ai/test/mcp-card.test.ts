import {
    createExecutionContext,
    waitOnExecutionContext,
} from "cloudflare:test";
import { MCP_SERVERS } from "@shared/registry/mcp.ts";
import { describe, expect, it } from "vitest";
import worker from "../src/index.ts";

const CARD_MEDIA_TYPE = "application/mcp-server-card+json";
// The origin follows the serving host, so staging cards point at staging.
const ORIGIN = "https://staging.gen.pollinations.ai";

async function fetchWorker(path: string, init: RequestInit = {}) {
    const ctx = createExecutionContext();
    const response = await worker.fetch(
        new Request(`${ORIGIN}${path}`, init),
        { ENVIRONMENT: "test" } as CloudflareBindings,
        ctx,
    );
    await waitOnExecutionContext(ctx);
    return response;
}

describe("SEP-2127 MCP Server Cards", () => {
    it("serves an AI Catalog listing a card for every hosted MCP server", async () => {
        const res = await fetchWorker("/.well-known/ai-catalog.json");
        expect(res.status).toBe(200);
        expect(res.headers.get("Content-Type")).toContain(
            "application/ai-catalog+json",
        );
        const catalog = (await res.json()) as {
            specVersion: string;
            entries: { identifier: string; type: string; url: string }[];
        };
        expect(catalog.specVersion).toBe("1.0");
        expect(catalog.entries).toEqual(
            MCP_SERVERS.map((server) => ({
                identifier: `urn:air:pollinations.ai:mcp:${server.id}`,
                type: CARD_MEDIA_TYPE,
                url: `${ORIGIN}/mcp/${server.id}/server-card`,
            })),
        );
    });

    it("serves a Server Card at the reserved /server-card location without an API key", async () => {
        const res = await fetchWorker("/mcp/pollinations/server-card");
        expect(res.status).toBe(200);
        expect(res.headers.get("Content-Type")).toContain(CARD_MEDIA_TYPE);
        const card = (await res.json()) as {
            $schema: string;
            version: string;
            remotes: {
                type: string;
                url: string;
                headers: { name: string }[];
            }[];
        };
        expect(card.$schema).toBe(
            "https://static.modelcontextprotocol.io/schemas/v1/server-card.schema.json",
        );
        expect(card.version).toMatch(/^\d+\.\d+\.\d+$/);
        const [remote] = card.remotes;
        expect(remote.type).toBe("streamable-http");
        expect(remote.url).toBe(`${ORIGIN}/mcp/pollinations`);
        expect(remote.headers.some((h) => h.name === "Authorization")).toBe(
            true,
        );
    });

    it("gives every card its MCP Registry name and a description within the schema limit", async () => {
        for (const server of MCP_SERVERS) {
            const res = await fetchWorker(`/mcp/${server.id}/server-card`);
            const card = (await res.json()) as {
                name: string;
                description: string;
            };
            expect(card.name).toBe(`io.github.pollinations/${server.id}`);
            expect(card.description.length).toBeLessThanOrEqual(100);
        }
    });

    it("returns 404 for an unknown server id", async () => {
        const res = await fetchWorker("/mcp/nope/server-card");
        expect(res.status).toBe(404);
    });

    it("honors If-None-Match with 304 and sends caching/CORS headers", async () => {
        const first = await fetchWorker("/mcp/pollinations/server-card");
        const etag = first.headers.get("ETag");
        expect(etag).toBeTruthy();
        expect(first.headers.get("Cache-Control")).toBe("public, max-age=3600");
        expect(first.headers.get("Access-Control-Allow-Origin")).toBe("*");

        const cached = await fetchWorker("/mcp/pollinations/server-card", {
            headers: { "If-None-Match": etag ?? "" },
        });
        expect(cached.status).toBe(304);

        const different = await fetchWorker("/mcp/pollinations/server-card", {
            headers: { "If-None-Match": '"stale"' },
        });
        expect(different.status).toBe(200);
    });
});
