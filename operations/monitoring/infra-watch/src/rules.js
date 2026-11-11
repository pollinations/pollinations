// Plain alert rules over public `/models/status` data, and the incident
// cards they drive. No AI, no secrets.

import { releaseDomainSql } from "./quest-restrictions.js";

// Analytics for the newest minute lag, so an outage or drop must hold for
// this many consecutive checks before it opens, and a status change on an
// open incident must hold as long before it counts.
export const CONFIRM_CHECKS = 3;
// A model incident closes only after this many clean checks with a fresh
// sample (one full 15-minute window), so a model hovering at the threshold
// doesn't close and reopen every minute.
export const RECOVER_CHECKS = 15;
// A model failing again this soon after its last incident closed gets an
// AGAIN row on its new card.
const AGAIN_MS = 60 * 60 * 1000;

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
                found[`model:${model}`] = { kind: "DEGRADED", ...info };
        } else if (
            primary.attempts >= MIN_REQUESTS &&
            primary.success < PRIMARY_MIN_SUCCESS
        ) {
            found[`model:${model}`] = { kind: "PRIMARY_WEAK", ...info };
        }
    }
    const now10 = totalRequests(last10);
    const baseline10 = (totalRequests(last60) - now10) / 5;
    if (baseline10 >= PLATFORM_MIN_BASELINE && now10 < baseline10 / 2) {
        found.platform = { kind: "PLATFORM_DROP", now10, baseline10 };
    }
    // Private email domains with bulk onboarding sign-ups, from Enter: open
    // while over the limit in the last 24 hours.
    for (const signup of signups)
        found[`signup:${signup.domain}`] = { kind: "SIGNUP_BURST", ...signup };
    return found;
}

// The community cycle (community.js) runs every half hour. It is down after
// COMMUNITY_FAILURES failed cycles in a row, about 90 minutes, with the last
// error (a refused probe key, a rejected Discord post) saying why; or while
// one is still `running` after COMMUNITY_STUCK_MS, far past any cycle's
// probes and their timeouts. A pause in infra-watch fails nothing: the
// heartbeat tells that.
export const COMMUNITY_FAILURES = 3;
export const COMMUNITY_STUCK_MS = 3 * 60 * 60 * 1000;
export function communityDown(community, now, running) {
    const stuck = running && now - (community?.at ?? now) >= COMMUNITY_STUCK_MS;
    if (!stuck && (community?.failures ?? 0) < COMMUNITY_FAILURES) return {};
    return {
        community: {
            kind: "COMMUNITY_DOWN",
            error: stuck
                ? "a cycle has run for 3+ hours"
                : (community.error ?? null),
        },
    };
}

// A legacy bridge is down when its last full UTC hour fell below half the
// median of the same hour on the previous 7 days, in requests or success,
// with a median of at least 10 requests (the pipe's `degraded`). Once down,
// it is judged against the medians it started with, so a long outage never
// becomes its own baseline.
export function legacyDown(rows, open = {}) {
    const found = {};
    for (const row of rows) {
        const key = `legacy:${row.bridge}`;
        const start = open[key]?.start;
        const info = { kind: "LEGACY_DOWN", ...row };
        if (!start) {
            if (row.degraded) found[key] = info;
            continue;
        }
        const { median_requests, median_success } = start;
        if (
            row.last_hour_requests < median_requests / 2 ||
            row.last_hour_success < median_success / 2
        )
            found[key] = { ...info, median_requests, median_success };
    }
    // An open bridge whose row is gone had no traffic in the whole window:
    // still down until a reading shows it back.
    for (const [key, incident] of Object.entries(open))
        if (
            key.startsWith("legacy:") &&
            !rows.some((r) => key === `legacy:${r.bridge}`)
        )
            found[key] = incident.info;
    return found;
}

// Payments in trouble, the infra_watch_payments rows: a Stripe webhook or
// checkout 5xx in the last 15 minutes, or a pack or auto top-up paid 15
// minutes to 24 hours ago with no pollen credited. Each is a paying customer
// and there are none in a normal month, so the first row opens the card.
export function paymentsFailing(rows) {
    return rows.length ? { payments: { kind: "PAYMENTS_FAILING", rows } } : {};
}

