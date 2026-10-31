// Watches the watcher from outside Cloudflare. GitHub Actions runs this every
// 5 minutes (.github/workflows/monitor-infra-watch-heartbeat.yml): it reads
// infra-watch's last completed check from /health and, through the same
// webhook, posts one card in the infra-watch channel when it is 10+ minutes
// old, then edits that card green when checks resume. The open card lives in
// a small state file the workflow caches.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import {
    edit,
    MAINTAINERS,
    payload,
    send,
    withTimeout,
} from "./src/delivery.js";
import { heartbeat } from "./src/rules.js";

const HEALTH =
    process.env.HEALTH_URL ??
    "https://infra-watch.elliot-b6e.workers.dev/health";
const STATE = process.env.HEARTBEAT_STATE ?? ".heartbeat/state.json";

const state = await readFile(STATE, "utf8")
    .then(JSON.parse)
    .catch(() => ({}));

const checkedAt = await withTimeout(20_000, async (signal) => {
    const res = await fetch(HEALTH, { signal });
    if (!res.ok) throw new Error(`/health -> ${res.status}`);
    return (await res.json()).checkedAt ?? null;
}).catch((error) => {
    console.error(`health: ${error.message}`);
    return null;
});

const next = heartbeat(state, checkedAt, Date.now());
const webhook = process.env.DISCORD_WEBHOOK_URL;
if ((next.post || next.edit) && !webhook)
    throw new Error("DISCORD_WEBHOOK_URL missing");
// A write Discord didn't take keeps the old state, so the next run tries
// again; a card counts as posted only with a message id to edit it by.
if (next.post) {
    const saved = await send(webhook, payload(next.post, MAINTAINERS));
    if (!saved?.id) throw new Error("heartbeat post failed");
    next.state.incident.messageId = saved.id;
}
if (next.edit) {
    const { id, card } = next.edit;
    if (!(await edit(webhook, id, payload(card, MAINTAINERS))))
        throw new Error("heartbeat edit failed");
}

await mkdir(dirname(STATE), { recursive: true });
await writeFile(STATE, JSON.stringify(next.state));
const changed = JSON.stringify(next.state) !== JSON.stringify(state);
if (process.env.GITHUB_OUTPUT)
    await writeFile(process.env.GITHUB_OUTPUT, `changed=${changed}\n`, {
        flag: "a",
    });
console.log(
    `checkedAt=${checkedAt} posted=${Boolean(next.post)} edited=${Boolean(next.edit)} state=${JSON.stringify(next.state)}`,
);
