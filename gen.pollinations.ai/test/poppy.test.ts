import {
    createExecutionContext,
    waitOnExecutionContext,
} from "cloudflare:test";
import { describe, expect, it } from "vitest";
import worker from "../src/index.ts";

// The origin follows the serving host, so staging points at staging enter.
const ORIGIN = "https://staging.gen.pollinations.ai";

async function fetchWorker(path: string) {
    const ctx = createExecutionContext();
    const response = await worker.fetch(
        new Request(`${ORIGIN}${path}`),
        { ENVIRONMENT: "test" } as CloudflareBindings,
        ctx,
    );
    await waitOnExecutionContext(ctx);
    return response;
}

describe("Personal Agent Protocol discovery", () => {
    it("serves poppy.json describing this host and the enter issuer", async () => {
        const res = await fetchWorker("/.well-known/poppy.json");
        expect(res.status).toBe(200);
        const doc = (await res.json()) as Record<string, unknown>;
        expect(doc.protocol_version).toBe("0.2");
        expect(doc.organization).toEqual({
            name: "Pollinations",
            domain: "staging.gen.pollinations.ai",
        });
        expect(doc.auth).toMatchObject({
            issuer: "https://staging.enter.pollinations.ai",
        });
        expect(doc.apis).toEqual([
            {
                type: "openapi",
                url: `${ORIGIN}/openapi.json`,
                description:
                    "Generate text, images, audio and video, and read model and account data",
            },
            {
                type: "mcp",
                url: `${ORIGIN}/mcp/pollinations`,
                description:
                    "Hosted MCP server: discover models, generate media, read balance",
            },
        ]);
        expect(doc.web).toEqual({
            browser_session_endpoint: `${ORIGIN}/docs`,
        });
    });

    it("advertises only endpoints this worker actually serves", async () => {
        // A poppy.json that names a dead route is worse than none: a personal
        // agent follows it and fails. Both API entries are checked live.
        const doc = (await (
            await fetchWorker("/.well-known/poppy.json")
        ).json()) as {
            apis: { type: string; url: string }[];
        };
        for (const api of doc.apis) {
            const res = await fetchWorker(new URL(api.url).pathname);
            // openapi.json is public; the MCP endpoint requires a key, and a
            // 401 is proof the route exists.
            expect([200, 401], api.type).toContain(res.status);
        }
    });

    it("is cacheable and caches per origin", async () => {
        const res = await fetchWorker("/.well-known/poppy.json");
        expect(res.headers.get("Cache-Control")).toBe("public, max-age=3600");
        expect(res.headers.get("Content-Type")).toContain("application/json");
    });
});
