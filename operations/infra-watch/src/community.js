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
{"probe": [model ids], "community": {"text": "...", "owners": ["github username"]} or null, "maintainers": {"text": "..."} or null, "told": ["short note"]}

probe: each probe costs pollen, so never probe just to fill a sample. From candidates (public community text and image models due a probe), pick those with health 80 or less, or no real traffic (final_2xx + final_5xx is 0), or final success final_2xx / (final_2xx + final_5xx) of 80% or less. Fallback rescues are in final_2xx; final 4xx are callers' errors, not the model's.

results are last cycle's probes:
- status PROTOCOL is a broken stream; protocolError says how. Tell the owner when previous.protocolError is the same: two fresh probes in a row. A result with servedBy was answered by a fallback: it says nothing of the model's own stream, and a pass through a fallback never means the model itself works.
- The same protocolError on models of 3 or more owners in one cycle points at gen itself: tell the maintainers, not the owners.
- If every result is 402, 403 or INVALID, the probe key is likely out of pollen: tell the maintainers.

fallbacks: a model whose fallbacks rescued at least 10 requests and at least 25% of its successes leans on them. Tell its owner how many were rescued and by which fallbacks; "private" fallbacks are never named.

listings come once a day: if models were newly filtered out of /models or are back, post the changes with each one's health, the filtered total, that filtered models stay callable by their exact ID, and that owners see why on [My Models](https://enter.pollinations.ai/my-models). Ping no one for listings.

told is what you told in the last 7 days. Never tell again within 24 hours a broken stream for the same model and error, or the empty probe key; within 7 days a fallback for the same model and fallback.

community goes to the community channel; list in owners the owners to ping, the part after community/ in a model id. maintainers goes to the maintainers' channel. Put everything in these two posts. Keep them short: model ids without community/, errors and counts, no stream content, hosts or payloads, under 3,500 characters each. When a post can't fit everything, name what fits and say how many more; leave those out of told, to tell next time, oldest first. told gets one short note for each thing you told, such as "stream o/m stream is missing [DONE]", "fallback o/m via o/f" or "probe key". With nothing to tell, both posts are null and told is empty.`;

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

// An error code the agent may read: a plain word, never provider text.
const word = (code) => (/^\w{1,40}$/.test(code ?? "") ? code : undefined);

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
            errorCode: word(r.errorCode),
            servedBy:
                r.modelUsed && r.modelUsed !== r.model
                    ? named.has(r.modelUsed)
                        ? r.modelUsed
                        : "private"
                    : undefined,
            previous: r.previous,
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
const cut = (text) => (text.length > 4096 ? `${text.slice(0, 4095)}…` : text);

// The agent reads model ids that their owners chose, so a post keeps only
// links to Pollinations itself.
const ownLinks = (text) =>
    text.replace(/https?:\/\/[^\s<>()[\]]+/gi, (url) => {
        try {
            const host = new URL(url).hostname;
            if (/(^|\.)pollinations\.ai$/.test(host)) return url;
        } catch {}
        return "[link removed]";
    });

// What the agent told, kept with when: the newest TOLD_KEPT notes.
export const remember = (told, notes, now) =>
    [...told, ...notes.map((note) => ({ at: now, note }))].slice(-TOLD_KEPT);

// The agent's answer within the rails, or null if it isn't one: only
// candidates are probed, only community model owners are pinged, and each
// post keeps only Pollinations links and is cut to Discord's limit.
export function decision(text, candidates, catalog) {
    let answer;
    try {
        answer = JSON.parse(
            (text ?? "").replace(/^\s*```(?:json)?|```\s*$/g, ""),
        );
    } catch {
        return null;
    }
    const due = new Set(candidates.map((c) => c.model));
    const owners = new Set(
        catalog.filter((m) => m.community).map((m) => ownerOf(m.name)),
    );
    const list = (value) => (Array.isArray(value) ? value : []);
    const post = (p) =>
        typeof p?.text === "string" && p.text.trim()
            ? cut(ownLinks(p.text))
            : null;
    const community = post(answer?.community);
    const maintainers = post(answer?.maintainers);
    return {
        probe: [...new Set(list(answer?.probe).filter((m) => due.has(m)))],
        community: community && {
            text: community,
            owners: [
                ...new Set(
                    list(answer.community.owners).filter((o) => owners.has(o)),
                ),
            ],
        },
        maintainers: maintainers && { text: maintainers },
        told: list(answer?.told)
            .filter((t) => typeof t === "string" && t.trim())
            .map((t) => t.slice(0, 200))
            .slice(0, 50),
    };
}
