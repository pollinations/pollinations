// The community agent: every half hour one AI call reads the community
// models' facts and decides, as the retired monitor's agent did
// (operations/community-monitor/CYCLE.md), which models to probe and what
// to tell their owners or the maintainers. Code gathers the facts and keeps
// the rails: only eligible, due models are probed, only real owners are
// mentioned, and each post stays within Discord's limit. No Cloudflare
// imports, so it is testable with plain Node.
import { nextProbeAt } from "./probes.js";
import { ownerOf } from "./rules.js";

// Traffic and fallbacks are read over the last 4 hours.
export const WINDOW_MINUTES = 240;
// The agent's calls per UTC day: one a half hour.
export const AGENT_DAILY_LIMIT = 48;
// What it told is kept this long for it to read.
export const TOLD_MS = 7 * 24 * 60 * 60 * 1000;
// At most this many of its notes are kept, the newest.
const TOLD_KEPT = 200;

export const COMMUNITY_PROMPT = `You run the Pollinations community model monitor. Every half hour you get the community models' facts as JSON. Answer with one JSON object and nothing else:
{"probe": [model ids], "community": {"text": "...", "owners": ["github username"], "told": ["short note"]} or null, "maintainers": {"text": "...", "told": ["short note"]} or null}

probe: each probe costs pollen, so never probe just to fill a sample. From candidates (public community text and image models due a probe), pick those with health 80 or less, or no real traffic (final_2xx + final_5xx is 0), or final success final_2xx / (final_2xx + final_5xx) of 80% or less. Fallback rescues are in final_2xx; final 4xx are callers' errors, not the model's.

results are probes not yet told about, newest last:
- status PROTOCOL is a broken stream; protocolError says how. Tell the owner when previous.protocolError is the same and neither the result nor previous has servedBy: two fresh probes in a row answered by the model itself. A result with servedBy was answered by a fallback: it says nothing of the model's own stream, and a pass through a fallback never means the model itself works.
- The same protocolError on models of 3 or more owners in one cycle points at gen itself: tell the maintainers, not the owners.
- If every result is 402, 403 or INVALID, the probe key is likely out of pollen: tell the maintainers.

fallbacks: a model whose fallbacks rescued at least 10 requests and at least 25% of its successes leans on them. Tell its owner how many were rescued and by which fallbacks; "private" fallbacks are never named.

listings come once a day: if models were newly filtered out of /models or are back, post the changes with each one's health, the filtered total, and that filtered models stay callable by their exact ID. Ping no one for listings.

told is what you told in the last 7 days. Never tell again within 24 hours a broken stream for the same model and error, or the empty probe key; within 7 days a fallback for the same model and fallback.

community goes to the community channel; in owners, list the owners to ping: the part after community/ in the id of a model in results or fallbacks. maintainers goes to the maintainers' channel. Put everything in these two posts. Keep them short: model ids without community/, errors and counts, no links, stream content, hosts or payloads, under 3,500 characters each. Owners are pointed to their dashboard for you. When a post can't fit everything, name what fits and say how many more; leave those out of its told, to tell next time, oldest first. Each post's told gets one short note for each thing it tells, such as "stream o/m stream is missing [DONE]", "fallback o/m via o/f" or "probe key". With nothing to tell, both posts are null.`;

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

// Since the last day: the models newly filtered, and those filtered then
// that are listed again now. One gone from both lists isn't back.
export function listingChanges(before, filtered, shown) {
    const was = new Set(before);
    const health = (m) => ({ model: m.name, health: m.health?.success_rate });
    return {
        filtered: filtered.length,
        newly: filtered.filter((m) => !was.has(m.name)).map(health),
        back: shown.filter((m) => was.has(m.name)).map(health),
    };
}