// Requests failing before any model is known (an API-key, sign-in or
// balance check, mostly Enter's database) are failing while any minute of the
// last 30 had at least this many; quiet minutes have 0 to 6. They come in
// bursts of seconds, and per-model health never sees them: the first bad
// minute opens the card, and the 30-minute window keeps that one card open
// across bursts. `minutes` are the infra_watch_early_errors rows.
const EARLY_MIN_FAILURES = 25;
const minuteMs = (minute) => Date.parse(`${minute.replace(" ", "T")}Z`);
const total = (rows, field) => rows.reduce((sum, m) => sum + m[field], 0);
export function earlyErrors(minutes) {
    const bursts = minutes.filter((m) => m.failures >= EARLY_MIN_FAILURES);
    if (!bursts.length) return {};
    const worst = bursts.reduce((a, b) => (b.failures > a.failures ? b : a));
    return {
        early: {
            kind: "EARLY_ERRORS",
            worst: worst.failures,
            route: worst.top_route,
            bursts: bursts.length,
            failures: total(minutes, "failures"),
            d1: total(minutes, "d1_failures"),
            lastAt: minuteMs(bursts.at(-1).minute),
        },
    };
}

// Background jobs and analytics feeds, each stale while its newest data is
// older than `maxSeconds`. A row per job: `name` titles its card, `ping`
// says whether its opening card pings, `effect` what goes wrong meanwhile.
// Every alert reads error_event or product_event, so those ping; the D1 copy
// runs every 4 hours and a GitHub cron start can slip by almost 2, so it
// waits 6 hours and only posts.
export const STALE_JOBS = {
    error_event: {
        name: "error feed (error_event)",
        maxSeconds: 15 * 60,
        ping: true,
        effect: "error alerts are blind",
    },
    product_event: {
        name: "Enter feed (product_event)",
        maxSeconds: 15 * 60,
        ping: true,
        effect: "sign-in, payment data missing",
    },
    d1_copy: {
        name: "D1 to Tinybird copy",
        maxSeconds: 6 * 60 * 60,
        ping: false,
        effect: "KPIs and abuse data stale",
    },
    // gen's crons, by the heartbeat each writes after a run (GEN_HEARTBEATS).
    "community-catalog": {
        name: "community model catalog refresh",
        maxSeconds: 5 * 60,
        ping: true,
        effect: "community model changes not served",
    },
    "sandbox-keeper": {
        name: "sandbox keeper",
        maxSeconds: 15 * 60,
        ping: true,
        effect: "kept sandboxes end, expired Azure ones run on",
    },
};
// The STALE_JOBS rows gen reports by heartbeat instead of Tinybird.
export const GEN_HEARTBEATS = ["community-catalog", "sandbox-keeper"];
// `rows` are { source, age_seconds }, from infra_watch_freshness; a source
// missing from STALE_JOBS is ignored.
export function jobsStale(rows) {
    const found = {};
    for (const { source, age_seconds } of rows) {
        const job = STALE_JOBS[source];
        if (job && age_seconds > job.maxSeconds)
            found[`stale:${source}`] = {
                kind: "JOB_STALE",
                job: source,
                ageSeconds: age_seconds,
            };
    }
    return found;
}

const CONFIRMED = new Set([
    "gen",
    "public",
    "upstream",
    "enter",
    "analytics",
    "platform",
]);
const HOSTS = { gen: true, public: true, upstream: true, enter: true };
// A model incident's model, from its key; null for any other incident.
export const modelOf = (key) =>
    key.startsWith("model:") ? key.slice(6) : null;

// One incident per key: a model (`model:<id>`), or gen, a hostname, the
// status data or the platform. It opens once confirmed, updates on every
// check that still finds it, and closes once clean; a closed incident is
// never touched again. Returns what happened to each, and the next state.
// A model's statuses from mild to bad: a closed card's title names the worst
// one its incident reached.
const SEVERITY = ["PRIMARY_WEAK", "DEGRADED"];
const worse = (a, b) => (SEVERITY.indexOf(b) > SEVERITY.indexOf(a) ? b : a);

