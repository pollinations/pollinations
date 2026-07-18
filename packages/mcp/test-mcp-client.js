#!/usr/bin/env node
import path from "node:path";
/**
 * End-to-end smoke test for the Pollinations MCP server.
 *
 * Spawns the server over stdio, lists tools, and exercises a small live slice.
 *
 *   POLLINATIONS_API_KEY=sk_xxx npm run test
 */
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const KEY = process.env.POLLINATIONS_API_KEY;

const transport = new StdioClientTransport({
    command: "node",
    args: [path.join(__dirname, "src/index.js")],
    env: KEY ? { POLLINATIONS_API_KEY: KEY } : undefined,
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
    const expected = [
        "chatCompletion",
        "generateImage",
        "generateImageUrl",
        "generateVideo",
        "generateVideoUrl",
        "getBalance",
        "getUsage",
        "listModels",
        "respondAudio",
        "sayText",
    ];
    const actual = tools.map((tool) => tool.name).sort();
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(`unexpected tools: ${actual.join(", ")}`);
    }
    const byName = Object.fromEntries(tools.map((tool) => [tool.name, tool]));
    const videoRequired = byName.generateVideo.inputSchema.required || [];
    if (!videoRequired.includes("model")) {
        throw new Error("generateVideo.model must be required");
    }
    if (byName.chatCompletion.inputSchema.additionalProperties === false) {
        throw new Error(
            "chatCompletion must pass unknown Gen parameters through",
        );
    }
    return `${tools.length} tools`;
});

await step("listModels (unauthenticated)", () => call("listModels"));

if (!KEY) {
    console.log(
        "\nSkipping authenticated calls — set POLLINATIONS_API_KEY=sk_… to exercise the full path.",
    );
} else {
    await step("chatCompletion", async () => {
        const out = await call("chatCompletion", {
            messages: [
                {
                    role: "user",
                    content: "Reply with exactly: pong",
                },
            ],
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
}

await client.close();

const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} passed`);
process.exit(passed === results.length ? 0 : 1);
