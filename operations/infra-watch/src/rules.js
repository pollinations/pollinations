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
// DEGRADED also needs this many failed requests: 2 failures out of 13 is
// under 90% but not worth an alert.
const MIN_FAILURES = 5;
// A primary route below this, while callers stay above MIN_SUCCESS thanks
// to a fallback, is "primary weak".
const PRIMARY_MIN_SUCCESS = 0.8;
const PLATFORM_MIN_BASELINE = 1000;
const MAX_ROUTE_LINES = 4;

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
        };
    }
    return health;
}

// Each model's backend routes (attempts per provider), primaries first.
function modelRoutes(rows) {
    const routes = {};
    for (const row of rows) {
        if (row.is_rollup) continue;
        routes[row.model] ??= [];
        routes[row.model].push({
            provider: row.provider,
            fallback: Boolean(row.fallback_used),
            ok: row.status_2xx,
            attempts: row.total_requests - row.errors_4xx,
        });
    }
    for (const list of Object.values(routes))
        list.sort((a, b) => a.fallback - b.fallback || b.attempts - a.attempts);
    return routes;
}

const primaryOf = (routes = []) => {
    const primaries = routes.filter((r) => !r.fallback);
    const ok = primaries.reduce((sum, r) => sum + r.ok, 0);
    const attempts = primaries.reduce((sum, r) => sum + r.attempts, 0);
    return { attempts, success: attempts > 0 ? ok / attempts : 1 };
};

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
    signups = [],
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
    const routes = modelRoutes(recent);
    for (const [model, h] of Object.entries(modelHealth(recent))) {
        if (!official.has(model) || h.nonClient < MIN_REQUESTS) continue;
        const info = { model, ...h, routes: routes[model] ?? [] };
        const primary = primaryOf(info.routes);
        if (h.success < MIN_SUCCESS) {
            if (h.nonClient - h.ok >= MIN_FAILURES)
                found[`degraded:${model}`] = { kind: "DEGRADED", ...info };
        } else if (
            primary.attempts >= MIN_REQUESTS &&
            primary.success < PRIMARY_MIN_SUCCESS
        ) {
            found[`primary:${model}`] = { kind: "PRIMARY_WEAK", ...info };
        }
    }
    const now10 = totalRequests(last10);
    const baseline10 = (totalRequests(last60) - now10) / 5;
    if (baseline10 >= PLATFORM_MIN_BASELINE && now10 < baseline10 / 2) {
        found.platform = { kind: "PLATFORM_DROP", now10, baseline10 };
    }
    // Private email domains with bulk onboarding sign-ups, from Enter.
    for (const signup of signups)
        found[`signup:${signup.domain}`] = { kind: "SIGNUP_BURST", ...signup };
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

// Keys whose recovery we announce. A weak primary just expires: callers
// were never affected. So does a sign-up burst once its 24 hours pass.
const RECOVERS = (key) =>
    !key.startsWith("primary:") && !key.startsWith("signup:");
