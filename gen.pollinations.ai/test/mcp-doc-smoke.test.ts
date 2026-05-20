import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, expect, it, vi } from "vitest";
import worker from "../src/index.ts";

describe("docs include MCP", () => {
    it("inlines the MCP README in /docs/llm.txt", async () => {
        const ctx = createExecutionContext();
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response(JSON.stringify({ paths: {} }), {
                headers: { "Content-Type": "application/json" },
            }),
        );
        const env: CloudflareBindings = {
            ENTER: {
                fetch: async () =>
                    new Response(JSON.stringify({ paths: {} }), {
                        headers: { "Content-Type": "application/json" },
                    }),
            } as unknown as Fetcher,
            ENVIRONMENT: "test",
            LOG_LEVEL: "debug",
            LOG_FORMAT: "text",
        } as CloudflareBindings;
        const res = await worker.fetch(
            new Request("https://gen.pollinations.ai/docs/llm.txt"),
            env,
            ctx,
        );
        await waitOnExecutionContext(ctx);
        const body = await res.text();
        expect(res.status).toBe(200);
        expect(body).toMatch(/## MCP Server/);
        expect(body).toMatch(/pollinations\.ai MCP Server|@pollinations_ai\/mcp/);
        expect(body).toMatch(/Available Tools/);
    });
});