export function step(state, found, now, recent = []) {
    // With gen down, only Enter's own check can be judged, not even a single
    // hostname. With analytics down, the hostname and Enter checks still can.
    const open = { ...(state.open ?? {}) };
    const closed = Object.fromEntries(
        Object.entries(state.closed ?? {}).filter(
            ([, at]) => now - at < AGAIN_MS,
        ),
    );
    const streaks = {};
    const clears = {};
    const actions = [];
    const health = modelHealth(recent);

    for (const [key, info] of Object.entries(found)) {
        const streak = (state.streaks?.[key] ?? 0) + 1;
        streaks[key] = streak;
        const incident = open[key];
        if (!incident) {
            const confirm = CONFIRMED.has(key) || key.startsWith("stale:");
            if (streak < (confirm ? CONFIRM_CHECKS : 1)) continue;
            open[key] = {
                kind: info.kind,
                worst: info.kind,
                openedAt: now,
                again: closed[key] ?? null,
                start: info,
                info,
            };
            actions.push({ type: "open", key });
            continue;
        }
        // A status change counts once it held for CONFIRM_CHECKS checks.
        const pending =
            info.kind === incident.kind
                ? null
                : {
                      kind: info.kind,
                      count:
                          incident.pending?.kind === info.kind
                              ? incident.pending.count + 1
                              : 1,
                  };
        const moved = pending && pending.count >= CONFIRM_CHECKS;
        const kind = moved ? info.kind : incident.kind;
        open[key] = {
            ...incident,
            kind,
            worst: worse(incident.worst ?? incident.kind, kind),
            pending: moved ? null : pending,
            info,
        };
        actions.push({ type: "update", key });
    }

    for (const [key, incident] of Object.entries(open)) {
        if (found[key]) continue;
        if (found.gen && key !== "enter") continue;
        if (found.analytics && !HOSTS[key]) continue;
        // A model needs RECOVER_CHECKS clean checks in a row to close; a thin
        // sample neither counts nor resets the run.
        const model = modelOf(key);
        if (model) {
            const fresh = (health[model]?.nonClient ?? 0) >= MIN_REQUESTS;
            clears[key] = (state.clears?.[key] ?? 0) + (fresh ? 1 : 0);
            // A clean check also ends a status change in progress: it must
            // hold on consecutive checks.
            if (fresh && incident.pending)
                open[key] = { ...incident, pending: null };
            if (!fresh || clears[key] < RECOVER_CHECKS) continue;
        }
        delete open[key];
        closed[key] = now;
        actions.push({
            type: "close",
            key,
            incident: {
                ...incident,
                closedAt: now,
                latest: model ? health[model] : null,
            },
        });
    }

    return { actions, state: { open, closed, streaks, clears } };
}

// A route counts as failing below this, with enough attempts to judge.
const FAILING_ROUTE = 0.8;
const MIN_ROUTE_ATTEMPTS = 5;

// What an incident looks like, for telling a real change from noise.
export function snapshot(incident) {
    const { info } = incident;
    return {
        kind: incident.kind,
        failing: (info.routes ?? [])
            .filter(
                (r) =>
                    r.attempts >= MIN_ROUTE_ATTEMPTS &&
                    r.ok / r.attempts < FAILING_ROUTE,
            )
            .map((r) => `${r.fallback ? "fallback" : "primary"} ${r.provider}`)
            .join(", "),
        errorKind: info.errorKind ?? null,
        success: info.success ?? null,
        failingCallers: info.callers?.failing_callers ?? null,
        worst: info.worst ?? null,
    };
}

// Why the incident changed enough for a new AI line, or null if it is
// the same problem: same status, routes and error, success within 20 points.
export function noteworthy(before, now) {
    if (now.kind !== before.kind)
        return `status changed from ${before.kind} to ${now.kind}`;
    if (now.failing !== before.failing)
        return `failing routes changed from "${before.failing || "none"}" to "${now.failing || "none"}"`;
    if (now.errorKind && before.errorKind && now.errorKind !== before.errorKind)
        return `main error changed from ${before.errorKind} to ${now.errorKind}`;
    if (
        now.success != null &&
        before.success != null &&
        Math.abs(now.success - before.success) >= 0.2
    )
        return `final success moved from ${pct(before.success)} to ${pct(now.success)}`;
    if ((before.failingCallers ?? 0) <= 1 && (now.failingCallers ?? 0) > 1)
        return `failing callers went from ${before.failingCallers ?? 0} to ${now.failingCallers}`;
    return null;
}

