import assert from "node:assert/strict";
import { before, test } from "node:test";
import { gzipSync } from "node:zlib";
import { Miniflare } from "miniflare";
import { transform } from "sucrase";
import { buildCodeAgentModules } from "./code-agent-sdk.mjs";

let modules;
before(async () => {
    const { runtimeModule, sdkModules } = await buildCodeAgentModules();
    modules = { "runtime.mjs": runtimeModule, ...sdkModules };
});

test("prebundles the full pinned SDK into one Worker-compatible module", () => {
    assert.deepEqual(Object.keys(modules), [
        "runtime.mjs",
        "ai",
        "@ai-sdk/openai-compatible",
    ]);
    const compressedBytes = gzipSync(Object.values(modules).join("\n")).length;
    // Leave room for the platform helper, while catching accidental Node or
    // dependency duplication before multiplying this artifact across agents.
    assert.ok(
        compressedBytes < 300_000,
        `SDK bundle: ${compressedBytes} gzip bytes`,
    );
});

test("runs normal SDK imports, provider requests, tools, and timers in workerd", async () => {
    const agentSource = `
import { generateText, ToolLoopAgent, stepCountIs, jsonSchema, tool } from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

export default async ({ request }: { request: Request }) => {
    const echo = tool({
        description: "Echo a value",
        inputSchema: jsonSchema({
            type: "object",
            properties: { value: { type: "string" } },
            required: ["value"],
        }),
        execute: async ({ value }) => value,
    });
    let providerRequest;
    const provider = createOpenAICompatible({
        name: "pollinations",
        baseURL: "https://provider.test/v1",
        fetch: async (url, init) => {
            providerRequest = { url, body: JSON.parse(init.body) };
            return Response.json({
                id: "chatcmpl-sdk-packaging",
                object: "chat.completion",
                created: 0,
                model: "openai",
                choices: [{
                    index: 0,
                    message: { role: "assistant", content: "SDK works" },
                    finish_reason: "stop",
                }],
                usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 },
            });
        },
    });
    const model = provider("openai");
    const agent = new ToolLoopAgent({ model, tools: { echo }, stopWhen: stepCountIs(1) });
    const result = await generateText({ model, prompt: "hello", maxRetries: 0 });
    await new Promise((resolve) => setTimeout(resolve, 1));
    return Response.json({
        text: result.text,
        tokens: result.usage.totalTokens,
        tool: await echo.execute({ value: "echoed" }),
        agent: typeof agent.generate,
        providerRequest,
        authorization: request.headers.get("authorization"),
        cookie: request.headers.get("cookie"),
    });
};`;
    const worker = new Miniflare({
        compatibilityDate: "2026-04-01",
        modulesRoot: "/",
        bindings: { POLLINATIONS_BASE_URL: "https://gen.pollinations.ai" },
        modules: Object.entries({
            "index.mjs": `
import agent from "./agent.mjs";
import createCodeAgentWorker from "./runtime.mjs";
export default createCodeAgentWorker(agent);`,
            "agent.mjs": transform(agentSource, {
                transforms: ["typescript"],
                disableESTransforms: true,
            }).code,
            ...modules,
        }).map(([name, contents]) => ({
            type: "ESModule",
            path: `/${name}`,
            contents,
        })),
    });
    try {
        const response = await worker.dispatchFetch("https://agent.test/", {
            headers: {
                authorization: "Bearer caller",
                cookie: "session=caller",
            },
        });
        assert.equal(response.status, 200);
        const result = await response.json();
        assert.deepEqual(result, {
            text: "SDK works",
            tokens: 5,
            tool: "echoed",
            agent: "function",
            providerRequest: {
                url: "https://provider.test/v1/chat/completions",
                body: {
                    model: "openai",
                    messages: [{ role: "user", content: "hello" }],
                },
            },
            authorization: null,
            cookie: null,
        });
    } finally {
        await worker.dispose();
    }
});
