import { DurableObject } from "cloudflare:workers";
import {
    edit,
    exclusive,
    MAINTAINERS,
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
    pipe,
    toolsFor,
} from "./investigate.js";
import {
    cardColor,
    conditions,
    duration,
    escalates,
    escalation,
    noteworthy,
    pings,
    renderCard,
    snapshot,
    step,
    waiting,
} from "./rules.js";
import {
    holdDomains,
    listAll,
    pending,
    REVIEW_PROMPT,
    reviewEvidence,
    verdict,
} from "./setup-holds.js";

const PUBLIC = "https://gen.pollinations.ai";
const UPSTREAM = "https://gen.myceli.ai";
// The pollinations.ai Discord server, for links to a card.
const GUILD = "885844321461485618";
// Who is failing and the main error, for an open model incident, are read
// from Tinybird at most this often.
const ENRICH_EVERY_MS = 5 * 60 * 1000;
// A change gets a new AI line at most this often, and a card at most this
// many lines: the opening one, a few changes, and the closing one.
const NOTE_EVERY_MS = 30 * 60 * 1000;
const MAX_LINES = 4;
// A closed card's last edit is retried each check for this long; after that
// its message is likely gone.
const FINAL_RETRY_MS = 24 * 60 * 60 * 1000;

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
    // Every card write goes through one queue, in order, so a slow AI edit
    // can never land after a card's closing edit.
    writes = serial();

    async lastCheck() {
        return (await this.ctx.storage.get("checkedAt")) ?? null;
    }

    async check() {
        return (await this.once(() => this.run())) ?? { skipped: true };
    }

    // A card's AI lines, kept apart from the incident so the check and a
    // background AI call never overwrite each other, and keyed by the card so
    // a late line can never reach a newer incident's card. A closed card's
    // record also holds its closed incident, which marks the card closed,
    // until its last edit lands and the check that closed it is saved.
    async record(id) {
        return (
            (await this.ctx.storage.get(`lines:${id}`)) ?? {
                lines: [],
                pending: false,
            }
        );
    }

    async run() {
        const now = Date.now();
        let found;
        // Sign-up bursts and review requests per email domain; null when
        // the read failed, so their open cards are left as they are.
        let signups = [];
        let reviews = new Map();
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
                [signups, reviews] = await Promise.all([
                    this.signups(),
                    this.reviews(),
                ]);
                found = conditions({
                    ...data,
                    hosts,
                    signups: signups ?? [],
                    reviews: reviews ?? new Map(),
                });
            } catch (error) {
                console.error(`check failed: ${error.message}`);
                found = conditions({ hosts, analyticsDown: true });
            }

        const saved = (await this.ctx.storage.get("state")) ?? {};
        // A card closed by a check whose state save then failed: its record
        // says closed while the saved state still has it open. The record
        // wins, so a new failure opens a new card instead of editing this one.
        const records = await this.ctx.storage.list({ prefix: "lines:" });
        const open = { ...saved.open };
        const closed = { ...saved.closed };
        for (const [name, record] of records) {
            const key = record.closed?.key;
            if (key && open[key]?.messageId === name.slice("lines:".length)) {
                delete open[key];
                closed[key] = record.closed.incident.closedAt;
            }
        }
        // Unknown sign-ups or reviews keep their open cards. A sign-up card
        // Discord hasn't taken yet is retried until it has: its 24-hour
        // window can end first.
        const unknown = [
            signups === null && "signup:",
            reviews === null && "review:",
        ].filter(Boolean);
        for (const [key, incident] of Object.entries(open))
            if (unknown.some((prefix) => key.startsWith(prefix)))
                found[key] ??= incident.info;
        const unposted = { ...saved.unposted };
        for (const [key, info] of Object.entries(unposted)) found[key] ??= info;
        const next = step({ ...saved, open, closed }, found, now, data.recent);
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

        // A closed card whose last edit failed, or whose closing line a
        // restart lost, is written again. Once written, its record goes when
        // the saved state no longer holds the card open: until then a late
        // AI line would take the card for open and edit it back.
        for (const [name, record] of records) {
            if (!record.closed) continue;
            const id = name.slice("lines:".length);
            if (record.done) {
                if (saved.open?.[record.closed.key]?.messageId !== id)
                    await this.ctx.storage.delete(name);
            } else if (now - record.closed.incident.closedAt > FINAL_RETRY_MS) {
                await this.ctx.storage.delete(name);
            } else if (!waiting(record, now)) {
                if (!(await this.writes(() => this.finish(id)))) failed++;
            }
        }

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
                const id = incident.messageId;
                const closing =
                    Boolean(model) && investigates(incident.kind) && reserve();
                // With a closing line to come, the card turns green with
                // "checking why…" now and gets its last edit from the note.
                const delivered = await this.writes(async () => {
                    const { lines } = await this.record(id);
                    await this.ctx.storage.put(`lines:${id}`, {
                        lines,
                        pending: closing,
                        pendingAt: now,
                        closed: { key, incident },
                    });
                    if (!closing) return this.finish(id);
                    const card = renderCard(key, incident, {
                        lines,
                        checking: true,
                    });
                    return update(this.env, id, card);
                });
                if (!delivered) failed++;
                if (closing) notes.push({ key, id, moment: "closed" });
                continue;
            }

            const incident = next.state.open[key];
            if (model)
                await this.enrich(incident, tools, now, action.type === "open");

            if (action.type === "open") {
                incident.pinged = pings(incident);
                const checking = investigates(incident.kind) && reserve();
                const card = renderCard(key, incident, { checking, now });
                const saved = await this.writes(() => post(this.env, card));
                if (!saved?.id) {
                    // Not posted, or no readable receipt to edit it by: the
                    // incident opens again next check.
                    failed++;
                    delete next.state.open[key];
                    if (key.startsWith("signup:"))
                        unposted[key] = incident.info;
                    continue;
                }
                delete unposted[key];
                Object.assign(incident, {
                    messageId: saved.id,
                    channelId: saved.channel_id,
                    text: card.text,
                    noted: snapshot(incident),
                    notedAt: now,
                    alerted: snapshot(incident),
                });
                await this.ctx.storage.put(`lines:${saved.id}`, {
                    lines: [],
                    pending: checking,
                    pendingAt: now,
                });
                if (checking) notes.push({ key, id: saved.id, moment: "open" });
                continue;
            }

            // Update: the card changes only when its text does, gets an AI
            // line only on a real change, and pings again only if worse.
            const current = snapshot(incident);
            if (escalates(incident.alerted, current)) {
                const link = `https://discord.com/channels/${GUILD}/${incident.channelId}/${incident.messageId}`;
                const notice = escalation(key, incident, link);
                if (await this.writes(() => post(this.env, notice)))
                    incident.alerted = current;
            }
            const id = incident.messageId;
            const record = await this.record(id);
            const pending = waiting(record, now);
            const reason = noteworthy(incident.noted, current);
            const due =
                Boolean(reason) &&
                !pending &&
                now - incident.notedAt >= NOTE_EVERY_MS &&
                record.lines.length < MAX_LINES - 1 &&
                investigates(incident.kind) &&
                reserve();
            if (due) {
                Object.assign(incident, { noted: current, notedAt: now });
                await this.ctx.storage.put(`lines:${id}`, {
                    ...record,
                    pending: true,
                    pendingAt: now,
                });
                notes.push({ key, id, moment: "change", reason });
            }
            const card = renderCard(key, incident, {
                lines: record.lines,
                checking: pending || due,
                now,
            });
            if (card.text !== incident.text) {
                if (await this.writes(() => update(this.env, id, card)))
                    incident.text = card.text;
                else failed++;
            }
        }

        if (notes.length) await this.ctx.storage.put("ai", ai);
        await this.ctx.storage.put("state", { ...next.state, unposted });
        // A completed check: what /health reports to the outside heartbeat.
        await this.ctx.storage.put("checkedAt", now);
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

    // Sign-up bursts, each domain held while holds are on; null if they
    // couldn't be read.
    async signups() {
        try {
            const rows = await pipe(
                "infra_watch_signups",
                {},
                { tinybirdToken: this.env.TINYBIRD_TOKEN, fetchImpl: fetch },
            );
            return this.env.SETUP_REWARD_HOLDS === "on"
                ? await holdDomains(this.env.SETUP_HOLDS, rows)
                : rows;
        } catch (error) {
            console.error(`signups: ${error.message}`);
            return null;
        }
    }

    // What the AI reads for a review: the domain's sign-ups and the listed
    // accounts' API use from Tinybird, numbers only. A failed read comes
    // through as { error }.
    async reviewFacts(info) {
        const read = (name, params) =>
            pipe(name, params, {
                tinybirdToken: this.env.TINYBIRD_TOKEN,
                fetchImpl: fetch,
            }).catch((error) => ({ error: error.message }));
        const [signups, usage] = await Promise.all([
            read("infra_watch_review_signups", { domain: info.domain }),
            read("infra_watch_review_usage", {
                user_ids: info.accounts.map((a) => a.userId).join(","),
            }),
        ]);
        return reviewEvidence(info, signups, usage, Date.now());
    }

    // Review requests still waiting for a decision, per domain; null if
    // they couldn't be read.
    async reviews() {
        try {
            const kv = this.env.SETUP_HOLDS;
            return pending(
                ...(await Promise.all(
                    ["review:", "decision:", "hold:", "release:"].map(
                        (prefix) => listAll(kv, prefix),
                    ),
                )),
            );
        } catch (error) {
            console.error(`reviews: ${error.message}`);
            return null;
        }
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

    // A closed card's last edit, run inside the write queue. Once Discord has
    // it, the record is marked done; a later check deletes it.
    async finish(id) {
        const record = await this.record(id);
        if (!record.closed) return true;
        const { key, incident } = record.closed;
        const card = renderCard(key, incident, { lines: record.lines });
        if (!(await update(this.env, id, card))) return false;
        await this.ctx.storage.put(`lines:${id}`, { ...record, done: true });
        return true;
    }

    // Writes one AI line for a moment of an incident, then edits its card.
    // Without a line, "checking why…" just goes. The edit goes through the
    // write queue and only touches the card it was asked for: while open, or
    // by the closing line's last edit.
    async note({ key, id, moment, reason }, data) {
        const closing = moment === "closed";
        const record = await this.record(id);
        const incident = closing
            ? record.closed?.incident
            : (await this.ctx.storage.get("state"))?.open?.[key];
        if (incident?.messageId !== id) return;
        let text = null;
        try {
            const apiKey = this.env.POLLINATIONS_API_KEY;
            if (!apiKey) throw new Error("POLLINATIONS_API_KEY missing");
            const footprint = closing && {
                down: duration(incident.closedAt - incident.openedAt),
                lost: incident.lost,
            };
            const tinybird = { tinybirdToken: this.env.TINYBIRD_TOKEN };
            const previous = record.lines.map((l) => l.text);
            text =
                incident.kind === "REVIEW"
                    ? verdict(
                          await ask(
                              apiKey,
                              {
                                  moment,
                                  reason,
                                  previous,
                                  ...(await this.reviewFacts(incident.info)),
                              },
                              {},
                              { system: REVIEW_PROMPT, specs: [] },
                          ),
                      )
                    : await ask(
                          apiKey,
                          {
                              moment,
                              reason,
                              footprint,
                              previous,
                              ...evidence({ info: incident.info }, data),
                          },
                          toolsFor(data, tinybird),
                      );
            if (!text) console.error("investigator: no answer");
        } catch (error) {
            console.error(`investigator: ${error.message}`);
        }
        // The line keeps the card's colour from when the AI looked.
        const line = text && {
            at: Date.now(),
            text,
            color: cardColor(incident),
        };
        const done = await this.writes(async () => {
            const current = await this.record(id);
            const lines = line ? [...current.lines, line] : current.lines;
            if (current.closed) {
                // A closed card's lines wait for its last edit: written now
                // by the closing line, or by a later check if that fails.
                await this.ctx.storage.put(`lines:${id}`, {
                    ...current,
                    lines,
                    pending: closing ? false : current.pending,
                });
                return closing ? this.finish(id) : true;
            }
            const latest = (await this.ctx.storage.get("state"))?.open?.[key];
            if (latest?.messageId !== id) return true;
            await this.ctx.storage.put(`lines:${id}`, {
                lines,
                pending: false,
            });
            const card = renderCard(key, latest, { lines, now: Date.now() });
            return update(this.env, id, card);
        });
        if (!done) console.error("investigator: edit failed");
    }
}

const watch = (env) => env.WATCH.get(env.WATCH.idFromName("main"));

export default {
    async scheduled(_event, env) {
        await watch(env).check();
    },
    // GET /health: the last completed check, read by heartbeat.mjs from
    // outside Cloudflare. It never runs a check; local runs use
    // /__scheduled (wrangler dev --test-scheduled).
    async fetch(request, env) {
        if (new URL(request.url).pathname !== "/health")
            return new Response("not found", { status: 404 });
        return Response.json({ checkedAt: await watch(env).lastCheck() });
    },
};
