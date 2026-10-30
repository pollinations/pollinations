// Plain alert rules over public `/models/status` data. No AI, no secrets.

export const COOLDOWN_MS = 3 * 60 * 60 * 1000;
// Analytics for the newest minute lag, so a drop or outage must hold for
// this many consecutive checks before it alerts.
export const CONFIRM_CHECKS = 3;
// A degraded model counts as recovered only after this many clean checks
// with a fresh sample (one full 15-minute window), so a model hovering at
// the threshold doesn't flap between alert and recovered every minute.
export const RECOVER_CHECKS = 15;

const MIN_REQUESTS = 10;
const MIN_SUCCESS = 0.9;
const PLATFORM_MIN_BASELINE = 1000;

// Final user-visible outcome per model: the rollup rows.
function modelHealth(rows) {
    const health = {};
    for (const row of rows) {
        if (!row.is_rollup) continue;
        const nonClient = row.total_requests - row.errors_4xx;
        health[row.model] = {
            nonClient,
            ok: row.status_2xx,
            success: nonClient > 0 ? row.status_2xx / nonClient : 1,
            retried503s: row.retried_503s,
            rescues: row.fallback_rescues,
        };
    }
    return health;
}

const totalRequests = (rows) =>
    rows
        .filter((row) => row.is_rollup)
        .reduce((sum, row) => sum + row.total_requests, 0);

// Returns the conditions true right now, keyed by alert key.
// `gen` = gen's own liveness; `analytics` = /models/status (Tinybird) reads.
export function conditions({
    recent,
    last10,
    last60,
    official,
    hosts = { public: true, upstream: true },
    analyticsDown,
}) {
    // Same gen Worker behind two custom domains: gen.pollinations.ai (public)
    // and gen.myceli.ai (Myceli upstream). Which one fails tells where.
    if (!hosts.public && !hosts.upstream) return { gen: { kind: "GEN_DOWN" } };
    const found = {};
    if (!hosts.public) found.public = { kind: "PUBLIC_DOWN" };
    if (!hosts.upstream) found.upstream = { kind: "UPSTREAM_DOWN" };
    if (analyticsDown) {
        found.analytics = { kind: "ANALYTICS_DOWN" };
        return found;
    }
    for (const [model, h] of Object.entries(modelHealth(recent))) {
        if (!official.has(model) || h.nonClient < MIN_REQUESTS) continue;
        if (h.success < MIN_SUCCESS) {
            found[`degraded:${model}`] = { kind: "DEGRADED", model, ...h };
        } else if (h.retried503s >= 10 && h.retried503s >= 0.1 * h.ok) {
            found[`spillover:${model}`] = { kind: "SPILLOVER", model, ...h };
        }
    }
    const now10 = totalRequests(last10);
    const baseline10 = (totalRequests(last60) - now10) / 5;
    if (baseline10 >= PLATFORM_MIN_BASELINE && now10 < baseline10 / 2) {
        found.platform = { kind: "PLATFORM_DROP", now10, baseline10 };
    }
    return found;
}

const CONFIRMED = new Set([
    "gen",
    "public",
    "upstream",
    "analytics",
    "platform",
]);
const HOSTS = { gen: true, public: true, upstream: true };

// Keys whose recovery we announce. Spillover just expires.
const RECOVERS = (key) => !key.startsWith("spillover:");

// Pure state transition: which messages to post, and the next state.
export function step(state, found, now, recent = []) {
    // With gen down, nothing else can be judged, not even a single hostname.
    // With analytics down, only the hostname checks still have data.
    const active = { ...(state.active ?? {}) };
    const streaks = {};
    const clears = {};
    const posts = [];
    const health = modelHealth(recent);

    for (const [key, info] of Object.entries(found)) {
        const streak = (state.streaks?.[key] ?? 0) + 1;
        streaks[key] = streak;
        const needs = CONFIRMED.has(key) ? CONFIRM_CHECKS : 1;
        if (streak < needs) continue;
        const prev = active[key];
        if (prev && now - prev.postedAt < COOLDOWN_MS) continue;
        active[key] = { postedAt: now, kind: info.kind };
        posts.push({ type: "alert", key, info });
    }

    for (const [key, prev] of Object.entries(active)) {
        if (found[key]) continue;
        if (found.gen && key !== "gen") continue;
        if (found.analytics && !HOSTS[key]) continue;
        if (!RECOVERS(key)) {
            if (now - prev.postedAt >= COOLDOWN_MS) delete active[key];
            continue;
        }
        // A model needs RECOVER_CHECKS clean checks in a row to count as
        // recovered; a thin sample neither counts nor resets the run.
        const model = key.startsWith("degraded:") ? key.slice(9) : null;
        if (model) {
            const fresh = (health[model]?.nonClient ?? 0) >= MIN_REQUESTS;
            clears[key] = (state.clears?.[key] ?? 0) + (fresh ? 1 : 0);
            if (clears[key] < RECOVER_CHECKS) continue;
        }
        delete active[key];
        posts.push({
            type: "recovered",
            key,
            info: { ...prev, model, ...health[model] },
        });
    }

    return { posts, state: { active, streaks, clears } };
}