// One cycle's facts for the agent. `catalog` is gen's full public catalog,
// `rows` its status rows for regular traffic over WINDOW_MINUTES, which
// leaves the probes out. `results` are last cycle's probes, `told` what the
// agent told, `listings` the day's listing changes or null.
export function facts({
    catalog,
    rows,
    schedule,
    results,
    told,
    listings,
    now,
}) {
    const rollups = new Map(
        rows.filter((r) => r.is_rollup).map((r) => [r.model, r]),
    );
    const named = new Set(catalog.map((m) => m.name));
    const listed = catalog.filter((m) => m.community && !m.agent);
    // The model that answered, when it wasn't the one asked: a fallback,
    // named only when public.
    const servedBy = (model, used) =>
        used && used !== model
            ? named.has(used)
                ? used
                : "private"
            : undefined;
    return {
        now: new Date(now).toISOString(),
        candidates: listed
            .filter(
                (m) =>
                    ["text", "image"].includes(m.category) &&
                    now >= nextProbeAt(schedule[m.name]),
            )
            .map((m) => {
                const r = rollups.get(m.name);
                return {
                    model: m.name,
                    category: m.category,
                    health: m.health?.success_rate ?? null,
                    final_2xx: r?.status_2xx ?? 0,
                    final_5xx: r?.errors_5xx ?? 0,
                    final_4xx: r?.errors_4xx ?? 0,
                };
            }),
        results: results.map((r) => ({
            model: r.model,
            category: r.category,
            operation: r.operation,
            status: r.status,
            protocolError: r.protocolError,
            errorCode: r.errorCode,
            servedBy: servedBy(r.model, r.modelUsed),
            previous: r.previous && {
                status: r.previous.status,
                protocolError: r.previous.protocolError,
                servedBy: servedBy(r.model, r.previous.modelUsed),
            },
        })),
        fallbacks: listed
            .map((m) => rollups.get(m.name))
            .filter((r) => r?.fallback_rescues > 0)
            .map((r) => ({
                model: r.model,
                rescued: r.fallback_rescues,
                successes: r.status_2xx,
                via: rows
                    .filter(
                        (v) =>
                            v.model === r.model &&
                            !v.is_rollup &&
                            v.fallback_used &&
                            v.fallback_rescues > 0,
                    )
                    .map((v) => ({
                        model: named.has(v.model_used)
                            ? v.model_used
                            : "private",
                        rescued: v.fallback_rescues,
                    })),
            })),
        listings,
        told: told.map(({ at, note }) => ({
            at: new Date(at).toISOString(),
            note,
        })),
    };
}

// Discord cuts an embed at 4,096 characters.
const LIMIT = 4096;
// Every community post ends here, the one link it carries.
const MY_MODELS =
    "\n\nOwners see their models' errors on [My Models](https://enter.pollinations.ai/my-models).";

// The agent reads model ids their owners chose, so it may write no link:
// Markdown escapes are undone as Discord would, Markdown links keep only
// their text, and any word with ":/", ":\\", ":%2f" or "www." is dropped.
const noLinks = (text) =>
    text
        .replace(/\\(?=[^\w\s])/g, "")
        .replace(/\[([^\]]*)\]\([^)]*\)?/g, "$1")
        .replace(/\S*(?::(?:[\\/]|%2f)|www\.)\S*/gi, "");

// What the agent told, kept with when: the newest TOLD_KEPT notes.
export const remember = (told, notes, now) =>
    [...told, ...notes.map((note) => ({ at: now, note }))].slice(-TOLD_KEPT);

// The agent's answer within the rails, or null if it isn't one, for the
// facts it read: only candidates are probed, only the owners of models in
// its results or fallbacks are pinged, and a post holds no link of its own
// and fits Discord.
export function decision(text, input) {
    let answer;
    try {
        answer = JSON.parse(
            (text ?? "").replace(/^\s*```(?:json)?|```\s*$/g, ""),
        );
    } catch {
        return null;
    }
    const due = new Set(input.candidates.map((c) => c.model));
    const owners = new Set(
        [...input.results, ...input.fallbacks].map((r) => ownerOf(r.model)),
    );
    const list = (value) => (Array.isArray(value) ? value : []);
    const post = (p, footer = "") => {
        if (typeof p?.text !== "string" || !p.text.trim()) return null;
        const body = noLinks(p.text);
        const room = LIMIT - footer.length;
        return {
            text: `${body.length > room ? `${body.slice(0, room - 1)}…` : body}${footer}`,
            told: list(p.told)
                .filter((t) => typeof t === "string" && t.trim())
                .map((t) => t.slice(0, 200))
                .slice(0, 50),
        };
    };
    const community = post(answer?.community, MY_MODELS);
    return {
        probe: [...new Set(list(answer?.probe).filter((m) => due.has(m)))],
        community: community && {
            ...community,
            owners: [
                ...new Set(
                    list(answer.community.owners).filter((o) => owners.has(o)),
                ),
            ],
        },
        maintainers: post(answer?.maintainers),
    };
}