// A sign-up burst is posted once a day while it lasts.
const cooldownOf = (key) =>
    key.startsWith("signup:") ? 24 * 60 * 60 * 1000 : COOLDOWN_MS;

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
        if (prev && now - prev.postedAt < cooldownOf(key)) continue;
        active[key] = { postedAt: now, kind: info.kind };
        posts.push({ type: "alert", key, info });
    }

    for (const [key, prev] of Object.entries(active)) {
        if (found[key]) continue;
        if (found.gen && key !== "gen") continue;
        if (found.analytics && !HOSTS[key]) continue;
        if (!RECOVERS(key)) {
            if (now - prev.postedAt >= cooldownOf(key)) delete active[key];
            continue;
        }
        // A model needs RECOVER_CHECKS clean checks in a row to count as
        // recovered; a thin sample neither counts nor resets the run, and
        // never announces (not even a retry after a failed post).
        const model = key.startsWith("degraded:") ? key.slice(9) : null;
        if (model) {
            const fresh = (health[model]?.nonClient ?? 0) >= MIN_REQUESTS;
            clears[key] = (state.clears?.[key] ?? 0) + (fresh ? 1 : 0);
            if (!fresh || clears[key] < RECOVER_CHECKS) continue;
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
const fit = (s) => (s.length > 38 ? `${s.slice(0, 37)}…` : s);

// A box titled with the alert and what it is about. It is as wide as its
// title or its longest row needs, so a full model id is never cut.
function panel(title, lines) {
    const body = lines.map(
        ([field, value]) =>
            `${field.padEnd(Math.max(8, field.length + 1))}${fit(String(value))}`,
    );
    const inner = Math.max(30, title.length + 2, ...body.map((t) => t.length));
    return [
        "```",
        `┌─ ${title} ${"─".repeat(inner - title.length - 1)}┐`,
        ...body.map((t) => `│ ${t.padEnd(inner)} │`),
        `└${"─".repeat(inner + 2)}┘`,
        "```",
    ].join("\n");
}

// Each alert's box title: what happened, and to what.
const TITLE = {
    GEN_DOWN: () => "DOWN: gen Worker",
    PUBLIC_DOWN: () => "DOWN: gen.pollinations.ai",
    UPSTREAM_DOWN: () => "DOWN: gen.myceli.ai",
    ANALYTICS_DOWN: () => "BLIND: model status data",
    PLATFORM_DROP: () => "DEGRADED: platform-wide",
    DEGRADED: (info) => `DEGRADED: ${info.model}`,
    PRIMARY_WEAK: (info) => `PRIMARY WEAK: ${info.model}`,
    SIGNUP_BURST: (info) => `FLAGGED: domain ${info.domain}`,
};
const framed = (info, lines) => panel(TITLE[info.kind](info), lines);

// Last line of an alert while the AI looks into it. The same message is
// then edited: the AI's line replaces it, or it simply goes.
export const CHECKING = "*checking why…*";
export const complete = (text, line) =>
    text.replace(`\n${CHECKING}`, line ? `\n↳ ${line}` : "");

// Embed side-bar colour by severity: red down, orange degraded, yellow weak
// primary, green recovered.
const RED = 0xe24b4a;
const COLOR = {
    GEN_DOWN: RED,
    PUBLIC_DOWN: RED,
    UPSTREAM_DOWN: RED,
    ANALYTICS_DOWN: RED,
    PLATFORM_DROP: RED,
    DEGRADED: 0xd85a30,
    PRIMARY_WEAK: 0xef9f27,
    SIGNUP_BURST: 0xef9f27,
};
const GREEN = 0x639922;

export const render = (post) => ({
    ...draw(post),
    color: post.type === "recovered" ? GREEN : COLOR[post.info.kind],
});

function draw(post) {
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
            text: framed(info, [
                ["WHY", "both hostnames failing:"],
                ["", "gen.pollinations.ai  DOWN"],
                ["", "gen.myceli.ai        DOWN"],
                ["", "-> the Worker itself, not DNS"],
            ]),
            ping: true,
        };
    }
    if (info.kind === "PUBLIC_DOWN" || info.kind === "UPSTREAM_DOWN") {
        const pub = info.kind === "PUBLIC_DOWN";
        return {
            text: framed(info, [
                ["WHY", "one hostname failing:"],
                ["", `gen.pollinations.ai  ${pub ? "DOWN" : "up"}`],
                ["", `gen.myceli.ai        ${pub ? "up" : "DOWN"}`],
                [
                    "",
                    pub
                        ? "-> domain/DNS/route; Worker OK"
                        : "-> Myceli domain/route; users OK",
                ],
            ]),
            ping: pub,
        };
    }
    if (info.kind === "ANALYTICS_DOWN") {
        return {
            text: framed(info, [
                ["WHY", `unreachable ${CONFIRM_CHECKS}x, gen is up`],
                ["", "model alerts paused"],
            ]),
            ping: true,
        };
    }
    if (info.kind === "SIGNUP_BURST") {
        const since = new Date(info.since * 1000).toISOString();
        return {
            text: framed(info, [
                ["ACCOUNTS", `${info.accounts} in 24h`],
                ["SINCE", `${since.slice(0, 16).replace("T", " ")} UTC`],
                ["REWARDS", "still paid, review the domain"],
            ]),
            ping: false,
        };
    }
    if (info.kind === "PLATFORM_DROP") {
        return {
            text: framed(info, [
                ["REQS", `${info.now10} last 10m`],
                ["", `baseline ${Math.round(info.baseline10)}`],
            ]),
            ping: true,
        };
    }
    const lines = [
        ["FINAL", `${pct(info.success)} of ${info.nonClient} reqs 15m`],
    ];
    // Accounts behind the failures, from Tinybird; unknown if it couldn't say.
    const { callers } = info;
    lines.push([
        "CALLERS",
        callers
            ? `${callers.failing_callers} of ${callers.callers} failing`
            : "unknown",
    ]);
    for (const r of (info.routes ?? []).slice(0, MAX_ROUTE_LINES)) {
        const rate = r.attempts > 0 ? r.ok / r.attempts : 1;
        lines.push([
            r.fallback ? "FALLBACK" : "PRIMARY",
            `${r.provider} ${r.ok}/${r.attempts} (${Math.round(rate * 100)}%)`,
        ]);
    }
    // A weak primary is posted quietly: the fallback keeps callers whole.
    // So is a model failing for a single caller: that's not an outage.
    return {
        text: framed(info, lines),
        ping: info.kind === "DEGRADED" && callers?.failing_callers !== 1,
    };
}