const pct = (x) => `${(x * 100).toFixed(1)}%`;
const fit = (s) => (s.length > 34 ? `${s.slice(0, 33)}…` : s);

function panel(lines) {
    const width = 44;
    const top = `┌─ MONITOR ${"─".repeat(width - 10)}┐`;
    const body = lines.map(([field, value]) => {
        const text = `${field.padEnd(Math.max(8, field.length + 1))}${fit(String(value))}`;
        return `│ ${text.padEnd(width - 2)} │`;
    });
    return ["```", top, ...body, `└${"─".repeat(width)}┘`, "```"].join("\n");
}

export function render(post) {
    const { info } = post;
    if (post.type === "recovered") {
        const what =
            info.model ??
            {
                gen: "gen Worker (both gen.pollinations.ai and gen.myceli.ai)",
                public: "gen.pollinations.ai (public domain)",
                upstream: "gen.myceli.ai (Myceli upstream domain)",
                analytics: "model status analytics",
            }[post.key] ??
            "platform traffic";
        const rate =
            info.success != null
                ? ` — ${pct(info.success)} final success (${info.nonClient} reqs, 15 min)`
                : "";
        return { text: `\`${what}\` recovered${rate}`, ping: false };
    }
    if (info.kind === "GEN_DOWN") {
        return {
            text: panel([
                ["STATUS", "DOWN"],
                ["MODEL", "gen Worker"],
                ["WHY", "both hostnames failing:"],
                ["", "gen.pollinations.ai  DOWN"],
                ["", "gen.myceli.ai        DOWN"],
                ["", "-> the Worker itself, not DNS"],
                ["BY", "infra-watch"],
            ]),
            ping: true,
        };
    }
    if (info.kind === "PUBLIC_DOWN" || info.kind === "UPSTREAM_DOWN") {
        const pub = info.kind === "PUBLIC_DOWN";
        return {
            text: panel([
                ["STATUS", "DOWN"],
                ["MODEL", pub ? "gen.pollinations.ai" : "gen.myceli.ai"],
                ["WHY", "one hostname failing:"],
                ["", `gen.pollinations.ai  ${pub ? "DOWN" : "up"}`],
                ["", `gen.myceli.ai        ${pub ? "up" : "DOWN"}`],
                [
                    "",
                    pub
                        ? "-> domain/DNS/route; Worker OK"
                        : "-> Myceli domain/route; users OK",
                ],
                ["BY", "infra-watch"],
            ]),
            ping: pub,
        };
    }
    if (info.kind === "ANALYTICS_DOWN") {
        return {
            text: panel([
                ["STATUS", "BLIND"],
                ["MODEL", "/models/status (analytics)"],
                ["WHY", `unreachable ${CONFIRM_CHECKS}x, gen is up`],
                ["", "model alerts paused"],
                ["BY", "infra-watch"],
            ]),
            ping: true,
        };
    }
    if (info.kind === "PLATFORM_DROP") {
        return {
            text: panel([
                ["STATUS", "DEGRADED"],
                ["MODEL", "platform-wide"],
                ["REQS", `${info.now10} last 10m`],
                ["", `baseline ${Math.round(info.baseline10)}`],
                ["BY", "infra-watch"],
            ]),
            ping: true,
        };
    }
    const lines = [
        ["STATUS", info.kind],
        ["MODEL", info.model],
        ["FINAL", `${pct(info.success)} of ${info.nonClient} reqs 15m`],
    ];
    if (info.kind === "DEGRADED") {
        // Public data has no caller split: one bad caller can trip this.
        lines.push(["CHECK", "unconfirmed: callers unknown"]);
    }
    if (info.kind === "SPILLOVER") {
        lines.push(["QUEUE", `${info.retried503s} retried`]);
        lines.push(["FALLBACK", `${info.rescues} rescued`]);
    }
    lines.push(["BY", "infra-watch"]);
    return { text: panel(lines), ping: true };
}
