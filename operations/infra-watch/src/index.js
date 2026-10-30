import { DurableObject } from "cloudflare:workers";
import { exclusive, send, settle, withTimeout } from "./delivery.js";
import { allow, ask, evidence, followUp, investigates } from "./investigate.js";
import { conditions, render, step } from "./rules.js";

const PUBLIC = "https://gen.pollinations.ai";
const UPSTREAM = "https://gen.myceli.ai";
// thomash, elliot
const MAINTAINERS = ["304378879705874432", "884468469452656732"];

const getJson = (url) =>
    withTimeout(20_000, async (signal) => {
        const res = await fetch(url, { signal });
        if (!res.ok) throw new Error(`${url} -> ${res.status}`);
        return res.json();
    });

const statusRows = async (gen, minutes) =>
    (await getJson(`${gen}/models/status?minutes=${minutes}`)).data;

// Only the status matters; cancel the unread body to free it.
const isUp = (gen) =>
    withTimeout(20_000, async (signal) => {
        const res = await fetch(`${gen}/`, { signal });
        res.body?.cancel();
        return res.ok;
    }).catch(() => false);

// Local `npm run dev` sets DRY_RUN=1; anywhere else a missing webhook is an
// error, never a silent dry run.
async function post(env, { text, ping }) {
    const content = ping
        ? `${MAINTAINERS.map((id) => `<@${id}>`).join(" ")}\n${text}`
        : text;
    if (env.DRY_RUN === "1") {
        console.log(`[dry-run]\n${content}`);
        return true;
    }
    if (!env.DISCORD_WEBHOOK_URL)
        throw new Error("DISCORD_WEBHOOK_URL missing");
    return send(env.DISCORD_WEBHOOK_URL, {
        content,
        // parse: [] blocks @everyone, roles and any user not listed here.
        allowed_mentions: { parse: [], users: ping ? MAINTAINERS : [] },
    });
}

// One instance holds all alert state. A check awaits network calls, so the
// next cron could interleave with it: `once` skips a check while one runs.
export class Watch extends DurableObject {
    once = exclusive();

    async check() {
        return (await this.once(() => this.run())) ?? { skipped: true };
    }

    async run() {
        const now = Date.now();
        let found;
        let data = { recent: [], last10: [], last60: [], official: new Set() };
        const [pub, up] = await Promise.all([isUp(PUBLIC), isUp(UPSTREAM)]);
        const hosts = { public: pub, upstream: up };
        // Read data through whichever hostname answers, public first.
        const gen = pub ? PUBLIC : UPSTREAM;
        if (!pub && !up) found = conditions({ hosts });
        else
            try {
                const [r15, r10, r60, catalog] = await Promise.all([
                    statusRows(gen, 15),
                    statusRows(gen, 10),
                    statusRows(gen, 60),
                    getJson(`${gen}/models?reliability=all`),
                ]);
                const models = Array.isArray(catalog) ? catalog : catalog.data;
                const official = new Set(
                    models.filter((m) => !m.community).map((m) => m.name),
                );
                data = { recent: r15, last10: r10, last60: r60, official };
                found = conditions({ ...data, hosts });
            } catch (error) {
                console.error(`check failed: ${error.message}`);
                found = conditions({ hosts, analyticsDown: true });
            }

        const state = (await this.ctx.storage.get("state")) ?? {};
        const next = step(state, found, now, data.recent);
        const delivered = [];
        for (const p of next.posts)
            delivered.push(await post(this.env, render(p)));
        await this.ctx.storage.put(
            "state",
            settle(state, next.state, next.posts, delivered),
        );
        for (const [i, p] of next.posts.entries())
            if (delivered[i] && investigates(p))
                await this.investigate(p, data, now);
        const failed = delivered.filter((ok) => !ok).length;
        if (failed)
            console.error(
                `${failed} webhook post(s) failed; retrying next check`,
            );
        return {
            found: Object.keys(found),
            posted: delivered.filter(Boolean).length,
            failed,
        };
    }

    // One AI follow-up per delivered alert, within a daily limit. A failure
    // only logs: the alert itself is already posted.
    async investigate(p, data, now) {
        const budget = allow(await this.ctx.storage.get("ai"), now);
        if (!budget) {
            console.error("investigator: daily limit reached");
            return;
        }
        await this.ctx.storage.put("ai", budget);
        try {
            const key = this.env.POLLINATIONS_API_KEY;
            if (!key) throw new Error("POLLINATIONS_API_KEY missing");
            const lines = await ask(key, evidence(p, data));
            if (!lines) throw new Error("off-format answer");
            const text = followUp(p, lines);
            if (!(await post(this.env, { text, ping: false })))
                throw new Error("follow-up not delivered");
        } catch (error) {
            console.error(`investigator: ${error.message}`);
        }
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
