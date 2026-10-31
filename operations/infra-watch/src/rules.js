// Plain alert rules over public `/models/status` data, and the incident
// cards they drive. No AI, no secrets.

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
    reviews = new Map(),
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
    // Held accounts asking for a review, per email domain, oldest first:
    // open while any waits for a maintainer's decision.
    for (const [domain, accounts] of reviews)
        found[`review:${domain}`] = {
            kind: "REVIEW",
            domain,
            pending: accounts.length,
            accounts: accounts.slice(0, REVIEW_LISTED),
        };
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

// One incident per key: a model (`model:<id>`), or gen, a hostname, the
// status data or the platform. It opens once confirmed, updates on every
// check that still finds it, and closes once clean; a closed incident is
// never touched again. Returns what happened to each, and the next state.
export function step(state, found, now, recent = []) {
    // With gen down, nothing else can be judged, not even a single hostname.
    // With analytics down, only the hostname checks still have data.
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
            if (streak < (CONFIRMED.has(key) ? CONFIRM_CHECKS : 1)) continue;
            open[key] = {
                kind: info.kind,
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
        open[key] = {
            ...incident,
            kind: moved ? info.kind : incident.kind,
            pending: moved ? null : pending,
            info,
        };
        actions.push({ type: "update", key });
    }

    for (const [key, incident] of Object.entries(open)) {
        if (found[key]) continue;
        if (found.gen && key !== "gen") continue;
        if (found.analytics && !HOSTS[key]) continue;
        // A model needs RECOVER_CHECKS clean checks in a row to close; a thin
        // sample neither counts nor resets the run.
        const model = key.startsWith("model:") ? key.slice(6) : null;
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
        asking:
            incident.kind === "REVIEW"
                ? info.accounts.map((a) => a.userId).join(",")
                : null,
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

// Worse in a way that needs a person again: callers now affected, or the
// affected callers went from one to several.
export const escalates = (before, now) =>
    now.kind === "DEGRADED" &&
    (now.failingCallers ?? 2) > 1 &&
    (before.kind !== "DEGRADED" || (before.failingCallers ?? 2) <= 1);

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

// A box titled with the alert and what it is about. It is as wide as its
// title or its longest row needs, so a full model id is never cut. The
// title is drawn in the card's colour (an ansi block): Discord on desktop
// shows it, the phone shows plain text.
function panel(title, lines, color) {
    const body = lines.map(
        ([field, value]) =>
            `${field.padEnd(Math.max(8, field.length + 1))}${fit(String(value))}`,
    );
    const inner = Math.max(30, title.length + 2, ...body.map((t) => t.length));
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

// The Setup hold commands under an open card: release a held domain, and
// approve or decline each listed review.
function commands({ kind, info }) {
    const block = (intro, lines) =>
        `${intro}\n\`\`\`\n${lines.join("\n")}\n\`\`\``;
    const release = kvPut(`release:${info.domain}`, "released");
    if (kind === "SIGNUP_BURST" && info.hold === "held")
        return [block("Release the domain:", [release])];
    if (kind !== "REVIEW") return [];
    return [
        block("Approve or decline each account, or release the domain:", [
            ...info.accounts.flatMap((a) => [
                kvPut(`decision:${a.userId}`, "approved"),
                kvPut(`decision:${a.userId}`, "declined"),
            ]),
            release,
        ]),
    ];
}

// Accounts a review card lists, each with its commands; the card moves on
// to the next ones as a maintainer decides.
export const REVIEW_LISTED = 5;

// A maintainer's command on the SETUP_HOLDS store, run from
// enter.pollinations.ai/ with a Cloudflare login on the account. Keys hold
// only ids and plain domain names; anything else gets no command.
export const kvPut = (key, value) =>
    /^(release|decision):[A-Za-z0-9._-]+$/.test(key)
        ? `npx wrangler kv key put --binding SETUP_HOLDS --env production --remote '${key}' ${value}`
        : "(no command: unexpected characters, check the key by hand)";

const LABEL = {
    GEN_DOWN: "DOWN",
    PUBLIC_DOWN: "DOWN",
    UPSTREAM_DOWN: "DOWN",
    ANALYTICS_DOWN: "BLIND",
    PLATFORM_DROP: "DEGRADED",
    DEGRADED: "DEGRADED",
    PRIMARY_WEAK: "PRIMARY WEAK",
    WATCH_DOWN: "DOWN",
    SIGNUP_BURST: "SETUP QUESTS LIMITED",
    REVIEW: "REVIEW",
};
const SUBJECT = {
    gen: "gen Worker",
    public: "gen.pollinations.ai",
    upstream: "gen.myceli.ai",
    analytics: "model status data",
    platform: "platform-wide",
    watch: "infra-watch",
};
// Sign-up and review cards are about an email domain.
const DOMAIN_KEY = /^(signup|review):/;
export const subjectOf = (key) =>
    key.startsWith("model:")
        ? key.slice(6)
        : DOMAIN_KEY.test(key)
          ? `domain ${key.replace(DOMAIN_KEY, "")}`
          : SUBJECT[key];

// Embed side-bar colour by severity: red down, orange degraded, yellow weak
// primary, green closed.
const RED = 0xe24b4a;
export const COLOR = {
    GEN_DOWN: RED,
    PUBLIC_DOWN: RED,
    UPSTREAM_DOWN: RED,
    ANALYTICS_DOWN: RED,
    PLATFORM_DROP: RED,
    DEGRADED: 0xd85a30,
    PRIMARY_WEAK: 0xef9f27,
    WATCH_DOWN: RED,
    // A farm signing up stands out like an outage, without the ping.
    SIGNUP_BURST: RED,
    REVIEW: 0xef9f27,
};
const GREEN = 0x639922;

// A card's colour: its status while open, green once closed.
export const cardColor = (incident) =>
    incident.closedAt != null ? GREEN : COLOR[incident.kind];

// Each AI line's badge: the card's colour when the line was written, so the
// lines show how the incident moved. Emoji circles, since the lines sit
// outside the box, where Discord shows local times but no coloured text.
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
// hostname neither (users are fine); every other alert does.
export function pings(incident) {
    const { kind, info } = incident;
    if (
        ["PRIMARY_WEAK", "UPSTREAM_DOWN", "SIGNUP_BURST", "REVIEW"].includes(
            kind,
        )
    )
        return false;
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
    if (kind === "PLATFORM_DROP")
        return [
            ["REQS", `${info.now10} last 10m`],
            ["", `baseline ${Math.round(info.baseline10)}`],
        ];
    if (kind === "REVIEW")
        return [
            [
                "ASKING",
                `${info.pending} account${info.pending === 1 ? "" : "s"}`,
            ],
            ["OLDEST", utc(info.accounts[0].requestedAt)],
            ["LISTED", `${info.accounts.length} oldest, below`],
        ];
    if (kind === "SIGNUP_BURST") {
        return [
            ["ACCOUNTS", `${info.accounts} in 24h`],
            ["SINCE", utc(info.since * 1000)],
            [
                "SETUP",
                info.hold === "released"
                    ? "released by a maintainer"
                    : "held until a purchase or review",
            ],
        ];
    }
    const rows = [
        ["FINAL", `${pct(info.success)} of ${info.nonClient} reqs 15m`],
        ["CALLERS", callersText(info.callers)],
        ...routeRows(info.routes),
    ];
    if (now > incident.openedAt)
        rows.push([
            "START",
            `${pct(start.success)} of ${start.nonClient} reqs, ${callersText(start.callers)}`,
        ]);
    if (incident.again)
        rows.push([
            "AGAIN",
            `last closed ${duration(incident.openedAt - incident.again)} ago`,
        ]);
    return rows;
}

// Rows of a closed card: how long, what it cost, how it started, now.
function closedRows(key, incident) {
    const rows = [
        [
            DOMAIN_KEY.test(key) ? "LASTED" : "DOWN",
            duration(incident.closedAt - incident.openedAt),
        ],
    ];
    if (!key.startsWith("model:")) return rows;
    const { start, lost, latest } = incident;
    rows.push([
        "LOST",
        lost
            ? `${lost.failures} request${lost.failures === 1 ? "" : "s"}, ${lost.failing_callers} caller${lost.failing_callers === 1 ? "" : "s"}`
            : "unknown",
    ]);
    rows.push([
        "START",
        `${pct(start.success)} of ${start.nonClient} reqs, ${callersText(start.callers)}`,
    ]);
    rows.push(...routeRows(start.routes));
    if (latest)
        rows.push([
            "NOW",
            `${pct(latest.success)} of ${latest.nonClient} reqs 15m`,
        ]);
    return rows;
}

// The incident's card, in any state: the box, then while open "open since",
// then the AI's lines in order, each with its badge, then "checking why…"
// while one is coming.
// Mentions stay those of the opening post, so edits never change them.
export function renderCard(
    key,
    incident,
    { lines = [], checking = false, now } = {},
) {
    const closed = incident.closedAt != null;
    const ended =
        { SIGNUP_BURST: "ENDED", REVIEW: "DECIDED" }[incident.kind] ??
        "RECOVERED";
    // A released domain's burst card says so in its title too.
    const label =
        incident.info.hold === "released" ? "RELEASED" : LABEL[incident.kind];
    const title = `${closed ? ended : label}: ${subjectOf(key)}`;
    const color = cardColor(incident);
    const parts = [
        panel(
            title,
            closed ? closedRows(key, incident) : openRows(incident, now),
            color,
        ),
    ];
    if (!closed) parts.push(`*open since <t:${unix(incident.openedAt)}:R>*`);
    // A review card shows only the verdict on the accounts it lists now.
    const shown =
        incident.kind === "REVIEW"
            ? lines
                  .filter((l) => l.asking === snapshot(incident).asking)
                  .slice(-1)
            : lines;
    for (const line of shown)
        parts.push(
            ["↳", BADGE[line.color], `<t:${unix(line.at)}:t>`, line.text]
                .filter(Boolean)
                .join(" "),
        );
    if (checking) parts.push(CHECKING);
    if (!closed) parts.push(...commands(incident));
    return {
        text: parts.join("\n"),
        ping: incident.pinged ?? pings(incident),
        color,
    };
}

// The one new message an open incident can post: it got worse and needs a
// person. It links to the card instead of repeating it.
export const escalation = (key, incident, link) => ({
    text: `↑ \`${subjectOf(key)}\` is now ${LABEL[incident.kind]}: callers are affected. ${link}`,
    ping: true,
    color: COLOR[incident.kind],
});

// Heartbeat: infra-watch's own liveness, judged from outside Cloudflare by
// heartbeat.mjs (GitHub Actions). A last completed check this old means the
// watcher is down.
export const STALE_MS = 10 * 60 * 1000;

// One heartbeat run. The watcher being down is an incident with one card,
// like any other: posted with a ping when checks stop, left alone while they
// stay stopped, edited green when they resume. `checkedAt` is infra-watch's
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
