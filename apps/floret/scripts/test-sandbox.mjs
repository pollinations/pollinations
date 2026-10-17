import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { Miniflare } from "miniflare";

const key =
    process.env.FLORET_TEST_KEY ||
    JSON.parse(
        await readFile(`${homedir()}/.pollinations/credentials.json`, "utf8"),
    ).apiKey;
if (!key) throw new Error("An existing Pollinations key is required");
async function get(path) {
    const response = await fetch(`https://gen.pollinations.ai${path}`, {
        headers: { Authorization: `Bearer ${key}` },
    });
    if (!response.ok) throw new Error(`${path} returned ${response.status}`);
    return response.json();
}
const info = await get("/account/key");
assert.equal(info.valid, true);
const before = await get("/alpha/e2b/v2/sandboxes");
console.log(
    `Valid key; sandbox API accessible. Existing running VMs: ${before.filter((s) => s.state === "running").length}`,
);
if (!process.argv.includes("--preflight")) {
    // Run the exact deployment bundle in workerd against live production services.
    // No HTTP mocks, operator keys, template builds or key creation.
    const mf = new Miniflare({
        modules: [
            {
                type: "ESModule",
                path: fileURLToPath(
                    new URL("../temp/worker/worker.js", import.meta.url),
                ),
            },
        ],
        compatibilityDate: "2026-01-01",
        compatibilityFlags: ["nodejs_compat"],
        durableObjects: {
            FLORET_CATALOG: { className: "FloretCatalog", useSQLite: true },
        },
        cf: false,
    });
    const call = (body) =>
        mf.dispatchFetch("https://floret.test/v1/chat/completions", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${key}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ model: "floret", ...body }),
        });
    try {
        const started = Date.now();
        const streamed = await call({
            messages: [
                {
                    role: "user",
                    content:
                        "Use bash to run printf %s floret-e2b-persistent > proof.txt and start sleep 90 in the background redirected to /dev/null, saving its PID. Then make a SECOND separate bash call to read proof.txt and verify the PID is alive. Finally use upload_media with the absolute file path to publish proof.txt. Return its public download URL. Do not generate images, audio or video.",
                },
            ],
            stream: true,
            stream_options: { include_usage: true },
        });
        assert.equal(streamed.status, 200);
        const text = await streamed.text();
        assert.ok(
            (text.match(/"name": "bash"/g) || []).length >= 2,
            "Need separate bash calls",
        );
        assert.match(text, /data: \[DONE\]/);
        assert.match(text, /"total_tokens": 0/);
        const published = text.match(
            /https:\/\/media\.pollinations\.ai\/[^\s"\\)]+/,
        );
        assert.ok(published, "Expected published proof file");
        assert.equal(
            await (await fetch(published[0])).text(),
            "floret-e2b-persistent",
        );
        console.log(
            `Real workerd -> E2B -> agent SSE and persistent shell/file publication passed in ${Date.now() - started}ms`,
        );
        const plain = await call({
            messages: [
                {
                    role: "user",
                    content: "Reply exactly floret-e2b-ok. Do not use tools.",
                },
            ],
        });
        assert.equal(plain.status, 200);
        assert.match(
            (await plain.json()).choices[0].message.content,
            /floret-e2b-ok/,
        );
        console.log("Separate non-streaming run passed");
        const cancellation = await call({
            messages: [
                {
                    role: "user",
                    content: "Use bash to run sleep 60, then reply done.",
                },
            ],
            stream: true,
        });
        const reader = cancellation.body.getReader();
        let frames = "";
        const decoder = new TextDecoder();
        while (!frames.includes('"name": "bash"')) {
            const { done, value } = await reader.read();
            assert.equal(
                done,
                false,
                "Agent must start its shell before cancellation",
            );
            frames += decoder.decode(value, { stream: true });
        }
        await reader.cancel();
        const original = new Set(before.map((s) => s.sandboxID));
        let cleaned = false;
        for (let attempt = 0; attempt < 60; attempt++) {
            const after = await get("/alpha/e2b/v2/sandboxes");
            if (after.every((s) => original.has(s.sandboxID))) {
                cleaned = true;
                break;
            }
            await new Promise((resolve) => setTimeout(resolve, 1000));
        }
        assert.ok(cleaned, "A test VM was left behind after disconnect");
        console.log("Disconnect cleanup passed; no test VM remains");
    } finally {
        await mf.dispose();
    }
}
