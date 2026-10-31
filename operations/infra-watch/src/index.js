import { DurableObject } from "cloudflare:workers";
import {
    edit,
    exclusive,
    payload,
    send,
    serial,
    settle,
    withTimeout,
} from "./delivery.js";
import { allow, ask, evidence, investigates, toolsFor } from "./investigate.js";
import { CHECKING, complete, conditions, render, step } from "./rules.js";

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

const show = (label, body) =>
    console.log(
        `[${label}] ${body.content} color=#${body.embeds[0].color?.toString(16)}\n${body.embeds[0].description}`,
    );

// Local `npm run dev` sets DRY_RUN=1; anywhere else a missing webhook is an
// error, never a silent dry run. Returns the saved message's id.
async function post(env, message) {
    const body = payload(message, MAINTAINERS);
    if (env.DRY_RUN === "1") {
        show("dry-run", body);
        return "dry-run";
    }
    if (!env.DISCORD_WEBHOOK_URL)
        throw new Error("DISCORD_WEBHOOK_URL missing");
    return send(env.DISCORD_WEBHOOK_URL, body);
}

async function update(env, id, message) {
    const body = payload(message, MAINTAINERS);
    if (env.DRY_RUN === "1") {
        show("dry-run edit", body);
        return true;
    }
    return edit(env.DISCORD_WEBHOOK_URL, id, body);
}

// One instance holds all alert state. A check awaits network calls, so the
// next cron could interleave with it: `once` skips a check while one runs.
export class Watch extends DurableObject {
    once = exclusive();
    // AI follow-ups queue here, outside `once`: a slow model call never
    // delays the next check.
    background = serial();

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
        const tools = toolsFor(data, {
            tinybirdToken: this.env.TINYBIRD_TOKEN,
        });
        let ai = await this.ctx.storage.get("ai");
        const messages = [];
        for (const p of next.posts) {
            // Who is failing, known before posting: it decides the ping.
            if (p.type === "alert" && p.info.model) {
                const spread = await tools.caller_spread({
                    model: p.info.model,
                });
                if (spread.error) console.error(`callers: ${spread.error}`);
                else p.info.callers = spread;
            }
            const message = render(p);
            if (investigates(p)) {
                const reserved = allow(ai, now);
                if (reserved) {
                    ai = reserved;
                    message.text += `\n${CHECKING}`;
                    message.investigate = true;
                } else console.error("investigator: daily limit reached");
            }
            messages.push(message);
        }
        if (messages.some((m) => m.investigate))
            await this.ctx.storage.put("ai", ai);
        const delivered = [];
        for (const message of messages)
            delivered.push(await post(this.env, message));
        await this.ctx.storage.put(
            "state",
            settle(state, next.state, next.posts, delivered),
        );
        for (const [i, p] of next.posts.entries())
            if (delivered[i] && messages[i].investigate)
                this.background(() =>
                    this.investigate(p, data, delivered[i], messages[i]),
                );
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

    // The AI completes the alert it was posted with: its line replaces
    // "checking why…", or that line just goes if it has nothing to say.
    async investigate(p, data, id, message) {
        let line = null;
        try {
            const key = this.env.POLLINATIONS_API_KEY;
            if (!key) throw new Error("POLLINATIONS_API_KEY missing");
            line = await ask(
                key,
                evidence(p, data),
                toolsFor(data, { tinybirdToken: this.env.TINYBIRD_TOKEN }),
            );
            if (!line) console.error("investigator: no answer");
        } catch (error) {
            console.error(`investigator: ${error.message}`);
        }
        const done = { ...message, text: complete(message.text, line) };
        if (!(await update(this.env, id, done)))
            console.error("investigator: edit failed");
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
