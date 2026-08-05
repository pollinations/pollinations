#!/usr/bin/env node
import assert from "node:assert/strict";
import path from "node:path";
/**
 * End-to-end smoke test for the Pollinations MCP server.
 *
 * Spawns the server over stdio, lists tools, and exercises a small slice
 * (auth + a live text + image-URL call) using a sk_ key from env.
 *
 *   POLLINATIONS_API_KEY=sk_xxx npm run test
 */
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const KEY = process.env.POLLINATIONS_API_KEY;

const EXPECTED_TOOLS = [
    "analyzeVideo",
    "chatCompletion",
    "clearApiKey",
    "describeImage",
    "generateImage",
    "generateImageBatch",
    "generateImageUrl",
    "generateText",
    "generateVideo",
    "generateVideoUrl",
    "getBalance",
    "getKeyInfo",
    "getPricing",
    "getUsage",
    "listAudioVoices",
    "listImageModels",
    "listQuests",
    "listTextModels",
    "respondAudio",
    "sayText",
    "setApiKey",
    "transcribeAudio",
    "webSearch",
];

const createTransport = () =>
    new StdioClientTransport({
        command: "node",
        args: [path.join(__dirname, "pollinations-mcp.js")],
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

await step("listTextModels (unauthenticated)", () => call("listTextModels"));

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
    console.log(
        "\nSkipping authenticated calls — set POLLINATIONS_API_KEY=sk_… to exercise the full path.",
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

const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} passed`);
process.exit(passed === results.length ? 0 : 1);
