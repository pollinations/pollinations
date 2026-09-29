import { env, SELF } from "cloudflare:test";
import { createMCPClient } from "@ai-sdk/mcp";
import { signAgentRunToken } from "@shared/auth/agent-run-token.ts";
import { getUserBalance } from "@shared/billing/balance.ts";
import { apikey as apiKeyTable } from "@shared/db/better-auth.ts";
import { MCP_USAGE_HEADERS } from "@shared/registry/mcp.ts";
import { createTestApiKey, test } from "@shared/test/fixtures/index.ts";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { expect } from "vitest";

const MCP_REQUEST = {
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: {
        name: "listModels",
        arguments: {},
    },
};

async function callVault(
    key: string,
    name: "write" | "read" | "search",
    args: Record<string, unknown>,
    headers: Record<string, string> = {},
) {
    const response = await SELF.fetch(
        "https://gen.pollinations.ai/mcp/vault?key=spoofed-key&token=spoofed-token",
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${key}`,
                Cookie: "session=spoofed",
                "Content-Type": "application/json",
                Accept: "application/json, text/event-stream",
                ...headers,
            },
            body: JSON.stringify({
                jsonrpc: "2.0",
                id: crypto.randomUUID(),
                method: "tools/call",
                params: { name, arguments: args },
            }),
        },
    );
    return {
        response,
        body: (await response.json()) as {
            result?: { structuredContent?: { data?: Record<string, unknown> } };
        },
    };
}

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
                pricing: {
                    description:
                        "Generation tools use each selected model's listed rate. Discovery and account tools are free.",
                    rates: [],
                },
            },
            {
                id: "ask-jev",
                name: "Ask Jev",
                description:
                    "Evaluate state with typed choice, score, and probability questions.",
                url: "https://gen.pollinations.ai/mcp/ask-jev",
                pricing: {
                    description:
                        "Decision tools use Jev's listed model rate. No additional MCP fee.",
                    rates: [],
                },
            },
            {
                id: "ffmpeg",
                name: "FFmpeg",
                description:
                    "Trim, convert, resize, compress, and remix audio and video.",
                url: "https://gen.pollinations.ai/mcp/ffmpeg",
                pricing: {
                    rates: [
                        {
                            name: "cloudflare.container.basic_runtime.v1",
                            label: "Runtime",
                            kind: "compute",
                            price: "0.00000778",
                            currency: "pollen",
                            quantity: 1,
                            unit: "second",
                        },
                    ],
                },
            },
            {
                id: "exa",
                name: "Exa Search",
                description:
                    "Search the live web and fetch clean content from source pages.",
                url: "https://gen.pollinations.ai/mcp/exa",
                pricing: {
                    rates: [
                        {
                            name: "exa.search.v1",
                            label: "Search",
                            kind: "search_request",
                            price: "0.007",
                            currency: "pollen",
                            quantity: 1,
                            unit: "request",
                            suffix: "up to 10 results",
                        },
                        {
                            name: "exa.contents.text.v1",
                            label: "Fetch",
                            kind: "page",
                            price: "0.001",
                            currency: "pollen",
                            quantity: 1,
                            unit: "page",
                        },
                    ],
                },
            },
            {
                id: "composio",
                name: "Connected Apps",
                description:
                    "Read Gmail, search GitHub, update Sheets, and post to Slack through Composio. Each user connects their own accounts when needed.",
                url: "https://gen.pollinations.ai/mcp/composio",
                pricing: {
                    description: "Launch price",
                    rates: [
                        {
                            name: "composio.tool_call.v1",
                            label: "Tool call",
                            kind: "tool_call",
                            price: "0.0002",
                            currency: "pollen",
                            quantity: 1,
                            unit: "call",
                        },
                    ],
                },
            },
            {
                id: "computer",
                name: "Computer",
                description:
                    "A private persistent computer: files and a bash shell that survive between runs.",
                url: "https://gen.pollinations.ai/mcp/computer",
                pricing: {
                    description: "Preview price",
                    rates: [
                        {
                            name: "computer.tool_call.v1",
                            label: "Tool call",
                            kind: "tool_call",
                            price: "0.0002",
                            currency: "pollen",
                            quantity: 1,
                            unit: "call",
                        },
                    ],
                },
            },
            {
                id: "vault",
                name: "Vault",
                description:
                    "Store and retrieve private memory for the authenticated account.",
                url: "https://gen.pollinations.ai/mcp/vault",
                pricing: { rates: [] },
            },
        ],
    });
});

test("proxies Vault through the real service binding with the hosted MCP client", async () => {
    const { key } = await createTestApiKey({
        memoryPermissions: ["read", "write"],
    });
    const client = await createMCPClient({
        clientName: "vault-gateway-test",
        transport: {
            type: "http",
            url: "https://gen.pollinations.ai/mcp/vault",
            headers: { Authorization: `Bearer ${key}` },
            fetch: (input, init) =>
                SELF.fetch(input, { ...init, redirect: "follow" }),
        },
    });
    try {
        expect(Object.keys(await client.tools()).sort()).toEqual([
            "read",
            "search",
            "write",
        ]);
    } finally {
        await client.close();
    }
});

test("denies Vault discovery without an explicit memory grant", async () => {
    const { key } = await createTestApiKey();
    const response = await SELF.fetch("https://gen.pollinations.ai/mcp/vault", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "tools/list",
        }),
    });
    expect(response.status).toBe(403);
});

test("denies Vault to publishable keys even with stored memory fields", async () => {
    const published = await createTestApiKey({
        type: "publishable",
        memoryPermissions: null,
    });
    await drizzle(env.DB)
        .update(apiKeyTable)
        .set({ permissions: JSON.stringify({ memory: ["read", "write"] }) })
        .where(eq(apiKeyTable.id, published.id));

    const response = await SELF.fetch("https://gen.pollinations.ai/mcp/vault", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${published.key}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "tools/list",
        }),
    });
    expect(response.status).toBe(403);
});

test("bounds a streaming Vault request before forwarding", async () => {
    const { key } = await createTestApiKey({ memoryPermissions: ["write"] });
    const response = await Promise.race([
        SELF.fetch("https://gen.pollinations.ai/mcp/vault", {
            method: "POST",
            headers: { Authorization: `Bearer ${key}` },
            body: new ReadableStream({
                start(controller) {
                    controller.enqueue(new Uint8Array(131_073));
                    controller.close();
                },
            }),
        }),
        new Promise<never>((_, reject) =>
            setTimeout(
                () => reject(new Error("Vault request did not settle")),
                1_000,
            ),
        ),
    ]);
    expect(response.status).toBe(413);
});

test("enforces Vault permissions and identity through the real gateway binding", async () => {
    const writer = await createTestApiKey({
        memoryPermissions: ["read", "write"],
    });
    const reader = await createTestApiKey({
        userId: writer.userId,
        memoryPermissions: ["read"],
    });
    const node = {
        idempotencyKey: "gateway-writer",
        nodes: [
            {
                id: "gateway-node",
                name: "Gateway Node",
                text: "private vault test",
                aliases: [],
                expectedVersion: 0,
            },
        ],
        relations: [],
    };
    expect((await callVault(writer.key, "write", node)).response.status).toBe(
        200,
    );

    const sameUserRead = await callVault(reader.key, "read", {
        ids: ["gateway-node"],
    });
    expect(sameUserRead.response.status).toBe(200);
    expect(sameUserRead.body.result?.structuredContent?.data?.nodes).toEqual([
        expect.objectContaining({ id: "gateway-node" }),
    ]);
    const sameUserSearch = await callVault(reader.key, "search", {
        query: "private vault",
    });
    expect(sameUserSearch.body.result?.structuredContent?.data?.nodes).toEqual(
        expect.arrayContaining([
            expect.objectContaining({ id: "gateway-node" }),
        ]),
    );

    const agentCommand = {
        ...node,
        idempotencyKey: "stable-agent-receipt",
        nodes: [
            {
                ...node.nodes[0],
                id: "agent-node",
                expectedVersion: 0,
            },
        ],
    };
    const agentOne = await signAgentRunToken({
        secret: env.BETTER_AUTH_SECRET,
        parentApiKeyId: writer.id,
        parentRequestId: crypto.randomUUID(),
        managedAgentId: "stable-agent",
    });
    const agentTwo = await signAgentRunToken({
        secret: env.BETTER_AUTH_SECRET,
        parentApiKeyId: writer.id,
        parentRequestId: crypto.randomUUID(),
        managedAgentId: "stable-agent",
    });
    const firstReceipt = await callVault(agentOne, "write", agentCommand);
    const renewedReceipt = await callVault(agentTwo, "write", agentCommand);
    expect(firstReceipt.response.status).toBe(200);
    expect(renewedReceipt.body.result?.structuredContent?.data).toEqual(
        firstReceipt.body.result?.structuredContent?.data,
    );
    expect(
        (await callVault(agentTwo, "read", { ids: ["gateway-node"] })).body
            .result?.structuredContent?.data?.nodes,
    ).toEqual([expect.objectContaining({ id: "gateway-node" })]);

    const otherUser = await createTestApiKey({ memoryPermissions: ["read"] });
    const isolated = await callVault(
        otherUser.key,
        "read",
        { ids: ["gateway-node"] },
        {
            "x-pollinations-user-id": writer.userId,
            "x-pollinations-vault-actor": JSON.stringify([writer.id, null]),
            "x-pollinations-vault-permissions": JSON.stringify(["read"]),
        },
    );
    expect(isolated.body.result?.structuredContent?.data?.nodes).toEqual([]);
    expect(isolated.body.result?.structuredContent?.data?.missingIds).toEqual([
        "gateway-node",
    ]);

    expect((await callVault(reader.key, "write", node)).response.status).toBe(
        403,
    );
    await drizzle(env.DB)
        .update(apiKeyTable)
        .set({ enabled: false })
        .where(eq(apiKeyTable.id, reader.id));
    expect(
        (await callVault(reader.key, "read", { ids: ["gateway-node"] }))
            .response.status,
    ).toBe(401);
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

test("routes Ask Jev with caller authorization without an extra MCP debit", async () => {
    const { key, userId } = await createTestApiKey({
        user: { tierBalance: 1 },
    });
    const payload = {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
            name: "jev_decide",
            arguments: {
                state: "The invoice is paid.",
                questions: {
                    paid: { type: "noul", instructions: "Is it paid?" },
                },
            },
        },
    };
    const response = await SELF.fetch(
        "https://gen.pollinations.ai/mcp/ask-jev",
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${key}`,
                Cookie: "session=private",
                "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
        },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
        pathname: "/",
        authorization: `Bearer ${key}`,
        cookie: null,
        payload,
    });
    expect(await getUserBalance(drizzle(env.DB), userId)).toEqual({
        tierBalance: 1,
        packBalance: 0,
    });
});

