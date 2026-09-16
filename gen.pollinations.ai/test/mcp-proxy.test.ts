import { env, SELF } from "cloudflare:test";
import { signAgentRunToken } from "@shared/auth/agent-run-token.ts";
import { getUserBalance } from "@shared/billing/balance.ts";
import {
    MCP_AGENT_ID_HEADER,
    MCP_USAGE_HEADERS,
} from "@shared/registry/mcp.ts";
import { createTestApiKey, test } from "@shared/test/fixtures/index.ts";
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
                name: "Composio",
                description:
                    "Use Gmail, Slack, GitHub, Drive, and hundreds of other apps. Agents ask you to connect when needed.",
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
                    "A private persistent computer for each agent: files and a bash shell that survive between runs.",
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
                        {
                            name: "computer.port_request.v1",
                            label: "Port request",
                            kind: "tool_call",
                            price: "0.0002",
                            currency: "pollen",
                            quantity: 1,
                            unit: "request",
                        },
                        {
                            name: "computer.ssh_session.v1",
                            label: "SSH session",
                            kind: "tool_call",
                            price: "0.0002",
                            currency: "pollen",
                            quantity: 1,
                            unit: "session",
                        },
                    ],
                },
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
                [MCP_AGENT_ID_HEADER]: "spoofed-agent",
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
        user: { tierBalance: 1 },
    });
    const response = await SELF.fetch(
        "https://gen.pollinations.ai/mcp/computer",
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${key}`,
                Cookie: "session=private",
                "x-pollinations-user-id": "spoofed-user",
                [MCP_AGENT_ID_HEADER]: "spoofed-agent",
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
            content: [{ type: "text", text: `computer:${userId}:direct` }],
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

test("scopes Computer to the agent in a signed delegated run", async () => {
    const parent = await createTestApiKey({ user: { tierBalance: 1 } });
    const token = await signAgentRunToken({
        secret: env.BETTER_AUTH_SECRET,
        parentApiKeyId: parent.id,
        parentRequestId: crypto.randomUUID(),
        managedAgentId: "managed-agent-id",
    });
    const response = await SELF.fetch(
        "https://gen.pollinations.ai/mcp/computer",
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${token}`,
                [MCP_AGENT_ID_HEADER]: "spoofed-agent",
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
                {
                    type: "text",
                    text: `computer:${parent.userId}:managed-agent-id`,
                },
            ],
        },
    });
});

test("routes computer port requests to the caller's own computer and bills them", async () => {
    const { key, userId } = await createTestApiKey({
        user: { tierBalance: 1 },
    });
    const response = await SELF.fetch(
        "https://gen.pollinations.ai/computer/default/ports/8000/v1/responses?stream=false",
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${key}`,
                Cookie: "session=private",
                "x-pollinations-user-id": "spoofed-user",
            },
            body: "hello",
        },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
        path: "/workspaces/default/ports/8000/v1/responses?stream=false",
        user: userId,
        body: "hello",
    });
    for (const header of Object.values(MCP_USAGE_HEADERS)) {
        expect(response.headers.has(header)).toBe(false);
    }
    expect(await getUserBalance(drizzle(env.DB), userId)).toEqual({
        tierBalance: 0.9998,
        packBalance: 0,
    });
});

test("passes the computer SSH WebSocket through and bills the session", async () => {
    const { key, userId } = await createTestApiKey({
        user: { tierBalance: 1 },
    });
    const response = await SELF.fetch(
        "https://gen.pollinations.ai/computer/default/ssh",
        {
            headers: {
                Authorization: `Bearer ${key}`,
                Upgrade: "websocket",
            },
        },
    );

    expect(response.status).toBe(101);
    const socket = response.webSocket;
    if (!socket) throw new Error("Missing WebSocket");
    const banner = new Promise((resolve) =>
        socket.addEventListener("message", (event) => resolve(event.data)),
    );
    socket.accept();
    expect(await banner).toBe(`SSH-2.0-${userId}`);
    socket.close();
    expect(await getUserBalance(drizzle(env.DB), userId)).toEqual({
        tierBalance: 0.9998,
        packBalance: 0,
    });
});

test("requires authentication for computer ports", async () => {
    const response = await SELF.fetch(
        "https://gen.pollinations.ai/computer/default/ports/8000/",
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
