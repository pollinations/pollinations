import { env, SELF } from "cloudflare:test";
import { getLogger } from "@logtape/logtape";
import { authenticateApiKeyRequest } from "@shared/auth/api-key.ts";
import { getUserBalance } from "@shared/billing/balance.ts";
import { createTestApiKey, test } from "@shared/test/fixtures/index.ts";
import { drizzle } from "drizzle-orm/d1";
import { expect } from "vitest";
import { authorizeMcpUsage, settleMcpUsage } from "@/routes/mcp.ts";

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
    const response = await SELF.fetch("https://gen.pollinations.ai/mcp");
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
    const response = await SELF.fetch(
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
    const response = await SELF.fetch(
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
    const response = await SELF.fetch(
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

test("usage-receipt servers authorize before the tool runs and settle the receipt once", async () => {
    const server = {
        id: "receipt-tool",
        name: "Receipt tool",
        description: "test-only usage-receipt server",
        binding: "POLLINATIONS_MCP",
        billing: "usage_receipt",
        provider: "test",
        eventType: "generate.text",
    } as const;
    const usage = {
        cost: 1.5,
        tool: "search",
        status: 200,
        adjustmentId: "search",
        adjustmentUnits: 1,
    };
    const callerFor = async (key: string) => {
        const caller = await authenticateApiKeyRequest({
            request: new Request(
                "https://gen.pollinations.ai/mcp/receipt-tool",
                {
                    headers: { Authorization: `Bearer ${key}` },
                },
            ),
            env,
        });
        if (!caller) throw new Error("test key did not authenticate");
        return caller;
    };
    // Analytics is one best-effort write after settlement; not awaited here.
    const background = () => undefined;
    const log = getLogger(["test"]);

    const { key, userId } = await createTestApiKey({
        user: { tierBalance: 0, packBalance: 10 },
    });
    const caller = await callerFor(key);
    const authorizationId = await authorizeMcpUsage(
        env,
        caller,
        crypto.randomUUID(),
        server,
    );
    await settleMcpUsage(
        env,
        caller,
        authorizationId,
        server,
        usage,
        log,
        background,
    );
    expect(await getUserBalance(drizzle(env.DB), userId)).toEqual({
        tierBalance: 0,
        packBalance: 8.5,
    });

    // The same receipt delivered again (retry, batch) settles nothing more.
    await settleMcpUsage(
        env,
        caller,
        authorizationId,
        server,
        usage,
        log,
        background,
    );
    expect(await getUserBalance(drizzle(env.DB), userId)).toEqual({
        tierBalance: 0,
        packBalance: 8.5,
    });

    // Callers with nothing left in either bucket are denied before the tool
    // ever runs.
    const broke = await createTestApiKey({
        user: { tierBalance: -1, packBalance: -1 },
    });
    await expect(
        authorizeMcpUsage(
            env,
            await callerFor(broke.key),
            crypto.randomUUID(),
            server,
        ),
    ).rejects.toMatchObject({ status: 402 });
});