test.for([
    "pollinations",
    "ask-jev",
])("requires a Pollinations credential before invoking %s", async (serverId) => {
    const response = await SELF.fetch(
        `https://gen.pollinations.ai/mcp/${serverId}`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(MCP_REQUEST),
        },
    );
    expect(response.status).toBe(401);
});

test("proxies FFmpeg without caller credentials and bills reported usage", async () => {
    const { key, userId } = await createTestApiKey({
        user: { tierBalance: 1 },
    });
    const response = await SELF.fetch(
        "https://gen.pollinations.ai/mcp/ffmpeg",
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
            content: [{ type: "text", text: "ffmpeg proxied" }],
        },
    });
    for (const header of Object.values(MCP_USAGE_HEADERS)) {
        expect(response.headers.has(header)).toBe(false);
    }
    expect(await getUserBalance(drizzle(env.DB), userId)).toEqual({
        tierBalance: 0.75,
        packBalance: 0,
    });
});

test("proxies Exa without caller credentials and bills reported usage", async () => {
    const { key, userId } = await createTestApiKey({
        user: { tierBalance: 1 },
    });
    const response = await SELF.fetch("https://gen.pollinations.ai/mcp/exa", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${key}`,
            Cookie: "session=private",
            "Content-Type": "application/json",
        },
        body: JSON.stringify(MCP_REQUEST),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
        jsonrpc: "2.0",
        id: 1,
        result: {
            content: [{ type: "text", text: "exa proxied" }],
        },
    });
    for (const header of Object.values(MCP_USAGE_HEADERS)) {
        expect(response.headers.has(header)).toBe(false);
    }
    expect(await getUserBalance(drizzle(env.DB), userId)).toEqual({
        tierBalance: 0.993,
        packBalance: 0,
    });
});

test("routes Composio with the authenticated user", async () => {
    const { key, userId } = await createTestApiKey();
    const response = await SELF.fetch(
        "https://gen.pollinations.ai/mcp/composio",
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${key}`,
                Cookie: "session=private",
                "x-pollinations-user-id": "spoofed-user",
                "Content-Type": "application/json",
            },
            body: JSON.stringify(MCP_REQUEST),
        },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
        jsonrpc: "2.0",
        id: 1,
        result: { content: [{ type: "text", text: userId }] },
    });
});

