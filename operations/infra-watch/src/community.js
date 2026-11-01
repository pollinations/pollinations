// The community monitor, ported from the retired one
// (operations/community-monitor/CYCLE.md): code applies Thomas's rules,
// picks this cycle's incidents and keeps their quiet periods; one AI call
// only groups them into posts and words them. No Cloudflare imports, so it
// is testable with plain Node.
import { ownerOf } from "./rules.js";

// Traffic and fallbacks are read over the last 4 hours.
export const WINDOW_MINUTES = 240;
// The agent's calls per UTC day: at most one a half hour.
export const AGENT_DAILY_LIMIT = 48;
const DAY_MS = 24 * 60 * 60 * 1000;
// A told incident stays quiet this long: a broken stream per model and
// error, a fallback notice per model and fallback.
export const QUIET_MS = { stream: DAY_MS, fallback: 7 * DAY_MS };
// Thomas's thresholds: a model leans on its fallbacks from this many
// rescues and this share of its successes; one broken stream on this many
// owners' models at once is gen's. A fallback notice names this many.
const MIN_RESCUED = 10;
const MIN_RESCUED_SHARE = 0.25;
const SHARED_OWNERS = 3;
const VIA_SHOWN = 3;

export const COMMUNITY_PROMPT = `You write the Pollinations community model monitor's Discord posts. You get this cycle's incidents as JSON; code has already decided each one is worth telling. Answer with one JSON object and nothing else:
{"community": [{"incidents": ["id"], "text": "..."}], "maintainers": [{"incidents": ["id"], "text": "..."}]}

Each line tells the incidents in its "incidents" and goes to the channel their "to" names; one line may group several incidents of the same kind. Keep each line to a sentence or two, with model ids without community/, errors and counts as given. Never add models, numbers or links.
- stream: a model's own answers broke the same way twice in a row.
- shared: one broken stream on many owners' models at once, likely gen's own.
- fallback: a model leans on its fallbacks: rescued of its successes over 4 hours, by each fallback; "private" ones are never named.
- listings: models newly filtered out of /models or back, with health and the filtered total; filtered models stay callable by their exact ID.
Code puts whole lines into each post until it is full; a line that doesn't fit, and its incidents, come next time. Code pings owners and points them to their dashboard.`;

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

// `quiet` keys: a model and its broken stream, or a model and a fallback.
export const streamKey = (model, error) => `stream ${model} ${error}`;
export const fallbackKey = (model, via) => `fallback ${model} ${via}`;

// This cycle's incidents, each with an id, where it goes, the owners it
// pings and the quiet keys it starts once told. `schedule` holds each
// model's last probe and the one before; `rows` gen's status rows for
// regular traffic over WINDOW_MINUTES; `quiet` when each key was told;
// `listings` the day's listing changes or null.
export function incidents({ catalog, rows, schedule, quiet, listings, now }) {
    const named = new Set(catalog.map((m) => m.name));
    const listed = new Set(
        catalog.filter((m) => m.community && !m.agent).map((m) => m.name),
    );
    const told = (key, kind) =>
        now - (quiet[key] ?? Number.NEGATIVE_INFINITY) < QUIET_MS[kind];
    const found = [];
    const add = (incident) =>
        found.push({ id: String(found.length + 1), ...incident });

    // A broken stream counts only when the model answered itself.
    const broken = (model, p) =>
        p?.status === "PROTOCOL" && (!p.modelUsed || p.modelUsed === model);
    const streams = Object.entries(schedule).filter(
        ([model, s]) => listed.has(model) && broken(model, s),
    );

    // One error on 3 or more owners' models probed in the last 4 hours is
    // gen's: the maintainers' incident, and none of those owners'.
    const byError = Map.groupBy(
        streams.filter(([, s]) => now - s.lastAt < WINDOW_MINUTES * 60_000),
        ([, s]) => s.protocolError,
    );
    const gens = new Set();
    for (const [error, entries] of byError) {
        const models = entries.map(([model]) => model);
        if (new Set(models.map(ownerOf)).size < SHARED_OWNERS) continue;
        for (const model of models) gens.add(model);
        const fresh = models.filter(
            (m) => !told(streamKey(m, error), "stream"),
        );
        if (fresh.length)
            add({
                kind: "shared",
                to: "maintainers",
                error,
                models: fresh,
                owners: [],
                quiet: fresh.map((m) => streamKey(m, error)),
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

    // A listed model whose fallbacks rescued enough of its successes, with
    // the fallbacks not told about this week; private ones unnamed.
    for (const r of rows) {
        const rescued = r.fallback_rescues;
        if (!r.is_rollup || !listed.has(r.model)) continue;
        if (rescued < MIN_RESCUED || rescued < MIN_RESCUED_SHARE * r.status_2xx)
            continue;
        const via = rows
            .filter(
                (v) =>
                    v.model === r.model &&
                    !v.is_rollup &&
                    v.fallback_used &&
                    v.fallback_rescues > 0,
            )
            .sort((a, b) => b.fallback_rescues - a.fallback_rescues)
            .slice(0, VIA_SHOWN)
            .map((v) => ({
                model: named.has(v.model_used) ? v.model_used : "private",
                rescued: v.fallback_rescues,
            }))
            .filter((v) => !told(fallbackKey(r.model, v.model), "fallback"));
        if (via.length)
            add({
                kind: "fallback",
                to: "community",
                model: r.model,
                rescued,
                successes: r.status_2xx,
                via,
                owners: [ownerOf(r.model)],
                quiet: via.map((v) => fallbackKey(r.model, v.model)),
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
    return found;
}

// What the agent reads of an incident: what it says, not who it pings or
// how it is kept quiet.
export const brief = ({ owners, quiet, ...incident }) => incident;

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

// The agent's posts within the rails, or null if its answer isn't one.
// Each line tells only incidents code found for its channel, and carries no
// link of its own. Whole lines go into the post until it is full: a line
// that doesn't fit is left out with its incidents, which stay pending, so a
// post never shows less than it pings and acknowledges.
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
            const items = ids.map((id) => byId.get(id));
            const words =
                typeof line?.text === "string" ? noLinks(line.text).trim() : "";
            if (
                !words ||
                !items.length ||
                items.some((i) => i?.to !== to || told.includes(i))
            )
                continue;
            const next = body ? `${body}\n${words}` : words;
            if (next.length + footer.length > LIMIT) continue;
            body = next;
            told.push(...items);
        }
        return told.length
            ? {
                  text: `${body}${footer}`,
                  owners: [...new Set(told.flatMap((i) => i.owners))],
                  incidents: told,
              }
            : null;
    };
    return {
        community: post(answer?.community, "community", MY_MODELS),
        maintainers: post(answer?.maintainers, "maintainers"),
    };
}
