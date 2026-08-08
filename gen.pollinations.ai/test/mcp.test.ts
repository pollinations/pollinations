import {
    createExecutionContext,
    waitOnExecutionContext,
} from "cloudflare:test";
import { describe, expect, it } from "vitest";
import worker from "../src/index.ts";

function testEnv(): CloudflareBindings {
    return {
        ENTER: {
            fetch: async () => new Response("enter"),
        } as unknown as Fetcher,
        ENVIRONMENT: "test",
        LOG_LEVEL: "debug",
        LOG_FORMAT: "text",
    } as CloudflareBindings;
}

async function fetchWorker(host: string): Promise<Response> {
    const ctx = createExecutionContext();
    const response = await worker.fetch(
        new Request(`https://${host}/.well-known/oauth-protected-resource`),
        testEnv(),
        ctx,
    );
    await waitOnExecutionContext(ctx);
    return response;
}

async function postWorker(
    host: string,
    body: Record<string, unknown>,
): Promise<Response> {
    const ctx = createExecutionContext();
    const response = await worker.fetch(
        new Request(`https://${host}/`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        }),
        testEnv(),
        ctx,
    );
    await waitOnExecutionContext(ctx);
    return response;
}

describe("MCP protected-resource discovery", () => {
    it("publishes RFC 9728 metadata for the production gateway", async () => {
        const response = await fetchWorker("mcp.pollinations.ai");

        expect(response.status).toBe(200);
        expect(response.headers.get("Cache-Control")).toBe(
            "public, max-age=3600",
        );
        await expect(response.json()).resolves.toEqual({
            resource: "https://mcp.pollinations.ai",
            authorization_servers: ["https://enter.pollinations.ai"],
            bearer_methods_supported: ["header"],
            scopes_supported: ["mcp:tools"],
        });
    });

    it("uses the staging authorization server for the staging gateway", async () => {
        const response = await fetchWorker("staging.mcp.pollinations.ai");

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toMatchObject({
            resource: "https://staging.mcp.pollinations.ai",
            authorization_servers: ["https://staging.enter.pollinations.ai"],
        });
    });

    it("does not advertise MCP metadata on the Gen API hostname", async () => {
        const response = await fetchWorker("gen.pollinations.ai");

        expect(response.status).toBe(404);
    });

    it("challenges unauthenticated MCP requests with resource metadata", async () => {
        const response = await postWorker("mcp.pollinations.ai", {
            jsonrpc: "2.0",
            id: 1,
            method: "initialize",
            params: {},
        });

        expect(response.status).toBe(401);
        expect(response.headers.get("WWW-Authenticate")).toBe(
            'Bearer resource_metadata="https://mcp.pollinations.ai/.well-known/oauth-protected-resource", scope="mcp:tools"',
        );
    });
});