// Worse in a way that needs a person again: callers now affected, the
// affected callers went from one to several, or an early-errors burst at
// least twice the worst one already pinged.
export const escalates = (before, now) =>
    (now.kind === "EARLY_ERRORS" &&
        now.worst >= 2 * (before.worst ?? Number.POSITIVE_INFINITY)) ||
    (now.kind === "DEGRADED" &&
        (now.failingCallers ?? 2) > 1 &&
        (before.kind !== "DEGRADED" || (before.failingCallers ?? 2) <= 1));

const pct = (x) => `${(x * 100).toFixed(1)}%`;
const fit = (s) => (s.length > 38 ? `${s.slice(0, 37)}…` : s);
const unix = (ms) => Math.round(ms / 1000);

// "2 h 01 min", "47 min", "under 1 min".
export function duration(ms) {
    const minutes = Math.round(ms / 60_000);
    if (minutes < 1) return "under 1 min";
    if (minutes < 60) return `${minutes} min`;
    return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")} min`;
}

// A phone shows about 49 characters of a code block: a row's text fits in
// ROW_MAX inside the box's borders.
const ROW_MAX = 45;
// `text` in pieces of at most `size`, each cut after a /, -, :, _ or space
// where there is one, so ids and errors break where they read well.
function wrap(text, size) {
    const rows = [];
    while (text.length > size) {
        const head = text.slice(0, size);
        const at = Math.max(
            ...["/", "-", ":", "_", " "].map((c) => head.lastIndexOf(c)),
        );
        const cut = at > 0 ? at + 1 : size;
        rows.push(text.slice(0, cut).trimEnd());
        text = text.slice(cut).trimStart();
    }
    return [...rows, text];
}

// A box titled with the alert and what it is about. It is as wide as its
// title or its longest row needs. The title is drawn in the card's colour
// (an ansi block): Discord on desktop shows it, the phone shows plain text.
// `whole` keeps every value whole, for cards whose rows are model ids and
// errors: a value too long for a phone continues on rows of its own.
export function panel(title, lines, color, { whole = false } = {}) {
    const width = Math.max(8, ...lines.map(([field]) => field.length + 1));
    const body = lines.flatMap(([field, value]) =>
        whole
            ? wrap(String(value), ROW_MAX - width).map(
                  (piece, i) => `${(i ? "" : field).padEnd(width)}${piece}`,
              )
            : [`${field.padEnd(width)}${fit(String(value))}`],
    );
    // A whole card needs no dash after its title, so its longest title fits
    // a phone too.
    const inner = Math.max(
        30,
        title.length + (whole ? 1 : 2),
        ...body.map((t) => t.length),
    );
    const rgb = [color >> 16, (color >> 8) & 255, color & 255].join(";");
    return [
        "```ansi",
        `┌─ \u001b[38;2;${rgb}m${title}\u001b[0m ${"─".repeat(inner - title.length - 1)}┐`,
        ...body.map((t) => `│ ${t.padEnd(inner)} │`),
        `└${"─".repeat(inner + 2)}┘`,
        "```",
    ].join("\n");
}

// "2026-10-31 00:00 UTC".
const utc = (ms) =>
    `${new Date(ms).toISOString().slice(0, 16).replace("T", " ")} UTC`;

// A release clears current accounts and prevents restrictions on future signups.
// Commands run from enter.pollinations.ai/; the validated domain is safe in
// both shell strings and the SQL predicate.
export function releaseCommands(domain) {
    try {
        const sql = releaseDomainSql(domain);
        return [
            `npx wrangler kv key put --binding SETUP_HOLDS --env production --remote 'release:${domain}' released`,
            `npx wrangler d1 execute DB --env production --remote --command "${sql}"`,
        ];
    } catch {
        return ["(no command: unexpected domain, check it by hand)"];
    }
}

