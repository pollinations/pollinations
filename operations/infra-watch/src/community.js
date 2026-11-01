// The community monitor, ported from the retired one
// (operations/community-monitor/CYCLE.md): code applies Thomas's rules,
// picks this cycle's incidents and keeps their quiet periods, and draws each
// one's card; one AI call only sorts them into posts and writes a sentence
// under each. No Cloudflare imports, so it is testable with plain Node.
import { COLOR, panel } from "./rules.js";

// Traffic and fallbacks are read over the last 4 hours.
export const WINDOW_MINUTES = 240;
// The agent's calls per UTC day. The half-hourly cycle already allows no
// more; this is a second spending guard on purpose, kept in case the
// cycle ever runs more often.
export const AGENT_DAILY_LIMIT = 48;
const DAY_MS = 24 * 60 * 60 * 1000;
// A told incident stays quiet this long: a broken stream per model and
// error, a fallback notice per model and fallback, a mismatch per model and
// reported name.
export const QUIET_MS = {
    stream: DAY_MS,
    fallback: 7 * DAY_MS,
    mismatch: 7 * DAY_MS,
};
// Thomas's thresholds: a model leans on its fallbacks from this many
// rescues and this share of its successes; one broken stream on this many
// owners' models at once is gen's. A fallback notice names this many.
const MIN_RESCUED = 10;
const MIN_RESCUED_SHARE = 0.25;
const SHARED_OWNERS = 3;
const VIA_SHOWN = 3;

export const COMMUNITY_PROMPT = `You write the Pollinations community model monitor's Discord posts. You get this cycle's incidents as JSON; code has already decided each one is worth telling. Answer with one JSON object and nothing else:
{"community": [{"incidents": ["id"], "text": "..."}], "maintainers": [{"incidents": ["id"], "text": "..."}]}

Each line tells the one incident in its "incidents" and goes to the channel its "to" names. Code draws the incident's card above your line, with its title, models, errors and counts, so never repeat them: write one short sentence on what it means and what to do next. Never add models, numbers or links.
- stream: a model's own answers broke the same way twice in a row; its publisher should fix their endpoint.
- shared: models that worked broke the same way at once across many publishers, likely gen's own fault.
- fallback: a model leans on its fallbacks; "private" fallbacks are never named.
- mismatch: a model's answers reported a different model name than its listing requests, in two of its hourly checks in a row. The name is what the publisher's upstream reported, so word it as evidence, like "the publisher reported this name for requests configured as the requested model", and never say which model actually ran.
- listings: models newly filtered out of /models for low health, or back; filtered models stay callable by their exact ID.
Code puts lines into each post until it is full; incidents that don't fit come next time. Code pings publishers and points them to their dashboard.`;

// The public community models gen's reliability filter leaves out of the
// default listing: in the full list but not the default one, with a
// success rate of 80% or less. Agents aside. Null while no community model
// has a known rate: then nothing can be judged.
export function filteredModels(all, shown) {
    const models = all.filter((m) => m.community && !m.agent);
    if (!models.some((m) => m.health?.success_rate != null)) return null;
    const listed = new Set(shown.map((m) => m.name));
    return models.filter(
        (m) =>
            !listed.has(m.name) &&
            m.health?.success_rate != null &&
            m.health.success_rate <= 80,
    );
}

// A card names at most this many models in a list; the rest are counted.
// Ids run up to 160 characters (a 39-character owner and a 120-character
// name), and every row is as wide as the longest: at 5, the biggest card,
// a listing of two full lists, stays under 3,000 characters, with room for
// the agent's sentence and the footer in Discord's 4,096.
const SHOWN = 5;

// Since the last day: the models newly filtered, and those filtered then
// that are listed again now. One gone from both lists isn't back. Past
// SHOWN, `newlyMore` and `backMore` count those left unnamed, for
// "…and N more".
export function listingChanges(before, filtered, shown) {
    const was = new Set(before);
    const changes = { filtered: filtered.length };
    for (const [list, models] of [
        ["newly", filtered.filter((m) => !was.has(m.name))],
        ["back", shown.filter((m) => was.has(m.name))],
    ]) {
        changes[list] = models
            .slice(0, SHOWN)
            .map((m) => ({ model: m.name, health: m.health?.success_rate }));
        if (models.length > SHOWN)
            changes[`${list}More`] = models.length - SHOWN;
    }
    return changes;
}

