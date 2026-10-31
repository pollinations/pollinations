import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const MIN = 60 * 1000;
const SCRIPT = fileURLToPath(new URL("../heartbeat.mjs", import.meta.url));

// heartbeat.mjs against one local server playing /health and the Discord
// webhook. Each run is the script as the workflow runs it.
async function world() {
    const w = { checkedAt: null, editStatus: 200, writes: [] };
    const server = createServer((req, res) => {
        let body = "";
        req.on("data", (chunk) => {
            body += chunk;
        });
        req.on("end", () => {
            if (req.url === "/health")
                return res.end(JSON.stringify({ checkedAt: w.checkedAt }));
            w.writes.push({
                method: req.method,
                path: req.url.split("?")[0],
                color: JSON.parse(body).embeds[0].color,
            });
            res.setHeader("content-type", "application/json");
            if (req.method === "PATCH") {
                res.statusCode = w.editStatus;
                return res.end("{}");
            }
            res.end(JSON.stringify({ id: `m${w.writes.length}` }));
        });
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const state = join(await mkdtemp(join(tmpdir(), "heartbeat-")), "s.json");
    const env = {
        ...process.env,
        HEALTH_URL: `${base}/health`,
        HEARTBEAT_STATE: state,
        DISCORD_WEBHOOK_URL: `${base}/api/webhooks/1/x`,
        GITHUB_OUTPUT: "",
    };
    w.run = () =>
        promisify(execFile)(process.execPath, [SCRIPT], { env }).then(
            () => true,
            () => false,
        );
    w.state = async () => JSON.parse(await readFile(state, "utf8"));
    w.close = () => server.close();
    return w;
}

test("heartbeat posts one card, then edits it green, retrying a failed edit", async (t) => {
    const w = await world();
    t.after(w.close);
    w.checkedAt = Date.now() - 15 * MIN;
    assert.equal(await w.run(), true);
    assert.equal((await w.state()).incident.messageId, "m1");
    // Still down: nothing new.
    assert.equal(await w.run(), true);
    assert.equal(w.writes.length, 1);

    // Checks resume but Discord refuses the edit: the card stays open.
    w.checkedAt = Date.now();
    w.editStatus = 503;
    assert.equal(await w.run(), false);
    assert.equal((await w.state()).incident.messageId, "m1");

    // The next run edits the same card green, and only then forgets it.
    w.editStatus = 200;
    assert.equal(await w.run(), true);
    assert.deepEqual(w.writes.at(-1), {
        method: "PATCH",
        path: "/api/webhooks/1/x/messages/m1",
        color: 0x639922,
    });
    assert.deepEqual(await w.state(), {});
    assert.equal(w.writes.filter((x) => x.method === "POST").length, 1);
});
