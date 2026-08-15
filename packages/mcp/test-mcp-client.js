#!/usr/bin/env node
import assert from "node:assert/strict";
import http from "node:http";
import path from "node:path";
/**
 * End-to-end smoke test for the Pollinations MCP server.
 *
 * Spawns the server over stdio and tests tool/model listing without external
 * network access.
 * With a sk_ key from env, also exercises a small live slice.
 *
 *   POLLINATIONS_API_KEY=sk_xxx npm run test
 */
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { fetchWithAuth } from "./src/utils/coreUtils.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const KEY = process.env.POLLINATIONS_API_KEY;
const BASE_URL = process.env.POLLINATIONS_BASE_URL;

let offlineRegistryServer;
let testBaseUrl = BASE_URL;
if (!KEY) {
    offlineRegistryServer = http.createServer((req, res) => {
        if (
            req.url !== "/api/text/models" ||
            req.headers.authorization !== undefined
        ) {
            res.writeHead(404);
            res.end();
            return;
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify([{ name: "offline-test" }]));
    });
    await new Promise((resolve) =>
        offlineRegistryServer.listen(0, "127.0.0.1", resolve),
    );
    const address = offlineRegistryServer.address();
    testBaseUrl = `http://127.0.0.1:${address.port}/api`;
}

const EXPECTED_TOOLS = [
    "clearApiKey",
    "createEmbeddings",
    "generate3D",
    "generateAudio",
    "generateImage",
    "generateText",
    "generateVideo",
    "getBalance",
    "getKeyInfo",
    "getModelStatus",
    "listModels",
    "setApiKey",
];

const createTransport = () =>
    new StdioClientTransport({
        command: "node",
        args: [path.join(__dirname, "pollinations-mcp.js")],
        env: testBaseUrl ? { POLLINATIONS_BASE_URL: testBaseUrl } : undefined,
    });

async function connectClient(options = {}) {
    const client = new Client(
        { name: "mcp-smoke-test", version: "0.0.1" },
        { capabilities: {}, ...options },
    );
    await client.connect(createTransport());
    return client;
}

const results = [];
let modernTools;
const trim = (s, n = 200) => {
    const str = typeof s === "string" ? s : JSON.stringify(s);
    return str.length > n ? `${str.slice(0, n)}…` : str;
};

async function step(name, fn) {
    try {
        const detail = await fn();
        console.log(`[PASS] ${name}${detail ? ` — ${trim(detail)}` : ""}`);
        results.push(true);
    } catch (e) {
        console.log(`[FAIL] ${name} — ${e.message}`);
        results.push(false);
    }
}

async function call(name, args = {}) {
    const res = await client.callTool({ name, arguments: args });
    if (res.isError) {
        throw new Error(res.content?.[0]?.text || "tool error");
    }
    return res.content?.[0]?.text;
}

const client = await connectClient({
    versionNegotiation: { mode: "auto" },
});

await step("modern protocol negotiation", () => {
    const era = client.getProtocolEra();
    if (era !== "modern") throw new Error(`expected modern, received ${era}`);
    return era;
});

await step("modern listTools", async () => {
    const { tools } = await client.listTools();
    modernTools = tools;
    const actual = tools.map(({ name }) => name).sort();
    if (JSON.stringify(actual) !== JSON.stringify(EXPECTED_TOOLS)) {
        throw new Error(`unexpected tools: ${actual.join(", ")}`);
    }
    return `${tools.length} tools`;
});

await step("listModels (unauthenticated)", () =>
    call("listModels", { type: "text" }),
);

const legacyClient = await connectClient();
await step("legacy protocol fallback", async () => {
    const era = legacyClient.getProtocolEra();
    if (era !== "legacy") throw new Error(`expected legacy, received ${era}`);
    const { tools } = await legacyClient.listTools();
    const actual = tools.map(({ name }) => name).sort();
    if (JSON.stringify(actual) !== JSON.stringify(EXPECTED_TOOLS)) {
        throw new Error(`unexpected tools: ${actual.join(", ")}`);
    }
    assert.deepEqual(tools, modernTools);
    return `${era}, ${tools.length} tools`;
});
await legacyClient.close();

if (!KEY) {
    await step("fetchWithAuth respects caller cancellation", async () => {
        const controller = new AbortController();
        controller.abort();

        try {
            await fetchWithAuth(`${testBaseUrl}/text/models`, {
                signal: controller.signal,
            });
        } catch (error) {
            if (error.name === "AbortError") return "aborted";
            throw error;
        }
        throw new Error("request ignored the caller's abort signal");
    });

    console.log(
        "\nSkipping live calls — set POLLINATIONS_API_KEY=sk_… to exercise the full path.",
    );
} else {
    await step("setApiKey", () => call("setApiKey", { key: KEY }));
    await step("getKeyInfo", () => call("getKeyInfo"));
    await step("generateText", async () => {
        const out = await call("generateText", {
            messages: [{ role: "user", content: "Reply with exactly: pong" }],
            model: "openai-fast",
        });
        if (!/pong/i.test(out)) throw new Error(`unexpected: ${trim(out)}`);
        return out;
    });
    await step("generateImage (url)", async () => {
        const result = await client.callTool({
            name: "generateImage",
            arguments: {
                prompt: "a small red apple",
                model: "flux",
                size: "256x256",
                response_format: "url",
            },
        });
        const link = result.content?.find(
            (part) => part.type === "resource_link",
        );
        if (!link || !/pollinations\.ai/.test(link.uri)) {
            throw new Error(`no resource link: ${trim(result.content)}`);
        }
        return link.uri;
    });
    await step("getBalance", () => call("getBalance"));
    await step("clearApiKey", () => call("clearApiKey"));
}

await client.close();
if (offlineRegistryServer) {
    await new Promise((resolve) => offlineRegistryServer.close(resolve));
}

const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} passed`);
process.exit(passed === results.length ? 0 : 1);