function commands({ kind, info }) {
    if (kind !== "SIGNUP_BURST" || info.hold !== "held") return [];
    return [
        `Release the domain and its accounts:
\`\`\`
${releaseCommands(info.domain).join("\n")}
\`\`\``,
    ];
}

const LABEL = {
    GEN_DOWN: "DOWN",
    PUBLIC_DOWN: "DOWN",
    UPSTREAM_DOWN: "DOWN",
    ENTER_DOWN: "DOWN",
    ANALYTICS_DOWN: "BLIND",
    PLATFORM_DROP: "DEGRADED",
    DEGRADED: "DEGRADED",
    PRIMARY_WEAK: "PRIMARY WEAK",
    WATCH_DOWN: "DOWN",
    SIGNUP_BURST: "QUEST POLLEN RESTRICTED",
    LEGACY_DOWN: "DEGRADED",
    COMMUNITY_DOWN: "DOWN",
    PAYMENTS_FAILING: "FAILING",
    JOB_STALE: "STALE",
    EARLY_ERRORS: "FAILING",
};
const SUBJECT = {
    gen: "gen Worker",
    public: "gen.pollinations.ai",
    upstream: "gen.myceli.ai",
    enter: "enter.pollinations.ai",
    analytics: "model status data",
    platform: "platform-wide",
    watch: "infra-watch",
    community: "community monitor",
    payments: "payments",
};
// Sign-up cards are about an email domain.
const DOMAIN_KEY = /^signup:/;
const subjectOf = (key) =>
    key.startsWith("model:")
        ? key.slice(6)
        : DOMAIN_KEY.test(key)
          ? `domain ${key.replace(DOMAIN_KEY, "")}`
          : key.startsWith("legacy:")
            ? `legacy ${key.slice(7)} bridge`
            : key.startsWith("stale:")
              ? STALE_JOBS[key.slice(6)].name
              : SUBJECT[key];
// Early errors are named after Enter's database while it causes at least half
// of them.
const d1Main = (info) => info.d1 * 2 >= info.failures;
const titleOf = (key, info) =>
    key !== "early"
        ? subjectOf(key)
        : d1Main(info)
          ? "Enter database (D1)"
          : "requests before any model";

// An open card's colour by severity: red down, orange degraded, amber weak
// primary. A closed card's colour is set by cardColor.
const RED = 0xe24b4a;
export const COLOR = {
    GEN_DOWN: RED,
    PUBLIC_DOWN: RED,
    UPSTREAM_DOWN: RED,
    ENTER_DOWN: RED,
    ANALYTICS_DOWN: RED,
    PLATFORM_DROP: RED,
    DEGRADED: 0xd85a30,
    PRIMARY_WEAK: 0xef9f27,
    WATCH_DOWN: RED,
    // A farm signing up stands out like an outage, without the ping.
    SIGNUP_BURST: RED,
    LEGACY_DOWN: 0xd85a30,
    COMMUNITY_DOWN: RED,
    PAYMENTS_FAILING: RED,
    JOB_STALE: RED,
    EARLY_ERRORS: RED,
};
const GREEN = 0x639922;
const GREY = 0x888780;

// An AI line's colour: its card's status while open, green for the closing
// line, so the last circle marks the end.
export const lineColor = (incident) =>
    incident.closedAt != null ? GREEN : COLOR[incident.kind];

// What a closed outage cost callers: green when no request failed, orange
// under half, red from half, grey when Tinybird couldn't say. An outage with
// no request counts (not a model) keeps its status colour.
function impactColor(key, incident) {
    if (!key.startsWith("model:")) return COLOR[incident.kind];
    const { lost } = incident;
    if (!lost) return GREY;
    if (!lost.failures) return GREEN;
    return lost.failures / lost.requests < 0.5 ? COLOR.DEGRADED : RED;
}

// A card's colour: its status while open; once closed, an outage's impact,
// and green for a domain card.
function cardColor(key, incident) {
    if (incident.closedAt == null) return COLOR[incident.kind];
    return DOMAIN_KEY.test(key) ? GREEN : impactColor(key, incident);
}

