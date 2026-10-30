import { DurableObject } from "cloudflare:workers";
import { conditions, render, step } from "./rules.js";

const GEN = "https://gen.pollinations.ai";
// thomash, elliot
const MAINTAINERS = ["304378879705874432", "884468469452656732"];

async function getJson(url) {
    const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) throw new Error(`${url} -> ${res.status}`);
    return res.json();
}

const statusRows = async (minutes) =>
    (await getJson(`${GEN}/models/status?minutes=${minutes}`)).data;

async function post(env, { text, ping }) {
    const content = ping
        ? `${MAINTAINERS.map((id) => `<@${id}>`).join(" ")}\n${text}`
        : text;
    if (!env.DISCORD_WEBHOOK_URL) {
        console.log(`[dry-run]\n${content}`);
        return;
    }
    const res = await fetch(env.DISCORD_WEBHOOK_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
            content,
            allowed_mentions: { users: ping ? MAINTAINERS : [] },
        }),
    });
    if (!res.ok) console.error(`webhook ${res.status}`);
}

// One instance holds all alert state, so checks never run concurrently.
export class Watch extends DurableObject {
    async check() {
        const now = Date.now();
        let found;
        let recent = [];
        try {
            const [r15, r10, r60, catalog] = await Promise.all([
                statusRows(15),
                statusRows(10),
                statusRows(60),
                getJson(`${GEN}/models?reliability=all`),
            ]);
            recent = r15;
            const models = Array.isArray(catalog) ? catalog : catalog.data;
            const official = new Set(
                models.filter((m) => !m.community).map((m) => m.name),
            );
            found = conditions({ recent, last10: r10, last60: r60, official });
        } catch (error) {
            console.error(`check failed: ${error.message}`);
            found = conditions({ genDown: true });
        }

        const state = (await this.ctx.storage.get("state")) ?? {};
        const next = step(state, found, now, recent);
        for (const p of next.posts) await post(this.env, render(p));
        await this.ctx.storage.put("state", next.state);
        return { found: Object.keys(found), posted: next.posts.length };
    }
}

const watch = (env) => env.WATCH.get(env.WATCH.idFromName("main"));

export default {
    async scheduled(_event, env) {
        await watch(env).check();
    },
    // Local testing only (workers_dev and routes are off in production).
    async fetch(_request, env) {
        return Response.json(await watch(env).check());
    },
};
