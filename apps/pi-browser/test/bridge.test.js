// Runs the real wasmer/pi package through the Node SDK and the same bridge
// the page uses, against a scripted local model: no network calls to
// Pollinations, no Pollen. The first run downloads Pi (~40 MB) into .wasmer/.

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { Wasmer } from "@wasmer/sdk/node";
import { COMPLETIONS, PROJECT, piArgs, providerConfig } from "../src/core.js";
import { bootPi, serveBridge, writeProvider } from "../src/sandbox.js";

const MODEL = {
    id: "test/model",
    name: "Test model",
    contextWindow: 128000,
    input: ["text"],
    reasoning: false,
    cost: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 },
};
const usage = { prompt_tokens: 10, completion_tokens: 5 };
const toolCall = (name, args) => [
    {
        choices: [
            {
                delta: {
                    tool_calls: [
                        {
                            index: 0,
                            id: `call_${name}`,
                            type: "function",
                            function: { name, arguments: JSON.stringify(args) },
                        },
                    ],
                },
            },
        ],
    },
    { choices: [{ delta: {}, finish_reason: "tool_calls" }], usage },
];
const reply = (text) => [
    { choices: [{ delta: { content: text } }] },
    { choices: [{ delta: {}, finish_reason: "stop" }], usage },
];
// The conversation Pi has with the scripted model: write, run, answer.
const SCRIPT = [
    toolCall("write", {
        path: "hello.js",
        content: 'console.log("hi from pi")\n',
    }),
    toolCall("bash", { command: "node hello.js" }),
    reply("Ran it."),
];

// Streams the SSE body in two pieces so the bridge must relay partial chunks.
function sse(chunks) {
    const text = `${chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join("")}data: [DONE]\n\n`;
    const bytes = new TextEncoder().encode(text);
    const half = Math.floor(bytes.length / 2);
    return new Response(
        new ReadableStream({
            start(controller) {
                controller.enqueue(bytes.slice(0, half));
                setTimeout(() => {
                    controller.enqueue(bytes.slice(half));
                    controller.close();
                }, 20);
            },
        }),
        { headers: { "content-type": "text/event-stream" } },
    );
}

test(
    "real Pi writes and runs a file through the mailbox bridge",
    { timeout: 600_000 },
    async () => {
        const wasmer = new Wasmer({ cache: { directory: ".wasmer" } });
        const extension = await readFile(
            new URL("../guest/pollinations.mjs", import.meta.url),
            "utf8",
        );
        const sandbox = await bootPi(wasmer, { extension });
        await writeProvider(sandbox, providerConfig([MODEL]));

        const requests = [];
        const stop = new AbortController();
        const bridge = serveBridge(sandbox, {
            getKey: () => "sk_test",
            signal: stop.signal,
            fetch: async (url, init) => {
                requests.push({ url, init, body: JSON.parse(init.body) });
                return sse(SCRIPT[requests.length - 1]);
            },
        });
        const out = await sandbox
            .command(
                "pi",
                piArgs({
                    model: MODEL.id,
                    prompt: "make hello.js and run it",
                    sessionId: "t1",
                }),
                { cwd: PROJECT },
            )
            .run({ check: false, timeoutMs: 300_000 });
        stop.abort();
        await bridge;

        const events = out.stdout
            .text()
            .trim()
            .split("\n")
            .map((l) => JSON.parse(l));
        const bash = events.find(
            (e) => e.type === "tool_execution_end" && e.toolName === "bash",
        );
        assert.equal(out.exitCode, 0, out.stderr.text());
        assert.equal(
            await sandbox.fs.readText(`${PROJECT}/hello.js`),
            'console.log("hi from pi")\n',
        );
        assert.match(bash.result.content[0].text, /hi from pi/);
        assert.equal(requests.length, 3);
        for (const { url, init, body } of requests) {
            assert.equal(url, COMPLETIONS);
            assert.equal(init.headers.Authorization, "Bearer sk_test");
            assert.equal(body.model, MODEL.id);
            assert.equal(body.stream, true);
        }
        // Pi's own usage accounting reached the event stream.
        const ends = events.filter(
            (e) => e.type === "message_end" && e.message.role === "assistant",
        );
        assert.ok(ends.every((e) => e.message.usage.totalTokens === 15));
        assert.deepEqual(await sandbox.fs.readDir("/workspace/.pi/bridge"), []);

        // A provider failure reaches Pi as an error message instead of hanging it.
        const failing = new AbortController();
        const failingBridge = serveBridge(sandbox, {
            getKey: () => "sk_test",
            signal: failing.signal,
            fetch: async () => {
                throw new Error("network down");
            },
        });
        const failed = await sandbox
            .command(
                "pi",
                piArgs({ model: MODEL.id, prompt: "hi", sessionId: "t2" }),
                { cwd: PROJECT },
            )
            .run({ check: false, timeoutMs: 300_000 });
        failing.abort();
        await failingBridge;
        assert.match(failed.stdout.text(), /network down/);
        assert.deepEqual(await sandbox.fs.readDir("/workspace/.pi/bridge"), []);
        await wasmer.close();
    },
);