// Each AI line's circle, in its colour (lineColor), so the lines show how
// the incident moved. Emoji, since the lines sit outside the box, where
// Discord shows local times but no coloured text.
const BADGE = {
    [RED]: "🔴",
    [COLOR.DEGRADED]: "🟠",
    [COLOR.PRIMARY_WEAK]: "🟡",
    [GREEN]: "🟢",
};

// While the AI is writing a line, the card ends with this.
export const CHECKING = "*checking why…*";

// An AI line counts as on its way for at most this long: a restart drops the
// in-memory task, and its saved pending flag must not block the card forever.
const PENDING_MS = 10 * 60 * 1000;
export const waiting = (record, now) =>
    Boolean(record.pending) &&
    record.pendingAt != null &&
    now - record.pendingAt < PENDING_MS;

// Who an opening card pings: a weak primary never (the fallback keeps
// callers whole), a model failing for a single caller neither, a Myceli-only
// hostname neither (users are fine), a stale job as STALE_JOBS says; every
// other alert does.
export function pings(incident) {
    const { kind, info } = incident;
    if (["PRIMARY_WEAK", "UPSTREAM_DOWN", "SIGNUP_BURST"].includes(kind))
        return false;
    if (kind === "JOB_STALE") return STALE_JOBS[info.job].ping;
    if (kind === "DEGRADED" && info.model)
        return info.callers?.failing_callers !== 1;
    return true;
}

const routeRows = (routes = []) =>
    routes.slice(0, MAX_ROUTE_LINES).map((r) => {
        const rate = r.attempts > 0 ? r.ok / r.attempts : 1;
        return [
            r.fallback ? "FALLBACK" : "PRIMARY",
            `${r.provider} ${r.ok}/${r.attempts} (${Math.round(rate * 100)}%)`,
        ];
    });
const callersText = (callers) =>
    callers
        ? `${callers.failing_callers} of ${callers.callers} failing`
        : "unknown";
// How a model incident started, on its card open (once updated) and closed.
const startRow = (start) => [
    "START",
    `${pct(start.success)} of ${start.nonClient} reqs, ${callersText(start.callers)}`,
];

// Server errors first, then each payment with its Stripe ids, oldest first.
const MAX_PAYMENTS = 3;
const minute = (at) => `${at.slice(5, 16)} UTC`;
function paymentRows(rows) {
    const errors = rows.filter((r) => r.kind === "server_error");
    const unpaid = rows
        .filter((r) => r.kind === "not_credited")
        .sort((a, b) => a.at.localeCompare(b.at));
    const shown = unpaid.slice(0, MAX_PAYMENTS);
    return [
        ...errors.flatMap((r) => [
            ["5XX", r.id],
            ["", `${r.n}x ${r.reason} in 15 min, last ${minute(r.at)}`],
        ]),
        ...shown.flatMap((r) => [
            ["PAID", r.id],
            ...(r.ref ? [["", r.ref]] : []),
            [
                "",
                `$${(r.amount_cents / 100).toFixed(2)} ${r.ref ? "auto top-up" : "pack"}, ${minute(r.at)}`,
            ],
            ["", "no credit recorded"],
        ]),
        ...(unpaid.length > shown.length
            ? [["", `+${unpaid.length - shown.length} more payments`]]
            : []),
    ];
}

