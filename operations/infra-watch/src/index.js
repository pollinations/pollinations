import { DurableObject } from "cloudflare:workers";
import {
    edit,
    exclusive,
    payload,
    send,
    serial,
    withTimeout,
} from "./delivery.js";
import {
    allow,
    ask,
    evidence,
    investigates,
    lost,
    toolsFor,
} from "./investigate.js";
import {
    conditions,
    duration,
    escalates,
    escalation,
    noteworthy,
    pings,
    renderCard,
    snapshot,
    step,
} from "./rules.js";

const PUBLIC = "https://gen.pollinations.ai";
const UPSTREAM = "https://gen.myceli.ai";
// thomash, elliot
const MAINTAINERS = ["304378879705874432", "884468469452656732"];
// The pollinations.ai Discord server, for links to a card.
const GUILD = "885844321461485618";
// Who is failing and the main error, for an open model incident, are read
// from Tinybird at most this often.
const ENRICH_EVERY_MS = 5 * 60 * 1000;
// A change gets a new AI line at most this often, and a card at most this
// many lines: the opening one, a few changes, and the closing one.
const NOTE_EVERY_MS = 30 * 60 * 1000;
const MAX_LINES = 4;

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
// error, never a silent dry run. Returns the saved message.
async function post(env, message) {
    const body = payload(message, MAINTAINERS);
    if (env.DRY_RUN === "1") {
        show("dry-run", body);
        return { id: "dry-run", channel_id: "dry-run" };
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

const modelOf = (key) => (key.startsWith("model:") ? key.slice(6) : null);

// One instance holds all incidents. A check awaits network calls, so the
// next cron could interleave with it: `once` skips a check while one runs.
export class Watch extends DurableObject {
    once = exclusive();
    // AI lines are written here, outside `once`: a slow model call never
    // delays the next check.
    background = serial();

    async check() {
        return (await this.once(() => this.run())) ?? { skipped: true };
    }

    // An incident's AI lines, kept apart from the incident so the check and
    // a background AI call never overwrite each other.
    async record(key) {
        return (
            (await this.ctx.storage.get(`lines:${key}`)) ?? {
                lines: [],
                pending: false,
            }
        );
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
        const tinybird = { tinybirdToken: this.env.TINYBIRD_TOKEN };
        const tools = toolsFor(data, tinybird);
        let ai = await this.ctx.storage.get("ai");
        const reserve = () => {
            const reserved = allow(ai, now);
            if (!reserved) console.error("investigator: daily limit reached");
            else ai = reserved;
            return Boolean(reserved);
        };
        const notes = [];
        let failed = 0;

        for (const action of next.actions) {
            const { key } = action;
            const model = modelOf(key);
            if (action.type === "close") {
                const incident = action.incident;
                if (model)
                    incident.lost = await lost(
                        model,
                        (now - incident.openedAt) / 60_000 + 15,
                        tinybird,
                    );
                const { lines } = await this.record(key);
                const closing =
                    Boolean(model) && investigates(incident.kind) && reserve();
                const card = renderCard(key, incident, {
                    lines,
                    checking: closing,
                });
                if (!(await update(this.env, incident.messageId, card))) {
                    // Still on the card as open: try closing again next check.
                    failed++;
                    const { closedAt, latest, lost: _, ...open } = incident;
                    next.state.open[key] = open;
                    delete next.state.closed[key];
                    continue;
                }
                if (closing) {
                    await this.ctx.storage.put(`lines:${key}`, {
                        lines,
                        pending: true,
                    });
                    notes.push({ key, incident, moment: "closed" });
                } else await this.ctx.storage.delete(`lines:${key}`);
                continue;
            }

            const incident = next.state.open[key];
            if (model)
                await this.enrich(incident, tools, now, action.type === "open");

            if (action.type === "open") {
                incident.pinged = pings(incident);
                const checking = investigates(incident.kind) && reserve();
                const card = renderCard(key, incident, { checking, now });
                const saved = await post(this.env, card);
                if (!saved) {
                    // Not posted: the incident opens again next check.
                    failed++;
                    delete next.state.open[key];
                    continue;
                }
                Object.assign(incident, {
                    messageId: saved.id,
                    channelId: saved.channel_id,
                    text: card.text,
                    noted: snapshot(incident),
                    notedAt: now,
                    alerted: snapshot(incident),
                });
                await this.ctx.storage.put(`lines:${key}`, {
                    lines: [],
                    pending: checking,
                });
                if (checking) notes.push({ key, moment: "open" });
                continue;
            }

            // Update: the card changes only when its text does, gets an AI
            // line only on a real change, and pings again only if worse.
            const current = snapshot(incident);
            if (escalates(incident.alerted, current)) {
                const link = `https://discord.com/channels/${GUILD}/${incident.channelId}/${incident.messageId}`;
                if (await post(this.env, escalation(key, incident, link)))
                    incident.alerted = current;
            }
            const record = await this.record(key);
            const reason = noteworthy(incident.noted, current);
            const due =
                Boolean(reason) &&
                !record.pending &&
                now - incident.notedAt >= NOTE_EVERY_MS &&
                record.lines.length < MAX_LINES - 1 &&
                investigates(incident.kind) &&
                reserve();
            if (due) {
                Object.assign(incident, { noted: current, notedAt: now });
                await this.ctx.storage.put(`lines:${key}`, {
                    ...record,
                    pending: true,
                });
                notes.push({ key, moment: "change", reason });
            }
            const card = renderCard(key, incident, {
                lines: record.lines,
                checking: record.pending || due,
                now,
            });
            if (card.text !== incident.text) {
                if (await update(this.env, incident.messageId, card))
                    incident.text = card.text;
                else failed++;
            }
        }

        if (notes.length) await this.ctx.storage.put("ai", ai);
        await this.ctx.storage.put("state", next.state);
        for (const note of notes) this.background(() => this.note(note, data));
        if (failed)
            console.error(`${failed} Discord write(s) failed; retrying`);
        return {
            found: Object.keys(found),
            open: Object.keys(next.state.open),
            actions: next.actions.map((a) => `${a.type} ${a.key}`),
            failed,
        };
    }

    // Who is failing and the main error, from Tinybird, refreshed at most
    // every ENRICH_EVERY_MS and carried over in between. At opening, also the
    // card's frozen start.
    async enrich(incident, tools, now, opening) {
        const { model } = incident.info;
        if (opening || now - (incident.enriched?.at ?? 0) >= ENRICH_EVERY_MS) {
            const [spread, errors] = await Promise.all([
                tools.caller_spread({ model }),
                tools.recent_errors({ model }),
            ]);
            if (spread.error) console.error(`callers: ${spread.error}`);
            incident.enriched = {
                at: now,
                callers: spread.error ? null : spread,
                errorKind: errors.groups?.[0]?.error_kind ?? null,
            };
        }
        const { callers, errorKind } = incident.enriched;
        incident.info = { ...incident.info, callers, errorKind };
        if (opening) incident.start = incident.info;
    }

    // Writes one AI line for a moment of an incident, then edits its card
    // from the newest state. Without a line, "checking why…" just goes.
    async note({ key, moment, reason, incident: closed }, data) {
        const record = await this.record(key);
        const incident =
            closed ?? (await this.ctx.storage.get("state"))?.open?.[key];
        if (!incident) return;
        let text = null;
        try {
            const apiKey = this.env.POLLINATIONS_API_KEY;
            if (!apiKey) throw new Error("POLLINATIONS_API_KEY missing");
            const footprint = closed && {
                down: duration(closed.closedAt - closed.openedAt),
                lost: closed.lost,
            };
            text = await ask(
                apiKey,
                {
                    moment,
                    reason,
                    footprint,
                    previous: record.lines.map((l) => l.text),
                    ...evidence({ info: incident.info }, data),
                },
                toolsFor(data, { tinybirdToken: this.env.TINYBIRD_TOKEN }),
            );
            if (!text) console.error("investigator: no answer");
        } catch (error) {
            console.error(`investigator: ${error.message}`);
        }
        const lines = text
            ? [...record.lines, { at: Date.now(), text }]
            : record.lines;
        // The incident may have changed, or closed, while the AI was writing.
        const latest =
            closed ?? (await this.ctx.storage.get("state"))?.open?.[key];
        if (closed) await this.ctx.storage.delete(`lines:${key}`);
        else
            await this.ctx.storage.put(`lines:${key}`, {
                lines,
                pending: false,
            });
        if (!latest) return;
        const card = renderCard(key, latest, { lines, now: Date.now() });
        if (!(await update(this.env, latest.messageId, card)))
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
