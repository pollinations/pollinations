import { env, SELF } from "cloudflare:test";
import { getUserBalance } from "@shared/billing/balance.ts";
import { MCP_USAGE_HEADERS } from "@shared/registry/mcp.ts";
import { createTestApiKey, test } from "@shared/test/fixtures/index.ts";
import { drizzle } from "drizzle-orm/d1";
import { expect } from "vitest";

const MCP_REQUEST = {
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: {
        name: "runFfmpeg",
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
                    "Generate text, images, audio, video, embeddings, and 3D assets with Pollinations.",
                url: "https://gen.pollinations.ai/mcp/pollinations",
            },
            {
                id: "ffmpeg",
                name: "FFmpeg",
                description:
                    "Run FFmpeg against public HTTPS media and return hosted outputs.",
                url: "https://gen.pollinations.ai/mcp/ffmpeg",
            },
            {
                id: "browser",
                name: "Browser",
                description:
                    "Fetch rendered web pages as Markdown, screenshots, or PDFs.",
                url: "https://gen.pollinations.ai/mcp/browser",
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
        "https://gen.pollinations.ai/mcp/ffmpeg",
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(MCP_REQUEST),
        },
    );
    expect(response.status).toBe(401);
});

test("proxies MCP unchanged, strips credentials and usage headers, and bills reported cost", async () => {
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
                Accept: "application/json, text/event-stream",
            },
            body: JSON.stringify(MCP_REQUEST),
        },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
        jsonrpc: "2.0",
        id: 1,
        result: { content: [{ type: "text", text: "proxied" }] },
    });
    for (const header of Object.values(MCP_USAGE_HEADERS)) {
        expect(response.headers.has(header)).toBe(false);
    }
    expect(await getUserBalance(drizzle(env.DB), userId)).toEqual({
        tierBalance: 0.75,
        packBalance: 0,
    });
});

test("rate limits publishable keys using the reported MCP cost", async () => {
    const { key } = await createTestApiKey({
        type: "publishable",
        user: { tierBalance: 1 },
    });
    const request = () =>
        SELF.fetch("https://gen.pollinations.ai/mcp/ffmpeg", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${key}`,
                "CF-Connecting-IP": "203.0.113.42",
                "Content-Type": "application/json",
            },
            body: JSON.stringify(MCP_REQUEST),
        });

    expect((await request()).status).toBe(200);
    const blocked = await request();
    expect(blocked.status).toBe(429);
    expect(await blocked.json()).toMatchObject({
        error: "Rate limit exceeded",
    });
});

test("does not bill protocol negotiation without usage metadata", async () => {
    const { key, userId } = await createTestApiKey({
        user: { tierBalance: 1 },
    });
    const response = await SELF.fetch(
        "https://gen.pollinations.ai/mcp/ffmpeg",
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${key}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                jsonrpc: "2.0",
                id: 1,
                method: "initialize",
                params: {},
            }),
        },
    );

    expect(response.status).toBe(200);
    expect(await getUserBalance(drizzle(env.DB), userId)).toEqual({
        tierBalance: 1,
        packBalance: 0,
    });
});

test("routes Browser MCP and bills its measured runtime", async () => {
    const { key, userId } = await createTestApiKey({
        user: { tierBalance: 1 },
    });
    const response = await SELF.fetch(
        "https://gen.pollinations.ai/mcp/browser",
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${key}`,
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
            content: [{ type: "text", text: "browser proxied" }],
        },
    });
    const balance = await getUserBalance(drizzle(env.DB), userId);
    expect(balance.tierBalance).toBeCloseTo(1 - 0.000025);
    expect(balance.packBalance).toBe(0);
});
