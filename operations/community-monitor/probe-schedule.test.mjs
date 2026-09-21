import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";
import { nextProbeAt, recordProbe } from "./probe-schedule.mjs";

const HOUR = 3_600_000;

test("failures back off across restarts, cap at a week, and fallback success resets the budget", () => {
    let now = Date.parse("2026-09-21T00:00:00Z");
    let previous;
    assert.equal(nextProbeAt(previous), 0);
    for (const hours of [8, 16, 32, 64, 128, 168, 168, 168]) {
        previous = JSON.parse(
            JSON.stringify(
                recordProbe(previous, {
                    timestamp: new Date(now).toISOString(),
                    ok: false,
                    operation: "edit",
                }),
            ),
        );
        assert.equal(nextProbeAt(previous), now + hours * HOUR);
        now = nextProbeAt(previous);
    }
    previous = recordProbe(previous, {
        timestamp: new Date(now).toISOString(),
        ok: true,
        fallbackUsed: true,
        operation: "edit",
    });
    assert.equal(previous.failures, 0);
    assert.equal(nextProbeAt(previous), now + 4 * HOUR);
    assert.equal(previous.operation, "edit");
});

test("CLI probes only selected due IDs, persists backoff, and allows a one-off recovery check", async (t) => {
    const dir = await fs.mkdtemp(
        path.join(os.tmpdir(), "community-probe-test-"),
    );
    t.after(() => fs.rm(dir, { recursive: true, force: true }));
    const statePath = path.join(dir, "state.json");
    const resultsPath = path.join(dir, "results.json");
    const candidatesPath = path.join(dir, "candidates.json");
    const text = {
        name: "community/tester/text",
        category: "text",
        community: true,
        aliases: ["tester/text"],
    };
    const image = {
        name: "community/tester/image",
        category: "image",
        community: true,
        input_modalities: ["text", "image"],
    };
    const agent = {
        name: "community/tester/agent",
        category: "text",
        community: true,
        agent: true,
    };
    const hidden = { name: "community/tester/hidden", category: "text" };
    const requests = [];
    let failing = true;
    const server = http.createServer(async (req, res) => {
        if (req.url === "/models?reliability=all") {
            res.setHeader("content-type", "application/json");
            res.end(
                JSON.stringify([
                    text,
                    image,
                    agent,
                    {
                        ...text,
                        name: "community/tester/unselected",
                        aliases: [],
                    },
                ]),
            );
            return;
        }
        let raw = "";
        for await (const chunk of req) raw += chunk;
        const body = JSON.parse(raw);
        requests.push(body.model);
        if (req.url === "/v1/images/edits") {
            res.writeHead(200, { "content-type": "application/json" });
            res.end(
                JSON.stringify({
                    data: [{ b64_json: body.image.split(",")[1] }],
                }),
            );
            return;
        }
        if (failing && body.model === text.name) {
            res.writeHead(503, { "content-type": "application/json" });
            res.end(JSON.stringify({ error: { message: "Unavailable" } }));
            return;
        }
        const marker = body.messages[0].content.replace(
            "Reply with exactly: ",
            "",
        );
        res.writeHead(200, {
            "content-type": "text/event-stream",
            "x-model-used": "fallback/text",
        });
        res.end(
            `data: ${JSON.stringify({ choices: [{ delta: { content: marker } }], usage: { prompt_tokens: 20, completion_tokens: 8, total_tokens: 28 } })}\n\ndata: [DONE]\n\n`,
        );
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    t.after(() => server.close());
    const run = (args) =>
        promisify(execFile)(
            process.execPath,
            [new URL("./probe.mjs", import.meta.url).pathname, ...args],
            {
                env: {
                    ...process.env,
                    POLLI_TOKEN: "local-test-only",
                    POLLINATIONS_GEN_URL: `http://127.0.0.1:${server.address().port}`,
                    MONITOR_STATE_PATH: statePath,
                    MONITOR_RESULTS_PATH: resultsPath,
                },
                timeout: 10_000,
            },
        );
    const readJson = async (file) =>
        JSON.parse(await fs.readFile(file, "utf8"));
    const imageCadence = {
        lastAt: new Date().toISOString(),
        failures: 3,
        operation: "edit",
    };
    await fs.writeFile(
        statePath,
        JSON.stringify({
            lastRepliedMessageId: { channel: "cursor" },
            spend: { probes: { "tester/image": imageCadence } },
        }),
    );
    await fs.writeFile(
        candidatesPath,
        JSON.stringify([{ ...text, name: "tester/text" }, text, image, hidden]),
    );
    await run(["--models-file", candidatesPath]);
    assert.deepEqual(requests.sort(), [text.name, hidden.name].sort());
    let state = await readJson(statePath);
    assert.equal(state.spend.probes["tester/text"].failures, 1);
    assert.deepEqual(state.spend.probes["tester/image"], imageCadence);
    assert.deepEqual(state.lastRepliedMessageId, { channel: "cursor" });
    assert.deepEqual((await readJson(resultsPath)).skippedModels, [image.name]);

    // A fresh process in the next agent cycle must not send the same probes.
    await run(["--models-file", candidatesPath]);
    assert.equal(requests.length, 2);
    assert.deepEqual((await readJson(resultsPath)).results, []);

    // An explicit fix report can trigger a diagnostic; fallback rescue is success.
    failing = false;
    const diagnostic = await run(["--model", "tester/text"]);
    assert.equal(JSON.parse(diagnostic.stdout).results[0].fallbackUsed, true);
    state = await readJson(statePath);
    assert.equal(state.spend.probes["tester/text"].failures, 0);
    assert.deepEqual((await readJson(resultsPath)).results, []);
    await run(["--models-file", candidatesPath]);
    assert.equal(requests.length, 3);

    await fs.writeFile(candidatesPath, "[]");
    await run(["--models-file", candidatesPath]);
    assert.equal(requests.length, 3); // Empty selection never means all models.
    await fs.writeFile(candidatesPath, JSON.stringify([agent]));
    await assert.rejects(
        run(["--models-file", candidatesPath]),
        /Only community text\/image proxy models/,
    );
    await assert.rejects(run([]), /Select routine probes/);
    assert.equal(requests.length, 3);

    // Image recovery checks use the specified operation and the same budget.
    state = await readJson(statePath);
    state.spend.probes["tester/image"] = {
        lastAt: new Date(Date.now() - 5 * HOUR).toISOString(),
        failures: 0,
    };
    await fs.writeFile(statePath, JSON.stringify(state));
    await fs.writeFile(
        candidatesPath,
        JSON.stringify([{ ...image, operation: "edit" }]),
    );
    await run(["--models-file", candidatesPath]);
    const imageResult = (await readJson(resultsPath)).results[0];
    assert.equal(imageResult.ok, true);
    assert.equal(imageResult.requestPath, "/v1/images/edits");
    assert.equal(
        (await readJson(statePath)).spend.probes["tester/image"].operation,
        "edit",
    );
    await run(["--models-file", candidatesPath]);
    assert.equal(requests.length, 4);

    // An unreadable schedule must not silently reset backoff or erase state.
    await fs.writeFile(statePath, "{interrupted write");
    await assert.rejects(run(["--models-file", candidatesPath]), /SyntaxError/);
    assert.equal(await fs.readFile(statePath, "utf8"), "{interrupted write");
    assert.equal(requests.length, 4);
});
