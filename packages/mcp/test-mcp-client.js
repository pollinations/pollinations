#!/usr/bin/env node
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
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
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

const transport = new StdioClientTransport({
    command: "node",
    args: [path.join(__dirname, "pollinations-mcp.js")],
    env: testBaseUrl ? { POLLINATIONS_BASE_URL: testBaseUrl } : undefined,
});
const client = new Client(
    { name: "mcp-smoke-test", version: "0.0.1" },
    { capabilities: {} },
);

const results = [];
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

await client.connect(transport);

await step("listTools", async () => {
    const { tools } = await client.listTools();
    if (tools.length < 15) throw new Error(`only ${tools.length} tools`);
    if (!tools.some((tool) => tool.name === "listQuests")) {
        throw new Error("listQuests is not registered");
    }
    return `${tools.length} tools`;
});

await step("listTextModels (unauthenticated)", () => call("listTextModels"));

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
            prompt: "Reply with exactly: pong",
            model: "openai-fast",
        });
        if (!/pong/i.test(out)) throw new Error(`unexpected: ${trim(out)}`);
        return out;
    });
    await step("generateImageUrl", async () => {
        const out = await call("generateImageUrl", {
            prompt: "a small red apple",
            model: "flux",
            width: 256,
            height: 256,
        });
        if (!/pollinations\.ai/.test(out))
            throw new Error(`no URL: ${trim(out)}`);
        return out;
    });
    await step("getBalance", () => call("getBalance"));
    await step("listQuests", () => call("listQuests"));
    await step("clearApiKey", () => call("clearApiKey"));
}

await client.close();
if (offlineRegistryServer) {
    await new Promise((resolve) => offlineRegistryServer.close(resolve));
}

const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} passed`);
process.exit(passed === results.length ? 0 : 1);
