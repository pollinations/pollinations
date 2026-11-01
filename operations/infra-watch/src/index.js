import { DurableObject } from "cloudflare:workers";
import {
    AGENT_DAILY_LIMIT,
    brief,
    COMMUNITY_PROMPT,
    decision,
    filteredModels,
    incidents,
    listingChanges,
    QUIET_MS,
    servedStreaks,
    WINDOW_MINUTES,
} from "./community.js";
import {
    discordIds,
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
import { dueProbes, FORGET_MS, pool, probe, recordProbe } from "./probes.js";
import { holdDomains, sweepDomains } from "./quest-restrictions.js";
import {
    conditions,
    duration,
    escalates,
    legacyDown,
    lineColor,
    noteworthy,
    pings,
    renderCard,
    snapshot,
    step,
    waiting,
} from "./rules.js";

const PUBLIC = "https://gen.pollinations.ai";
const UPSTREAM = "https://gen.myceli.ai";
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
// The last full UTC hour (legacy bridges, served models) changes on the
// hour; it is read once an hour, this long after it, when Tinybird has that
// hour in full.
const HOUR_MS = 60 * 60 * 1000;
const LAST_HOUR_READ_DELAY_MS = 5 * 60 * 1000;
// The community agent runs this often, like the retired monitor's
// half-hourly cycle, and its probes run at most this many at a time.
const CYCLE_MS = 30 * 60 * 1000;
const PROBE_POOL = 4;
// Its answer is two short posts, after its reasoning.
const AGENT_MAX_TOKENS = 6000;
// Community listing changes are given to it once a day, from 12:00 UTC: a
// check's listings day is its UTC date 12 hours earlier.
const LISTINGS_DAY_STARTS_MS = 12 * 60 * 60 * 1000;

const getJson = (url) =>
    withTimeout(20_000, async (signal) => {
        const res = await fetch(url, { signal });
        if (!res.ok) throw new Error(`${url} -> ${res.status}`);
        return res.json();
    });

// `traffic`: "regular" leaves out legacy-API and internal traffic.
const statusRows = async (gen, minutes, traffic) =>
    (
        await getJson(
            `${gen}/models/status?minutes=${minutes}${traffic ? `&traffic=${traffic}` : ""}`,
        )
    ).data;

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
// error, never a silent dry run. Posts to the infra-watch channel, or the
// community channel with COMMUNITY_WEBHOOK_URL. Returns the saved message.
async function post(env, message, webhook = "DISCORD_WEBHOOK_URL") {
    const body = payload(
        message,
        MAINTAINERS,
        discordIds(env.OWNER_DISCORD_IDS),
    );
    if (env.DRY_RUN === "1") {
        show(`dry-run ${webhook}`, body);
        return { id: "dry-run", channel_id: "dry-run" };
    }
    if (!env[webhook]) throw new Error(`${webhook} missing`);
    return send(env[webhook], body);
}

async function update(env, id, message) {
    const body = payload(message, MAINTAINERS);
    if (env.DRY_RUN === "1") {
        show("dry-run edit", body);
        return true;
    }
    return edit(env.DISCORD_WEBHOOK_URL, id, body);
}

async function remove(env, id) {
    if (env.DRY_RUN === "1") return true;
    return edit(env.DISCORD_WEBHOOK_URL, id, null);
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
    // The community cycle in flight, if any: a check never waits for it.
    cycle = null;

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

    // One-time retirement of the old in-app review queue. Failed Discord
    // edits stay in storage for retry, apart from the operational alerts.
    async retireReviews(saved, records) {
        const retry = {};
        let complete = true;
        const retire = (id) =>
            this.writes(() =>
                update(this.env, id, {
                    text: "REVIEW CLOSED: account checks now go through hello@pollinations.ai. Quest spending restrictions are managed on the account.",
                    color: 0x639922,
                    ping: false,
                }),
            );
        for (const [key, incident] of Object.entries(saved.open ?? {})) {
            if (incident.kind !== "REVIEW") continue;
            if (incident.messageId && !(await retire(incident.messageId))) {
                retry[key] = incident;
                complete = false;
            } else if (incident.messageId)
                await this.ctx.storage.delete(`lines:${incident.messageId}`);
            records.delete(`lines:${incident.messageId}`);
            delete saved.open[key];
        }
        for (const [name, record] of records) {
            if (record.closed?.incident.kind !== "REVIEW") continue;
            if (await retire(name.slice("lines:".length)))
                await this.ctx.storage.delete(name);
            else complete = false;
            records.delete(name);
        }
        for (const key of Object.keys(saved.unposted ?? {}))
            if (key.startsWith("review:")) delete saved.unposted[key];
        return { retry, complete };
    }

    async run() {
        const now = Date.now();
        let found;
        // Sign-up bursts per email domain; null when the read failed, so
        // their open cards are left as they are.
        let signups = [];
        // The legacy bridges' last reading; null when none could be read.
        let legacy = [];
        let data = { recent: [], last10: [], last60: [], official: new Set() };
        // gen's public catalog; null when it couldn't be read.
        let publicModels = null;
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
                publicModels = models;
                data = { recent: r15, last10: r10, last60: r60, official };
                [signups, legacy] = await Promise.all([
                    this.signups(now),
                    this.legacy(now),
                ]);
                found = conditions({
                    ...data,
                    hosts,
                    signups: signups ?? [],
                });
            } catch (error) {
                console.error(`check failed: ${error.message}`);
                found = conditions({ hosts, analyticsDown: true });
            }

        const sweeps = await sweepDomains(
            this.env.DB,
            this.env.SETUP_HOLDS,
            this.ctx.storage,
            now,
        );
        for (const info of Object.values(found))
            if (info.kind === "SIGNUP_BURST")
                info.sweepPending = sweeps[info.domain]?.followup === true;

        const saved = (await this.ctx.storage.get("state")) ?? {};
        // A card closed by a check whose state save then failed: its record
        // says closed while the saved state still has it open. The record
        // wins, so a new failure opens a new card instead of editing this one.
        const records = await this.ctx.storage.list({ prefix: "lines:" });
        const retiredReviews = saved.reviewsRetired
            ? { retry: {}, complete: true }
            : await this.retireReviews(saved, records);
        const open = { ...saved.open };
        const closed = { ...saved.closed };
        for (const [name, record] of records) {
            const key = record.closed?.key;
            if (key && open[key]?.messageId === name.slice("lines:".length)) {
                delete open[key];
                closed[key] = record.closed.incident.closedAt;
            }
        }
        // A legacy bridge's open card is judged against the medians it
        // started with.
        if (legacy) Object.assign(found, legacyDown(legacy, open));
        // Unknown sign-ups or legacy bridges keep their open cards.
        // A sign-up card Discord hasn't taken yet is retried until it has:
        // its 24-hour window can end first.
        const unknown = [
            signups === null && "signup:",
            legacy === null && "legacy:",
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
            const id = name.slice("lines:".length);
            if (!record.closed) {
                // A card no open incident points to: moved to the bottom, or
                // posted by a check whose save failed. It goes, then its
                // lines; a failed delete is tried again next check.
                const kept = Object.values(open).some(
                    (i) => i.messageId === id,
                );
                if (!kept && (await this.writes(() => remove(this.env, id))))
                    await this.ctx.storage.delete(name);
                continue;
            }
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
                // With a closing line to come, the card closes with
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
                if (checking)
                    notes.push({
                        key,
                        id: saved.id,
                        moment: "open",
                        info: incident.info,
                    });
                continue;
            }

            // Update: the card changes only when its text does, gets an AI
            // line only on a real change, and pings again only if worse.
            const current = snapshot(incident);
            // Worse: an edit never pings, so the card is posted again at the
            // bottom with the ping and all its lines; the next check deletes
            // the old one. It waits while an AI line is still on its way to
            // the old card.
            const old = await this.record(incident.messageId);
            if (escalates(incident.alerted, current) && !waiting(old, now)) {
                const card = renderCard(
                    key,
                    { ...incident, pinged: true },
                    { lines: old.lines, now },
                );
                const saved = await this.writes(() => post(this.env, card));
                // Accepted, it never pings twice. Without a readable receipt
                // the old card stays the one kept up to date.
                if (saved) incident.alerted = current;
                if (saved?.id) {
                    await this.ctx.storage.put(`lines:${saved.id}`, old);
                    Object.assign(incident, {
                        pinged: true,
                        messageId: saved.id,
                        channelId: saved.channel_id,
                        text: card.text,
                    });
                } else if (!saved) failed++;
            }
            const id = incident.messageId;
            const record = await this.record(id);
            const pending = waiting(record, now);
            const reason = noteworthy(incident.noted, current);
            const wanted =
                Boolean(reason) &&
                now - incident.notedAt >= NOTE_EVERY_MS &&
                record.lines.length < MAX_LINES - 1;
            const due =
                wanted && !pending && investigates(incident.kind) && reserve();
            if (due) {
                Object.assign(incident, { noted: current, notedAt: now });
                await this.ctx.storage.put(`lines:${id}`, {
                    ...record,
                    pending: true,
                    pendingAt: now,
                });
                notes.push({
                    key,
                    id,
                    moment: "change",
                    reason,
                    info: incident.info,
                });
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
        await this.ctx.storage.put("state", {
            ...next.state,
            open: { ...next.state.open, ...retiredReviews.retry },
            reviewsRetired: retiredReviews.complete,
            unposted,
        });
        if (publicModels)
            this.cycle ??= this.community(gen, publicModels, now)
                .catch((error) => console.error(`community: ${error.message}`))
                .finally(() => {
                    this.cycle = null;
                });
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

    // Each legacy bridge's row from Tinybird, read once an hour from 5
    // minutes past. Before then, between reads and when a read fails, the
    // last rows stand; null if none was ever read.
    async legacy(now) {
        const hour = Math.floor(now / HOUR_MS);
        const saved = await this.ctx.storage.get("legacy");
        if (saved?.hour === hour || now % HOUR_MS < LAST_HOUR_READ_DELAY_MS)
            return saved?.rows ?? null;
        try {
            const rows = await pipe(
                "infra_watch_legacy",
                {},
                { tinybirdToken: this.env.TINYBIRD_TOKEN, fetchImpl: fetch },
            );
            await this.ctx.storage.put("legacy", { hour, rows });
            return rows;
        } catch (error) {
            console.error(`legacy: ${error.message}`);
            return saved?.rows ?? null;
        }
    }

    // Every half hour, the community monitor (community.js): code probes the
    // due models and finds the incidents worth telling, by Thomas's rules;
    // one AI call with COMMUNITY_AGENT_KEY groups them into posts and words
    // them. Each post is sent on its own, and only a delivered one starts
    // its incidents' quiet periods: anything else stays pending. A failure
    // ends the cycle, logged where it starts.
    async community(gen, catalog, now) {
        const state = (await this.ctx.storage.get("community")) ?? {};
        if (now - (state.at ?? 0) < CYCLE_MS) return;
        state.at = now;
        // A model gone from the catalog keeps its backoff for a week; a quiet
        // period lasts a week at most.
        const listed = new Set(catalog.map((m) => m.name));
        state.schedule = Object.fromEntries(
            Object.entries(state.schedule ?? {}).filter(
                ([name, s]) => listed.has(name) || now - s.lastAt < FORGET_MS,
            ),
        );
        state.quiet = Object.fromEntries(
            Object.entries(state.quiet ?? {}).filter(
                ([, at]) => now - at < QUIET_MS.fallback,
            ),
        );
        const save = () => this.ctx.storage.put("community", state);
        await save();
        const key = this.env.COMMUNITY_PROBE_KEY;
        if (!key) throw new Error("COMMUNITY_PROBE_KEY missing");
        const rows = await statusRows(gen, WINDOW_MINUTES, "regular");
        await pool(
            dueProbes(catalog, rows, state.schedule, now),
            PROBE_POOL,
            async (model) => {
                const previous = state.schedule[model.name];
                const result = await probe(gen, key, model, previous);
                state.schedule[model.name] = recordProbe(previous, result);
                await save();
                if (!result.ok)
                    console.log(
                        `probe ${model.name}: ${result.status} ${result.requestId ?? ""}`,
                    );
            },
        );

        const listings = await this.listingsToday(gen, catalog, now);
        state.served = await this.served(state.served, listed, now);
        const { found, pending } = incidents({
            catalog,
            rows,
            schedule: state.schedule,
            quiet: state.quiet,
            pending: state.pending,
            served: state.served.seen,
            listings: listings?.changes ?? null,
            now,
        });
        state.pending = pending;
        await save();
        // A day with no listing changes to tell, or the first, only saves
        // the set.
        if (listings && !found.some((i) => i.kind === "listings"))
            await this.ctx.storage.put("listings", listings.saved);
        if (!found.length) return;
        const agentKey = this.env.COMMUNITY_AGENT_KEY;
        if (!agentKey) throw new Error("COMMUNITY_AGENT_KEY missing");
        const budget = allow(state.ai, now, AGENT_DAILY_LIMIT);
        if (!budget) throw new Error("daily agent limit reached");
        state.ai = budget;
        await save();
        const plan = decision(
            await ask(
                agentKey,
                { incidents: found.map(brief) },
                {},
                {
                    system: COMMUNITY_PROMPT,
                    specs: [],
                    answer: (text) => text,
                    maxTokens: AGENT_MAX_TOKENS,
                },
            ),
            found,
        );
        if (!plan) throw new Error("the agent gave no decision");
        for (const [message, webhook] of [
            [plan.community, "COMMUNITY_WEBHOOK_URL"],
            [
                plan.maintainers && { ...plan.maintainers, ping: true },
                undefined,
            ],
        ]) {
            if (!message || !(await post(this.env, message, webhook))) continue;
            for (const incident of message.incidents) {
                for (const k of incident.quiet) state.quiet[k] = now;
                if (incident.kind === "listings")
                    await this.ctx.storage.put("listings", listings.saved);
                // A told mismatch needs a new check before it is due again.
                if (incident.kind === "mismatch")
                    state.served.seen[incident.model].streak = 1;
            }
        }
        await save();
    }

    // The catalog models whose upstream answered with a different model,
    // read from Tinybird once an hour from 5 minutes past, over the last
    // full UTC hour, with each one's run of checks. The pipe is given that
    // hour, so a read that lands after the next hour starts still checks it
    // once. Until then the last reading stands; an hour that can't be read
    // is a skipped check, which leaves every run as it is.
    async served(last, names, now) {
        const hour = Math.floor(now / HOUR_MS) - 1;
        if (last?.hour === hour || now % HOUR_MS < LAST_HOUR_READ_DELAY_MS)
            return last ?? { hour: null, seen: {} };
        let rows = [];
        try {
            rows = await pipe(
                "infra_watch_served_model",
                { start: (hour * HOUR_MS) / 1000 },
                { tinybirdToken: this.env.TINYBIRD_TOKEN, fetchImpl: fetch },
            );
        } catch (error) {
            console.error(`served models: ${error.message}`);
        }
        return { hour, seen: servedStreaks(rows, last?.seen, names) };
    }

    // The day's community listing changes for the agent, once a day from
    // 12:00 UTC, with the filtered set to save once it has read them. The
    // first day only saves the set. Null when today's are done or can't be
    // judged yet.
    async listingsToday(gen, catalog, now) {
        const day = new Date(now - LISTINGS_DAY_STARTS_MS)
            .toISOString()
            .slice(0, 10);
        const before = await this.ctx.storage.get("listings");
        if (before?.day === day) return null;
        const shown = await getJson(`${gen}/models?community=true`);
        const list = Array.isArray(shown) ? shown : shown.data;
        const filtered = filteredModels(catalog, list);
        if (!filtered) return null;
        return {
            changes: before && listingChanges(before.filtered, filtered, list),
            saved: { day, filtered: filtered.map((m) => m.name) },
        };
    }

    // Sign-up bursts, each domain held at once; null if they couldn't be
    // read. A burst is 20 or more new accounts in 24 hours: the pipe counts
    // more than `limit`.
    async signups(now) {
        try {
            const rows = await pipe(
                "infra_watch_signups",
                { limit: 19 },
                { tinybirdToken: this.env.TINYBIRD_TOKEN, fetchImpl: fetch },
            );
            return await holdDomains(
                this.env.SETUP_HOLDS,
                this.ctx.storage,
                rows,
                now,
            );
        } catch (error) {
            console.error(`signups: ${error.message}`);
            return null;
        }
    }

    // Who is failing and the main error, refreshed at most every
    // ENRICH_EVERY_MS. At opening, also the card's frozen start.
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
            text = await ask(
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
        // The line keeps its colour from when the AI looked (green for the
        // closing line).
        const line = text && {
            at: Date.now(),
            text,
            color: lineColor(incident),
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
