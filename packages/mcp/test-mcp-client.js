#!/usr/bin/env node
import assert from "node:assert/strict";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { fetchWithAuth } from "./src/utils/coreUtils.js";

const directory = path.dirname(fileURLToPath(import.meta.url));
const apiKey = process.env.POLLINATIONS_API_KEY;
let testBaseUrl = process.env.POLLINATIONS_BASE_URL;
let offlineServer;

if (!apiKey) {
    offlineServer = http.createServer((request, response) => {
        if (request.url !== "/api/models") {
            response.writeHead(404).end();
            return;
        }
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(JSON.stringify([{ name: "offline-test" }]));
    });
    await new Promise((resolve) =>
        offlineServer.listen(0, "127.0.0.1", resolve),
    );
    testBaseUrl = `http://127.0.0.1:${offlineServer.address().port}/api`;
}

const expectedTools = [
    "chatCompletion",
    "generateImage",
    "generateVideo",
    "getBalance",
    "getUsage",
    "listModels",
    "textToSpeech",
    "transcribeAudio",
];

function transport() {
    return new StdioClientTransport({
        command: "node",
        args: [path.join(directory, "src/index.js")],
        env: {
            ...process.env,
            ...(testBaseUrl ? { POLLINATIONS_BASE_URL: testBaseUrl } : {}),
            ...(apiKey ? { POLLINATIONS_API_KEY: apiKey } : {}),
        },
    });
}

async function connect(options = {}) {
    const client = new Client(
        { name: "mcp-smoke-test", version: "0.0.1" },
        { capabilities: {}, ...options },
    );
    await client.connect(transport());
    return client;
}

const results = [];
async function step(name, run) {
    try {
        await run();
        console.log(`[PASS] ${name}`);
        results.push(true);
    } catch (error) {
        console.log(`[FAIL] ${name} — ${error.message}`);
        results.push(false);
    }
}

const modern = await connect({ versionNegotiation: { mode: "auto" } });
let modernTools;
await step("modern protocol and eight tools", async () => {
    assert.equal(modern.getProtocolEra(), "modern");
    modernTools = (await modern.listTools()).tools;
    assert.deepEqual(modernTools.map(({ name }) => name).sort(), expectedTools);
});

await step("thin-proxy guidance", () => {
    assert.match(modern.getInstructions(), /Gen owns model aliases, defaults/);
    const tools = new Map(modernTools.map((tool) => [tool.name, tool]));
    assert.match(tools.get("listModels").description, /raw live Gen registry/);
    assert.match(tools.get("chatCompletion").description, /raw JSON response/);
});

await step("raw model discovery", async () => {
    const result = await modern.callTool({
        name: "listModels",
        arguments: {},
    });
    assert.match(result.content[0].text, /offline-test|openai/);
});

const legacy = await connect();
await step("legacy protocol and identical tools", async () => {
    assert.equal(legacy.getProtocolEra(), "legacy");
    assert.deepEqual((await legacy.listTools()).tools, modernTools);
});
await legacy.close();

if (!apiKey) {
    await step("caller cancellation", async () => {
        const controller = new AbortController();
        controller.abort();
        await assert.rejects(
            fetchWithAuth(`${testBaseUrl}/models`, {
                signal: controller.signal,
            }),
            { name: "AbortError" },
        );
    });
    console.log("Skipping live generation calls; set POLLINATIONS_API_KEY.");
} else {
    await step("live chat", async () => {
        const result = await modern.callTool({
            name: "chatCompletion",
            arguments: {
                model: "openai-fast",
                messages: [
                    { role: "user", content: "Reply with exactly: pong" },
                ],
            },
        });
        assert.match(result.content[0].text, /pong/i);
    });
    await step("live image URL", async () => {
        const result = await modern.callTool({
            name: "generateImage",
            arguments: {
                prompt: "a small red apple",
                model: "flux",
                width: 256,
                height: 256,
            },
        });
        assert.match(result.content[0].text, /pollinations\.ai\/image\//);
    });
    await step("live balance", async () => {
        const result = await modern.callTool({
            name: "getBalance",
            arguments: {},
        });
        assert.match(result.content[0].text, /balance/i);
    });
}

await modern.close();
if (offlineServer) {
    await new Promise((resolve) => offlineServer.close(resolve));
}

const passed = results.filter(Boolean).length;
console.log(`${passed}/${results.length} passed`);
process.exit(passed === results.length ? 0 : 1);