// A model id as owners know it, and its owner: the GitHub username in it.
// Posts list owners in `owners`, which delivery pings.
const short = (id) => id.replace(/^community\//, "");
const ownerOf = (id) => short(id).split("/")[0];

// `quiet` keys: a model and its broken stream, a model and a fallback, or a
// model and the name its upstream reported.
export const streamKey = (model, error) => `stream ${model} ${error}`;
export const fallbackKey = (model, via) => `fallback ${model} ${via}`;
export const mismatchKey = (model, served) => `mismatch ${model} ${served}`;

// Names compare as the old monitor compared them: lowercase, without a
// provider prefix or a trailing :free, :paid, -latest, -preview or date;
// they agree when one contains the other.
const NAME_SUFFIX = /(:free|:paid|-latest|-preview|-\d{8}|-\d{4}-\d{2}-\d{2})$/;
export function servedName(name) {
    let base = String(name).toLowerCase().split("/").pop();
    while (NAME_SUFFIX.test(base)) base = base.replace(NAME_SUFFIX, "");
    return base;
}
const agree = (a, b) => {
    const [x, y] = [servedName(a), servedName(b)];
    return x.includes(y) || y.includes(x);
};
// Both names come from owners' servers: backticks and control characters
// are dropped, so a name can't break a post, and a URL, an IP address or
// anything shaped like a hostname is hidden, so an upstream's address is
// never told.
const ADDRESS = new RegExp(
    [
        String.raw`[a-z][\w+.-]*://\S*`, // a URL
        String.raw`\[?(?:[\da-f:.]*::[\da-f:.]*|(?:[\da-f]{1,4}:){7}[\da-f]{1,4})\]?`, // IPv6
        String.raw`\b\d{1,3}(?:\.\d{1,3}){3}\b`, // IPv4
        String.raw`\b(?:[a-z0-9-]+\.)+[a-z]{2,}\b`, // a hostname
    ].join("|"),
    "gi",
);
const printable = (name) =>
    String(name)
        .replace(/[`\p{Cc}]/gu, "")
        .replace(ADDRESS, "[host]");

// Each model of the catalog's `names` whose upstream last reported a
// different model than the one asked for, with how many of its checks in a
// row reported that name and when the last one was read, after one hour's
// `rows` read `at`. As in the old monitor, a model with no check that hour
// keeps its run, however long the gap; a check reporting the asked-for
// model ends it, and another name starts it again.
//
// A conservative first version: a row is each model's most common pair of
// that hour, so a minority of answers from another model hides behind a
// matching majority; answers without a reported name, answers from a
// fallback and image models are never checked.
export function servedStreaks(rows, seen, names, at) {
    const next = Object.fromEntries(
        Object.entries(seen ?? {}).filter(([model]) => names.has(model)),
    );
    for (const { model, declared, served } of rows) {
        const name = printable(served);
        if (agree(declared, served)) delete next[model];
        else
            next[model] = {
                declared: printable(declared),
                served: name,
                streak:
                    next[model]?.served === name ? next[model].streak + 1 : 1,
                at,
            };
    }
    return next;
}

// This cycle's incidents, each with an id, where it goes, the owners it
// pings and the quiet keys it starts once told, and the pending shared
// failures and fallback notices to keep for the next cycle. `schedule` holds
// each model's last probe and the one before; `rows` gen's status rows for
// regular traffic over WINDOW_MINUTES; `quiet` when each key was told;
// `pending` last cycle's pending incidents; `served` each model's run of
// reported names; `listings` the day's listing changes or null.
export function incidents({
    catalog,
    rows,
    schedule,
    quiet,
    pending = {},
    served = {},
    listings,
    now,
}) {
    const named = new Set(catalog.map((m) => m.name));
    const listed = new Set(
        catalog.filter((m) => m.community && !m.agent).map((m) => m.name),
    );
    const told = (key, kind) =>
        now - (quiet[key] ?? Number.NEGATIVE_INFINITY) < QUIET_MS[kind];
    const found = [];
    const add = (incident) =>
        found.push({ id: String(found.length + 1), ...incident });
    const kept = {};

    // A broken stream counts only when the model answered itself.
    const broken = (model, p) =>
        p?.status === "PROTOCOL" && (!p.modelUsed || p.modelUsed === model);
    const streams = Object.entries(schedule).filter(
        ([model, s]) => listed.has(model) && broken(model, s),
    );

    // One error on 3 or more owners' models probed in the last 4 hours, each
    // passing the probe before with its own answer, is gen's: the
    // maintainers' incident, and none of those owners'. A model broken
    // before, never probed before, or saved by a fallback (or with no
    // attribution) is never counted: owners' endpoints that stay broken often
    // fail alike without gen at fault. Each model it counted stays in it,
    // and out of its owner's incidents, while its latest probe breaks the
    // same way: a long outage stays the maintainers', told again with all
    // its models after their quiet day. Incidents saved with `probes` came
    // from a rule that counted models broken before, and are dropped.
    const worked = (model, s) =>
        s?.before?.status === 200 && s.before.modelUsed === model;
    const held = new Map();
    for (const p of Object.values(pending))
        if (p.kind === "shared")
            for (const model of p.models ?? [])
                if (
                    listed.has(model) &&
                    broken(model, schedule[model]) &&
                    schedule[model].protocolError === p.error
                )
                    held.set(p.error, [...(held.get(p.error) ?? []), model]);
    const recent = Map.groupBy(
        streams.filter(
            ([model, s]) =>
                worked(model, s) && now - s.lastAt < WINDOW_MINUTES * 60_000,
        ),
        ([, s]) => s.protocolError,
    );
    const gens = new Set();
    for (const error of new Set([...recent.keys(), ...held.keys()])) {
        const fresh = (recent.get(error) ?? []).map(([m]) => m);
        const formed = new Set(fresh.map(ownerOf)).size >= SHARED_OWNERS;
        const models = [
            ...new Set([...(held.get(error) ?? []), ...(formed ? fresh : [])]),
        ];
        if (!models.length) continue;
        for (const model of models) gens.add(model);
        kept[`shared ${error}`] = { kind: "shared", error, models };
        if (models.some((m) => !told(streamKey(m, error), "stream")))
            add({
                kind: "shared",
                to: "maintainers",
                error,
                models,
                owners: [],
                quiet: models.map((m) => streamKey(m, error)),
            });
    }

    // The same error twice in a row on the model's own answers.
    for (const [model, s] of streams) {
        const key = streamKey(model, s.protocolError);
        if (
            gens.has(model) ||
            !broken(model, s.before) ||
            s.before.protocolError !== s.protocolError ||
            told(key, "stream")
        )
            continue;
        add({
            kind: "stream",
            to: "community",
            model,
            error: s.protocolError,
            owners: [ownerOf(model)],
            quiet: [key],
        });
    }

    // A listed model whose fallbacks rescued enough of its successes. Each
    // of its fallbacks is kept, by its own id, as a pending pair from when
    // it qualifies until it is told, so a notice outlives the 4-hour window
    // and a new fallback joins an untold one. A fallback that isn't public
    // when the notice goes out is unnamed there.
    for (const r of rows) {
        const rescued = r.fallback_rescues;
        if (!r.is_rollup || !listed.has(r.model)) continue;
        if (rescued < MIN_RESCUED || rescued < MIN_RESCUED_SHARE * r.status_2xx)
            continue;
        rows.filter(
            (v) =>
                v.model === r.model &&
                !v.is_rollup &&
                v.fallback_used &&
                v.fallback_rescues > 0,
        )
            .sort((a, b) => b.fallback_rescues - a.fallback_rescues)
            .slice(0, VIA_SHOWN)
            .forEach((v) => {
                kept[fallbackKey(r.model, v.model_used)] = {
                    kind: "fallback",
                    model: r.model,
                    via: v.model_used,
                    rescued: v.fallback_rescues,
                    total: rescued,
                    successes: r.status_2xx,
                    at: now,
                };
            });
    }
    for (const [key, p] of Object.entries(pending))
        if (p.kind === "fallback" && !(key in kept) && listed.has(p.model))
            kept[key] = p;
    for (const [key, p] of Object.entries(kept))
        if (p.kind === "fallback" && told(key, "fallback")) delete kept[key];
    // One notice per model, with a snapshot per window its untold pairs come
    // from: each window's counts stay together, never summed with another's.
    const pairs = Object.entries(kept).filter(([, p]) => p.kind === "fallback");
    for (const [model, own] of Map.groupBy(pairs, ([, p]) => p.model)) {
        const snapshots = [...Map.groupBy(own, ([, p]) => p.at)]
            .sort(([a], [b]) => a - b)
            .map(([at, entries]) => ({
                from: new Date(at - WINDOW_MINUTES * 60_000).toISOString(),
                to: new Date(at).toISOString(),
                rescued: entries[0][1].total,
                successes: entries[0][1].successes,
                via: entries
                    .map(([, p]) => ({
                        model: named.has(p.via) ? p.via : "private",
                        rescued: p.rescued,
                    }))
                    .sort((a, b) => b.rescued - a.rescued),
            }));
        add({
            kind: "fallback",
            to: "community",
            model,
            snapshots,
            owners: [ownerOf(model)],
            quiet: own.map(([key]) => key),
        });
    }

    // A listed model whose upstream reported the same other name in two
    // checks in a row. Its run is the pending state: a later check that
    // reports the asked-for model, or another name, withdraws it. Told
    // again after its quiet week only on a check from that week, so a model
    // without traffic since isn't told again on old evidence.
    for (const [model, m] of Object.entries(served)) {
        const key = mismatchKey(model, m.served);
        if (
            listed.has(model) &&
            m.streak >= 2 &&
            now - m.at < QUIET_MS.mismatch &&
            !told(key, "mismatch")
        )
            add({
                kind: "mismatch",
                to: "community",
                model,
                declared: m.declared,
                served: m.served,
                owners: [ownerOf(model)],
                quiet: [key],
            });
    }

    if (listings?.newly.length || listings?.back.length)
        add({
            kind: "listings",
            to: "community",
            ...listings,
            owners: [],
            quiet: [],
        });
    return { found, pending: kept };
}

// What the agent reads of an incident: what it says, not who it pings or
// how it is kept quiet.
export const brief = ({ owners, quiet, ...incident }) => incident;

// Each incident's card: a title that says it is about community models and
// whose fault it likely is, then its facts, never cut. Posts call a model's
// owner its publisher, as the product does.
const TITLE = {
    stream: "COMMUNITY MODEL BROKEN: PUBLISHER'S ENDPOINT",
    shared: "COMMUNITY MODELS: LIKELY A GEN PROBLEM",
    fallback: "COMMUNITY MODEL RUNNING ON BACKUP",
    mismatch: "COMMUNITY MODEL NAME MISMATCH",
    listings: "COMMUNITY MODELS HIDDEN OR BACK IN LIST",
};
// Up to SHOWN values under one label, then how many more.
const named = (label, values, more = values.length - SHOWN) => [
    ...values.slice(0, SHOWN).map((v, n) => [n ? "" : label, v]),
    ...(more > 0 ? [["", `…and ${more} more`]] : []),
];
const health = (m) =>
    m.health == null
        ? short(m.model)
        : `${short(m.model)} (${Math.round(m.health)}%)`;
// The error without "stream returned ", so the box stays narrow enough for
// Discord not to wrap it.
const error = (i) => i.error.replace(/^stream returned /, "");
const ROWS = {
    stream: (i) => [
        ["MODEL", short(i.model)],
        ["ERROR", error(i)],
    ],
    shared: (i) => [
        ["ERROR", error(i)],
        [
            "MODELS",
            `${i.models.length} from ${new Set(i.models.map(ownerOf)).size} publishers`,
        ],
        ...named("", i.models.map(short)),
    ],
    fallback: (i) => [
        ["MODEL", short(i.model)],
        ...i.snapshots.flatMap((s) => [
            ["WINDOW", `${s.from.slice(11, 16)}–${s.to.slice(11, 16)} UTC`],
            ["RESCUED", `${s.rescued} of ${s.successes} answers`],
            ...s.via.map((v, n) => [
                n ? "" : "BACKUP",
                `${short(v.model)} (${v.rescued})`,
            ]),
        ]),
    ],
    mismatch: (i) => [
        ["MODEL", short(i.model)],
        ["REQUESTED", i.declared],
        ["REPORTED", i.served],
    ],
    listings: (i) => [
        ...named("HIDDEN", i.newly.map(health), i.newlyMore),
        ...named("BACK", i.back.map(health), i.backMore),
        ["TOTAL", `${i.filtered} hidden now`],
    ],
};
const card = (i) =>
    panel(TITLE[i.kind], ROWS[i.kind](i), COLOR.PRIMARY_WEAK, { whole: true });

// Discord cuts an embed at 4,096 characters.
const LIMIT = 4096;
// Discord takes at most this much message text, where the mentions go. An
// owner takes their GitHub name or a mention, `<@` and up to 20 digits.
const CONTENT_LIMIT = 2000;
const mentionSize = (owners) =>
    owners.reduce((size, o) => size + Math.max(o.length, 23) + 1, 0);
// Every community post ends here, the one link it carries.
const MY_MODELS =
    "\n\nPublishers see their models' errors on [My Models](https://enter.pollinations.ai/my-models).";

// The agent reads model ids their owners chose, so it may write no link:
// Markdown escapes are undone as Discord would, Markdown links keep only
// their text, and any word with ":/", ":\\", ":%2f" or "www." is dropped.
const noLinks = (text) =>
    text
        .replace(/\\(?=[^\w\s])/g, "")
        .replace(/\[([^\]]*)\]\([^)]*\)?/g, "$1")
        .replace(/\S*(?::(?:[\\/]|%2f)|www\.)\S*/gi, "");

// The agent's posts within the rails, or null if its answer isn't one.
// Each line tells only incidents code found for its channel, goes under
// their cards, and carries no link of its own. Lines go into the post while
// it and its mentions fit, each with as many of its incidents as fit: those
// left out stay pending, so a post never shows less than it pings and
// acknowledges.
export function decision(text, found) {
    let answer;
    try {
        answer = JSON.parse(
            (text ?? "").replace(/^\s*```(?:json)?|```\s*$/g, ""),
        );
    } catch {
        return null;
    }
    const byId = new Map(found.map((i) => [i.id, i]));
    const post = (lines, to, footer = "") => {
        let body = "";
        const told = [];
        for (const line of Array.isArray(lines) ? lines : []) {
            const ids = Array.isArray(line?.incidents)
                ? [...new Set(line.incidents.map(String))]
                : [];
            let items = ids.map((id) => byId.get(id));
            const words =
                typeof line?.text === "string" ? noLinks(line.text).trim() : "";
            if (
                !words ||
                !items.length ||
                items.some((i) => i?.to !== to || told.includes(i))
            )
                continue;
            // A line too big goes in with its first incidents that fit.
            while (items.length) {
                const block = [...items.map(card), words].join("\n");
                const next = body ? `${body}\n${block}` : block;
                const owners = new Set(
                    [...told, ...items].flatMap((i) => i.owners),
                );
                if (
                    next.length + footer.length <= LIMIT &&
                    mentionSize([...owners]) <= CONTENT_LIMIT
                ) {
                    body = next;
                    told.push(...items);
                    break;
                }
                items = items.slice(0, -1);
            }
        }
        return told.length
            ? {
                  text: `${body}${footer}`,
                  owners: [...new Set(told.flatMap((i) => i.owners))],
                  incidents: told,
                  color: COLOR.PRIMARY_WEAK,
              }
            : null;
    };
    return {
        community: post(answer?.community, "community", MY_MODELS),
        maintainers: post(answer?.maintainers, "maintainers"),
    };
}
