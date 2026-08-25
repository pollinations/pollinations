import {
    createExecutionContext,
    env,
    waitOnExecutionContext,
} from "cloudflare:test";
import { getUserBalance } from "@shared/billing/balance.ts";
import { createTestApiKey, test } from "@shared/test/fixtures/index.ts";
import { drizzle } from "drizzle-orm/d1";
import { expect } from "vitest";
import worker from "../src/index.ts";

// Enter's gateway is an RPC binding; the test env carries the real one.
async function fetchWorker(url: string, init?: RequestInit): Promise<Response> {
    const ctx = createExecutionContext();
    const response = await worker.fetch(new Request(url, init), env, ctx);
    await waitOnExecutionContext(ctx);
    return response;
}

const MCP_REQUEST = {
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: {
        name: "listModels",
        arguments: {},
    },
};

test("lists the MCP servers exposed through Gen", async () => {
    const response = await fetchWorker("https://gen.pollinations.ai/mcp");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
        data: [
            {
                id: "pollinations",
                name: "Pollinations",
                description:
                    "Access Pollinations models and API capabilities through agent tools.",
                url: "https://gen.pollinations.ai/mcp/pollinations",
            },
        ],
    });
});

test("routes Pollinations MCP with caller authorization for downstream billing", async () => {
    const { key, userId } = await createTestApiKey({
        user: { tierBalance: 1 },
    });
    const response = await fetchWorker(
        "https://gen.pollinations.ai/mcp/pollinations",
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${key}`,
                Cookie: "session=private",
                "Content-Type": "application/json",
            },
            body: JSON.stringify(MCP_REQUEST),
        },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
        jsonrpc: "2.0",
        id: 1,
        result: {
            content: [{ type: "text", text: "pollinations proxied" }],
        },
    });
    expect(await getUserBalance(drizzle(env.DB), userId)).toEqual({
        tierBalance: 1,
        packBalance: 0,
    });
});

test("requires a Pollinations credential before invoking an MCP server", async () => {
    const response = await fetchWorker(
        "https://gen.pollinations.ai/mcp/pollinations",
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(MCP_REQUEST),
        },
    );
    expect(response.status).toBe(401);
});

test("rejects MCP batch requests at the proxy", async () => {
    const { key } = await createTestApiKey();
    const response = await fetchWorker(
        "https://gen.pollinations.ai/mcp/pollinations",
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${key}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify([MCP_REQUEST]),
        },
    );

    expect(response.status).toBe(400);
});