// Rows of an open card: what is true now, plus the frozen start once the
// card has been updated, so the history stays on the card.
function openRows(incident, now) {
    const { info, start, kind } = incident;
    if (kind === "GEN_DOWN")
        return [
            ["WHY", "both hostnames failing:"],
            ["", "gen.pollinations.ai  DOWN"],
            ["", "gen.myceli.ai        DOWN"],
            ["", "-> the Worker itself, not DNS"],
        ];
    if (kind === "PUBLIC_DOWN" || kind === "UPSTREAM_DOWN") {
        const pub = kind === "PUBLIC_DOWN";
        return [
            ["WHY", "one hostname failing:"],
            ["", `gen.pollinations.ai  ${pub ? "DOWN" : "up"}`],
            ["", `gen.myceli.ai        ${pub ? "up" : "DOWN"}`],
            [
                "",
                pub
                    ? "-> domain/DNS/route; Worker OK"
                    : "-> Myceli domain/route; users OK",
            ],
        ];
    }
    if (kind === "ENTER_DOWN")
        return [
            ["WHY", `key check failing ${CONFIRM_CHECKS}x`],
            ["ERROR", info.error],
            ["", "API keys, sign-in, billing fail"],
        ];
    if (kind === "EARLY_ERRORS")
        return [
            ["WORST", `${info.worst} reqs failed in 1 min`],
            ["CAUSE", `${info.d1} database, ${info.failures - info.d1} other`],
            ["BURSTS", `${info.bursts} min of 30, ${info.failures} failed`],
            ["LAST", utc(info.lastAt)],
            ["ROUTE", info.route],
            ["", "API keys, sign-in, billing fail"],
        ];
    if (kind === "ANALYTICS_DOWN")
        return [
            ["WHY", `unreachable ${CONFIRM_CHECKS}x, gen is up`],
            ["", "model alerts paused"],
        ];
    if (kind === "WATCH_DOWN")
        return [
            [
                "WHY",
                info.reachable
                    ? "no completed check for 10+ min"
                    : "/health unreachable",
            ],
            ["", "model and outage alerts paused"],
        ];
    if (kind === "COMMUNITY_DOWN")
        return [
            ["WHY", "community cycles failing or stuck"],
            ...(info.error ? [["ERROR", info.error]] : []),
            ["", "probes and community posts paused"],
        ];
    if (kind === "PAYMENTS_FAILING") return paymentRows(info.rows);
    if (kind === "JOB_STALE") {
        const job = STALE_JOBS[info.job];
        return [
            // The pipe looks back one day: older means no row at all.
            [
                "NEWEST",
                info.ageSeconds < 86_400
                    ? `${duration(info.ageSeconds * 1000)} old`
                    : "none in the last day",
            ],
            ["MAX", duration(job.maxSeconds * 1000)],
            ["", job.effect],
        ];
    }
    if (kind === "LEGACY_DOWN") {
        const rows = [
            [
                "REQS",
                `${info.last_hour_requests} last hour, median ${info.median_requests}`,
            ],
            [
                "FINAL",
                `${info.last_hour_success ?? 0}% last hour, median ${info.median_success}%`,
            ],
        ];
        if (
            info.last_hour_success < info.median_success / 2 &&
            info.last_hour_top_error?.length
        )
            rows.push(["WHY", `top error ${info.last_hour_top_error[0]}`]);
        return rows;
    }
    if (kind === "PLATFORM_DROP")
        return [
            ["REQS", `${info.now10} last 10m`],
            ["", `baseline ${Math.round(info.baseline10)}`],
        ];
    if (kind === "SIGNUP_BURST") {
        return [
            ["ACCOUNTS", `${info.accounts} in 24h`],
            ["SINCE", utc(info.since * 1000)],
            [
                "QUEST",
                info.hold === "released"
                    ? "released by a maintainer"
                    : info.sweepPending
                      ? "restriction pending; Paid usable"
                      : "spending frozen; Paid usable",
            ],
        ];
    }
    const rows = [
        ["FINAL", `${pct(info.success)} of ${info.nonClient} reqs 15m`],
        ["CALLERS", callersText(info.callers)],
        ...routeRows(info.routes),
    ];
    if (now > incident.openedAt) rows.push(startRow(start));
    if (incident.again)
        rows.push([
            "AGAIN",
            `last closed ${duration(incident.openedAt - incident.again)} ago`,
        ]);
    return rows;
}

// Rows of a closed card. A domain card keeps how long it lasted; an outage
// card keeps how it started, its routes then, and now: how long it lasted
// and what it cost are in its summary line.
function closedRows(key, incident) {
    if (DOMAIN_KEY.test(key))
        return [["LASTED", duration(incident.closedAt - incident.openedAt)]];
    if (!key.startsWith("model:")) return [];
    const { start, latest } = incident;
    const rows = [startRow(start), ...routeRows(start.routes)];
    if (latest)
        rows.push([
            "NOW",
            `${pct(latest.success)} of ${latest.nonClient} reqs 15m`,
        ]);
    return rows;
}

