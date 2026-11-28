import {
    createExecutionContext,
    waitOnExecutionContext,
} from "cloudflare:test";
import { describe, expect, it } from "vitest";
import worker from "../src/index.ts";

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

describe("agents.md", () => {
    it("serves imperative agent instructions as markdown", async () => {
        const response = await fetchWorker("/AGENTS.md");

        expect(response.status).toBe(200);
        expect(response.headers.get("Content-Type")).toBe(
            "text/markdown; charset=utf-8",
        );
        expect(response.headers.get("Cache-Control")).toBe(
            "public, max-age=3600",
        );

        const body = await response.text();
        expect(body).toMatch(/^# Pollinations\n/);
        // Absolute URLs follow the serving origin, like llms.txt, so a staging
        // agent is never sent to production.
        expect(body).toContain("https://staging.gen.pollinations.ai/v1/models");
        expect(body).not.toMatch(/\$\{origin\}/);
    });

    it("covers the decisions an agent needs after a failed call", async () => {
        const body = await (await fetchWorker("/AGENTS.md")).text();

        for (const fact of [
            "POLLINATIONS_API_KEY",
            "https://enter.pollinations.ai/keys",
            "/api/x402/keys/0.50",
            "WWW-Authenticate",
            "INSUFFICIENT_BALANCE",
            "KEY_BUDGET_EXHAUSTED",
            "Retry-After",
            "output_token_limit_exceeded",
            "shared cache",
            "/.well-known/agent-skills/index.json",
            "/.well-known/oauth-protected-resource",
            "/mcp",
        ]) {
            expect(body).toContain(fact);
        }
    });
});
