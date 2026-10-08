// End-to-end tests against a real Wasmer sandbox, with no mocks on the
// bridge path. Two phases:
//
//   1. Bridge transport (always runs): a node script inside the sandbox
//      writes a real request envelope, and we verify the host fetches
//      gen.pollinations.ai with the injected key and streams the response
//      back through the pump file protocol.
//   2. Full Pi guided run (only if the API key may stream): boots the real
//      Pi webc with the bridge extension and asks it to create a file.
//
// Usage: node test/e2e.mjs
// Requires POLLINATIONS_API_KEY and a Pi webc at /tmp/pi-1.0.0.webc.

import { readFileSync } from "node:fs";
import { Wasmer } from "@wasmer/sdk/node";
import { fetchAgentModels } from "../src/models.js";
import { DEFAULT_MODEL, GEN_BASE_URL } from "../src/piConfig.js";
import {
    collectWorkspace,
    createSandbox,
    runPi,
    runShell,
    startBridge,
} from "../src/sandbox.js";

const apiKey = process.env.POLLINATIONS_API_KEY;
if (!apiKey) {
    console.error("POLLINATIONS_API_KEY not set");
    process.exit(1);
}

// The key needs streaming permission for the full Pi phase; restricted
// (seed-tier) keys get 401 on stream:true but work fine non-streaming.
async function keyCanStream() {
    try {
        const probe = await fetch(`${GEN_BASE_URL}/v1/chat/completions`, {
            method: "POST",
            headers: {
                "content-type": "application/json",
                authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: DEFAULT_MODEL,
                stream: true,
                messages: [{ role: "user", content: "hi" }],
                max_tokens: 5,
            }),
        });
        if (probe.status === 200) {
            await probe.body?.cancel?.();
            return true;
        }
        console.log(
            `[e2e] streaming probe returned ${probe.status}; running bridge phase only`,
        );
        return false;
    } catch (err) {
        console.log(
            `[e2e] streaming probe failed (${err.message}); running bridge phase only`,
        );
        return false;
    }
}

// File-backed fetchImpl so createSandbox can read the guest sources.
const fileFetch = async (url) => {
    const path = new URL(url, `file://${process.cwd()}/`).pathname;
    return {
        ok: true,
        status: 200,
        async text() {
            return readFileSync(path, "utf8");
        },
        async arrayBuffer() {
            return readFileSync(path).buffer;
        },
    };
};

console.log("[e2e] initializing Wasmer...");
const wasmer = await Wasmer.create({ parallelism: 2 });

console.log("[e2e] loading Pi package...");
const webcBytes = readFileSync("/tmp/pi-1.0.0.webc");
const piPackage = await wasmer.packages.load(new Uint8Array(webcBytes));

console.log("[e2e] fetching model catalog...");
const models = await fetchAgentModels();

console.log("[e2e] creating sandbox...");
const sandbox = await createSandbox({
    wasmer,
    piPackage,
    models,
    defaultModel: DEFAULT_MODEL,
    fetchImpl: fileFetch,
});

console.log("[e2e] starting bridge...");
const bridge = await startBridge(sandbox, {
    apiKey,
    log: (msg) => console.log(`[bridge] ${msg}`),
});

let failed = false;

// --- Phase 1: bridge transport -----------------------------------------
// The guest script mimics the extension exactly: it writes an envelope,
// then tails the .head/.body/.done files as the host streams the
// response back.
const guestProbe = `
const fs = require("node:fs");
const crypto = require("node:crypto");
(async () => {
    const id = crypto.randomUUID();
    const envelope = {
        id,
        url: "${GEN_BASE_URL}/v1/chat/completions",
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
            model: "${DEFAULT_MODEL}",
            messages: [{ role: "user", content: "Reply with the single word PONG" }],
            max_tokens: 200,
        }),
    };
    fs.writeFileSync("/workspace/.bridge/" + id + ".req", JSON.stringify(envelope));
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const deadline = Date.now() + 60000;
    while (Date.now() < deadline) {
        if (fs.existsSync("/workspace/.bridge/" + id + ".done")) break;
        await sleep(100);
    }
    if (!fs.existsSync("/workspace/.bridge/" + id + ".done")) {
        console.log("NO_DONE"); process.exit(1);
    }
    const done = JSON.parse(fs.readFileSync("/workspace/.bridge/" + id + ".done", "utf8"));
    if (done.error) { console.log("BRIDGE_ERROR " + done.error); process.exit(1); }
    const head = JSON.parse(fs.readFileSync("/workspace/.bridge/" + id + ".head", "utf8"));
    const body = JSON.parse(fs.readFileSync("/workspace/.bridge/" + id + ".body", "utf8"));
    console.log("HEAD_STATUS " + head.status);
    console.log("BODY_HAS_CONTENT " + String(!!(body.choices?.[0]?.message?.content)));
})();
`;

console.log("[e2e] phase 1: guest->host->guest transport...");
const probeB64 = Buffer.from(guestProbe).toString("base64");
const probe = await runShell(
    sandbox,
    `echo ${probeB64} | base64 -d > /workspace/.bridge/probe.cjs && node /workspace/.bridge/probe.cjs`,
);
console.log(`[e2e] probe exit ${probe.code}`);
if (probe.stdout.trim())
    console.log("[e2e] probe stdout:", probe.stdout.trim().slice(0, 300));
if (probe.stderr.trim())
    console.log("[e2e] probe stderr:", probe.stderr.trim().slice(0, 300));
const status = /HEAD_STATUS (\d+)/.exec(probe.stdout)?.[1];
if (status === "200" && probe.stdout.includes("BODY_HAS_CONTENT true")) {
    console.log("[e2e] phase 1 PASS");
} else {
    console.error("[e2e] phase 1 FAIL");
    failed = true;
}

// --- Phase 2: full guided Pi run ---------------------------------------
const canStream = await keyCanStream();
if (canStream) {
    const prompt =
        "Create a file named hello.txt containing exactly the text: bridge works. Then reply DONE.";
    console.log(`[e2e] phase 2: guided Pi run (${prompt})`);
    const events = [];
    const run = runPi(sandbox, {
        model: DEFAULT_MODEL,
        prompt,
        continueSession: false,
        onEvent: (event) => {
            events.push(event);
            if (event?.type === "message_update") {
                const delta = event.assistantMessageEvent;
                if (delta?.type === "text_delta")
                    process.stdout.write(delta.delta);
            } else if (event?.type === "tool_execution_start") {
                console.log(`\n[e2e] tool: ${event.toolName}`);
            }
        },
    });
    const result = await run.result;
    console.log(
        `\n[e2e] pi exited ${result.exitCode}, events: ${events.length}`,
    );
    if (result.stderrTail)
        console.log(`[e2e] stderr tail:\n${result.stderrTail.slice(-1000)}`);

    const sawAssistant = events.some(
        (e) => e?.type === "message_start" && e?.message?.role === "assistant",
    );
    const sawEnd = events.some((e) => e?.type === "agent_end");
    const { files } = await collectWorkspace(sandbox);
    const hello = files.find((f) => f.path === "hello.txt");
    if (sawAssistant && sawEnd && hello) {
        console.log(
            `[e2e] phase 2 PASS (hello.txt: ${JSON.stringify(hello.content)})`,
        );
    } else {
        console.error(
            `[e2e] phase 2 FAIL (assistant=${sawAssistant} end=${sawEnd} hello=${!!hello})`,
        );
        failed = true;
    }
} else {
    console.log("[e2e] phase 2 SKIPPED (key cannot stream)");
}

bridge.pump.terminate();
if (failed) process.exit(1);
console.log("[e2e] DONE");