// A share as a whole percentage; a share under 1% doesn't read as 0%.
const percent = (x) => (x < 0.01 ? "<1%" : `${Math.round(x * 100)}%`);

// A closed outage card's last line, in bigger letters: how long it lasted
// and, for a model, what it cost callers. The card's colour already says how
// bad it was. Domain cards have no summary.
function summary(key, incident) {
    if (DOMAIN_KEY.test(key)) return null;
    const took = `### ⏱️ ${duration(incident.closedAt - incident.openedAt)}`;
    if (!key.startsWith("model:")) return took;
    const { lost } = incident;
    if (!lost) return `${took} · impact unknown`;
    const { requests, failures, callers, failing_callers } = lost;
    const share = failures ? ` (${percent(failures / requests)})` : "";
    return `${took} · 👥 ${failing_callers}/${callers} users hit · 📉 ${failures}/${requests} requests failed${share}`;
}

// The incident's card, in any state: the box, then while open "open since",
// then the AI's lines in order, each with its badge, then "checking why…"
// while one is coming, and once an outage closed its summary line.
// Mentions stay those of the opening post, so edits never change them.
export function renderCard(
    key,
    incident,
    { lines = [], checking = false, now } = {},
) {
    const closed = incident.closedAt != null;
    // A released domain's burst card says so in its title too.
    const label =
        incident.info.hold === "released" ? "RELEASED" : LABEL[incident.kind];
    // Closed, a domain card says how it ended; an outage keeps the worst
    // status it reached.
    const ended = incident.kind === "SIGNUP_BURST" ? "ENDED" : null;
    const status = closed
        ? (ended ?? LABEL[incident.worst ?? incident.kind])
        : label;
    const title = `${status}: ${titleOf(key, incident.info)}`;
    const color = cardColor(key, incident);
    const parts = [
        panel(
            title,
            closed ? closedRows(key, incident) : openRows(incident, now),
            color,
        ),
    ];
    // Caller enrichment is cached separately from the current health rows.
    // Keep its window explicit even when the card's final success has changed.
    if (!closed && incident.info.callers && incident.enriched?.at != null)
        parts.push(
            `*Caller counts: separate 15m sample, checked <t:${unix(incident.enriched.at)}:f>.*`,
        );
    if (!closed) parts.push(`*open since <t:${unix(incident.openedAt)}:R>*`);
    for (const line of lines)
        parts.push(
            [BADGE[line.color], `<t:${unix(line.at)}:t>`, line.text]
                .filter(Boolean)
                .join(" "),
        );
    if (checking) parts.push(CHECKING);
    if (!closed) parts.push(...commands(incident));
    const last = closed && summary(key, incident);
    if (last) parts.push(last);
    return {
        text: parts.join("\n"),
        ping: incident.pinged ?? pings(incident),
        color,
    };
}

// Heartbeat: infra-watch's own liveness, judged from outside Cloudflare by
// heartbeat.mjs (GitHub Actions). A last completed check this old means the
// watcher is down.
export const STALE_MS = 10 * 60 * 1000;

// One heartbeat run. The watcher being down is an incident with one card,
// like any other: posted with a ping when checks stop, left alone while they
// stay stopped, closed when they resume. `checkedAt` is infra-watch's
// last completed check, or null if /health didn't answer. `state.incident`
// is the open incident with its card's message id. Returns the card to post
// or the edit to make, and the state to keep once Discord has it.
export function heartbeat(state, checkedAt, now) {
    const fresh = checkedAt != null && now - checkedAt < STALE_MS;
    const { incident } = state;
    if (!incident) {
        if (fresh) return { state };
        const opened = {
            kind: "WATCH_DOWN",
            // Down since its last completed check, when known.
            openedAt: checkedAt ?? now,
            info: { reachable: checkedAt != null },
        };
        return {
            post: renderCard("watch", opened),
            state: { incident: opened },
        };
    }
    if (!fresh) return { state };
    const closed = { ...incident, closedAt: checkedAt };
    return {
        edit: { id: incident.messageId, card: renderCard("watch", closed) },
        state: {},
    };
}