test("routes Computer with the authenticated user and bills the flat call rate", async () => {
    const { key, userId } = await createTestApiKey({
        user: { tierBalance: 1, githubId: 583231, githubUsername: "octocat" },
    });
    const response = await SELF.fetch(
        "https://gen.pollinations.ai/mcp/computer",
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${key}`,
                Cookie: "session=private",
                "x-pollinations-user-id": "spoofed-user",
                "x-pollinations-user-github": "1+spoofed",
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
            content: [
                { type: "text", text: `computer:${userId}:583231+octocat` },
            ],
        },
    });
    for (const header of Object.values(MCP_USAGE_HEADERS)) {
        expect(response.headers.has(header)).toBe(false);
    }
    expect(await getUserBalance(drizzle(env.DB), userId)).toEqual({
        tierBalance: 0.9998,
        packBalance: 0,
    });
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

test("bills FFmpeg MCP usage when authorized with an ag_ run token", async () => {
    const parent = await createTestApiKey({
        user: { tierBalance: 1 },
    });
    const token = await signAgentRunToken({
        secret: env.BETTER_AUTH_SECRET,
        parentApiKeyId: parent.id,
        parentRequestId: crypto.randomUUID(),
    });

    const response = await SELF.fetch(
        "https://gen.pollinations.ai/mcp/ffmpeg",
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${token}`,
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
            content: [{ type: "text", text: "ffmpeg proxied" }],
        },
    });
    for (const header of Object.values(MCP_USAGE_HEADERS)) {
        expect(response.headers.has(header)).toBe(false);
    }
    expect(await getUserBalance(drizzle(env.DB), parent.userId)).toEqual({
        tierBalance: 0.75,
        packBalance: 0,
    });
});
