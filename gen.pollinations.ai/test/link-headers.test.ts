import {
    createExecutionContext,
    waitOnExecutionContext,
} from "cloudflare:test";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import type { Env } from "../src/env.ts";
import worker from "../src/index.ts";
import {
    AGENT_DISCOVERY_LINKS,
    agentDiscoveryLinks,
} from "../src/middleware/agent-discovery.ts";

async function fetchWorker(
    path: string,
    init: RequestInit = {},
): Promise<Response> {
    const ctx = createExecutionContext();
    const response = await worker.fetch(
        new Request(`https://staging.gen.pollinations.ai${path}`, init),
        {
            ENTER: {
                fetch: async () => new Response("enter"),
            } as unknown as Fetcher,
            ENVIRONMENT: "test",
            LOG_LEVEL: "debug",
            LOG_FORMAT: "text",
        } as CloudflareBindings,
        ctx,
    );
    await waitOnExecutionContext(ctx);
    return response;
}

describe("agent discovery Link headers", () => {
    it("advertises the machine entry points on the landing and docs pages", async () => {
        for (const path of ["/", "/docs"]) {
            for (const method of ["GET", "HEAD"]) {
                const response = await fetchWorker(path, { method });
                expect(response.status).toBe(200);
                expect(response.headers.get("Link")).toBe(
                    AGENT_DISCOVERY_LINKS,
                );
                await response.body?.cancel();
            }
        }
    });

    it("appends to an existing Link header instead of replacing it", async () => {
        const app = new Hono<Env>();
        app.use("*", agentDiscoveryLinks());
        app.get("/", (c) => {
            c.header("Link", '<https://example.com/hint>; rel="describedby"');
            return c.text("ok");
        });

        const response = await app.request(
            "https://staging.gen.pollinations.ai/",
        );

        expect(response.headers.get("Link")).toBe(
            `<https://example.com/hint>; rel="describedby", ${AGENT_DISCOVERY_LINKS}`,
        );
    });

    it("leaves machine endpoints and redirects alone", async () => {
        for (const path of ["/llms.txt", "/docs/llm.txt", "/docs/"]) {
            const response = await fetchWorker(path);
            expect(response.headers.get("Link")).toBeNull();
            await response.body?.cancel();
        }
    });
});
