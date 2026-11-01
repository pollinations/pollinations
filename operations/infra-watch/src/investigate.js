// AI follow-up for an alert: one polli model reads the alert's public status
// rows, may call read-only tools for more, and writes a short report. Tools
// are code in this Worker: the model never sees a key, and every tool
// returns allowlisted fields only.

import { withTimeout } from "./delivery.js";

const GEN = "https://gen.pollinations.ai/v1/chat/completions";
export const MODEL = "openai/gpt-6.1-sol";
// AI lines per UTC day, across all incident and review cards.
export const DAILY_LIMIT = 60;
export const MAX_TOOL_CALLS = 8;
const TIMEOUT_MS = 90_000;
// The answer is one line under the alert panel.
export const MAX_LINE = 300;

// Status fields the model may read; everything else is dropped.
const FIELDS = [
    "event_type",
    "model_used",
    "provider",
    "is_rollup",
    "fallback_used",
    "total_requests",
    "status_2xx",
    "errors_4xx",
    "errors_402",
    "errors_5xx",
    "fallback_rescues",
    "retried_503s",
    "last_error_at",
    "latency_p50_ms",
    "latency_p95_ms",
];

// Monitor pipes (enter.pollinations.ai/observability/endpoints/infra_watch_*)
// read with the infra_watch_read token, which can read nothing else. The
// pipes return safe fields only; these lists keep it so if a pipe changes.
const TINYBIRD = "https://api.europe-west2.gcp.tinybird.co/v0/pipes";
const TOOL_TIMEOUT_MS = 15_000;
const ERROR_FIELDS = [
    "errors",
    "first_seen",
    "last_seen",
    "model",
    "route_path",
    "status",
    "error_code",
    "error_class",
    "error_kind",
    "upstream_host",
    "upstream_status",
    "duration_p50_ms",
    "example_request_id",
];
const CALLER_FIELDS = [
    "requests",
    "failures",
    "callers",
    "failing_callers",
    "top_caller_failures",
    "failures_regular",
    "failures_legacy",
    "failures_operations",
    "failures_dev",
];

export const SYSTEM_PROMPT = `You investigate one infra-watch alert for the Pollinations maintainers in a private Discord channel.
The user message is JSON: the moment, your previous lines on this incident, the alert, and public request statistics for the last 15 and 60 minutes.
The moment is one of:
- open: the incident just opened.
- change: it changed in a way that matters; the reason says how.
- closed: it is over; footprint says how long it lasted and how many requests and callers it cost.

You may call read-only tools when they help explain the alert, at most ${MAX_TOOL_CALLS} calls in all:
- model_status(model, minutes): public status rows of any official model for the last 15 or 60 minutes, for example a fallback target or a related model.
- recent_errors(model, minutes): server errors of the last minutes (at most 60), for one official model or platform-wide when model is omitted, grouped by kind, largest first, with count, first and last time, median duration and an example request id. error_kind is one of rate_limited, quota_or_billing, content_filtered, auth, timeout, overloaded, network, config or other. omitted_errors counts errors outside the groups shown.
- caller_spread(model, minutes): for one official model, requests, final 5xx failures, callers and failing callers (each an account), the largest single account's failures, and failures per traffic group: regular users, legacy bridges, operations (our own bots and monitors) and dev (staff).

How to read a status row:
- is_rollup 1: one count per request, what callers finally received for the model. is_rollup 0: attempts on one backend (model_used at provider). A retried request appears on more than one backend row, so backend rows can add up to more than the rollup.
- fallback_used true on a backend row: that backend was tried as a fallback after the primary failed.
- errors_4xx includes errors_402. errors_402 means the caller had no balance; it is not a fault. Other 4xx are caller errors such as bad requests or rate limits.
- errors_5xx: server or provider failures.
- retried_503s: attempts that got a 503 and were retried on another backend. The retry may still have failed, so this is not a count of saved requests.
- fallback_rescues: requests that finally succeeded through a fallback.
- Latencies are in milliseconds; times are UTC.
- A PRIMARY_WEAK alert means callers are fine thanks to a fallback, but the model's primary route fails often: explain why the primary fails and whether the fallback keeps up.
- A platform-drop alert lists the models whose traffic fell the most: now10 is the last 10 minutes, baseline10 the average 10 minutes before.

Your answer is added as one line to the incident's card, under a panel that already gives the success rate, the callers and each route, and under your previous lines. Reply with one line of plain text, at most two short sentences and under 250 characters:
- open: the verdict (an outage, a provider fault, our fault, a single caller, or unclear), then the cause, naming the provider and the kind of error.
- change: what changed and what it means now, without repeating your previous lines.
- closed: what caused it and what ended it. The card's summary already says how long it lasted and how many users and requests it cost: do not repeat those numbers.
Do not repeat the panel's numbers, request ids or caveats, and no markdown.

Use only facts from the data and tool results. If they cannot explain the alert, say it is unclear.`;

const TOOL_SPECS = [
    {
        type: "function",
        function: {
            name: "model_status",
            description:
                "Public status rows of an official model for the last 15 or 60 minutes.",
            parameters: {
                type: "object",
                properties: {
                    model: {
                        type: "string",
                        description:
                            "Official model id, e.g. google/gemini-2.5-flash-lite",
                    },
                    minutes: { type: "integer", enum: [15, 60] },
                },
                required: ["model"],
            },
        },
    },
    {
        type: "function",
        function: {
            name: "recent_errors",
            description:
                "Server errors of the last minutes, grouped by kind, for one official model or platform-wide.",
            parameters: {
                type: "object",
                properties: {
                    model: {
                        type: "string",
                        description: "Official model id; omit for all models",
                    },
                    minutes: { type: "integer", minimum: 1, maximum: 60 },
                },
            },
        },
    },
    {
        type: "function",
        function: {
            name: "caller_spread",
            description:
                "How one official model's failures spread over callers and traffic groups.",
            parameters: {
                type: "object",
                properties: {
                    model: { type: "string", description: "Official model id" },
                    minutes: { type: "integer", minimum: 1, maximum: 60 },
                },
                required: ["model"],
            },
        },
    },
];

export const investigates = (kind) =>
    ["DEGRADED", "PRIMARY_WEAK", "PLATFORM_DROP"].includes(kind);

const only = (fields, row) =>
    Object.fromEntries(fields.map((f) => [f, row[f]]));
const pick = (row) => only(FIELDS, row);

// Minutes the Tinybird tools may look back: 1 to 60, 15 by default.
const lookback = (minutes) => Math.min(Math.max(Number(minutes) || 15, 1), 60);

export async function pipe(name, params, { tinybirdToken, fetchImpl }) {
    if (!tinybirdToken) throw new Error("Tinybird is not configured");
    const url = new URL(`${TINYBIRD}/${name}.json`);
    for (const [key, value] of Object.entries(params))
        if (value != null) url.searchParams.set(key, String(value));
    return withTimeout(TOOL_TIMEOUT_MS, async (signal) => {
        const res = await fetchImpl(url, {
            headers: { authorization: `Bearer ${tinybirdToken}` },
            signal,
        });
        if (!res.ok) {
            res.body?.cancel();
            throw new Error(`tinybird ${name} -> ${res.status}`);
        }
        return (await res.json()).data;
    });
}

const totals = (rows) => {
    const sum = {};
    for (const row of rows)
        if (row.is_rollup)
            sum[row.model] = (sum[row.model] ?? 0) + row.total_requests;
    return sum;
};

// What the model reads for one alert, built from our own status data only.
// Official models only: community model names are chosen by their owners.
export function evidence(post, data) {
    const { info } = post;
    if (info.kind === "PLATFORM_DROP") {
        const now = totals(data.last10);
        const hour = totals(data.last60);
        const biggestDrops = Object.entries(hour)
            .filter(([model]) => data.official.has(model))
            .map(([model, total]) => ({
                model,
                now10: now[model] ?? 0,
                baseline10: (total - (now[model] ?? 0)) / 5,
            }))
            .sort((a, b) => b.baseline10 - b.now10 - (a.baseline10 - a.now10))
            .slice(0, 10);
        return { alert: info, biggestDrops };
    }
    const rows = (all) => all.filter((r) => r.model === info.model).map(pick);
    return {
        alert: info,
        last15: rows(data.recent),
        last60: rows(data.last60),
    };
}

// Read-only tools: model_status over the data this check already fetched,
// the other two over the Tinybird monitor pipes. Official models only:
// community model names are chosen by their owners. A failure comes back
// as { error } for the model to read, never as an exception.
export const toolsFor = (data, tinybird = {}) => {
    const tb = { fetchImpl: fetch, ...tinybird };
    const unofficial = (model) =>
        model != null && !data.official.has(model)
            ? { error: "not an official model" }
            : null;
    // Platform-wide errors include community models, whose names and hosts
    // are chosen by their owners: the model reads them as "community".
    // "undefined" is our own non-model routes.
    const community = (row) =>
        row.model === "undefined" || data.official.has(row.model)
            ? row
            : { ...row, model: "community", upstream_host: "community" };
    return {
        model_status: ({ model, minutes }) => {
            if (!data.official.has(model))
                return { error: "not an official model" };
            const hour = minutes === 60;
            const rows = (hour ? data.last60 : data.recent)
                .filter((r) => r.model === model)
                .map(pick);
            return { model, minutes: hour ? 60 : 15, rows };
        },
        recent_errors: async ({ model, minutes }) => {
            const refused = unofficial(model);
            if (refused) return refused;
            try {
                const rows = await pipe(
                    "infra_watch_errors",
                    { model, minutes: lookback(minutes) },
                    tb,
                );
                const total = rows[0]?.total_errors ?? 0;
                const shown = rows.reduce((sum, r) => sum + r.errors, 0);
                return {
                    minutes: lookback(minutes),
                    total_errors: total,
                    total_groups: rows[0]?.total_groups ?? 0,
                    shown_errors: shown,
                    omitted_errors: total - shown,
                    groups: rows.map((r) => community(only(ERROR_FIELDS, r))),
                };
            } catch (error) {
                return { error: error.message };
            }
        },
        caller_spread: async ({ model, minutes }) => {
            const refused = unofficial(model ?? "");
            if (refused) return refused;
            try {
                const [row] = await pipe(
                    "infra_watch_callers",
                    { model, minutes: lookback(minutes) },
                    tb,
                );
                return {
                    model,
                    minutes: lookback(minutes),
                    ...only(CALLER_FIELDS, row ?? {}),
                };
            } catch (error) {
                return { error: error.message };
            }
        },
    };
};

// The model's answer as one line, or null if it gave none.
export function reply(text) {
    const line = (text ?? "")
        .split("\n")
        .map((l) => l.trim())
        .find(Boolean);
    return line ? line.slice(0, MAX_LINE) : null;
}

async function chat(
    key,
    messages,
    specs,
    offerTools,
    signal,
    fetchImpl,
    maxTokens,
) {
    const res = await fetchImpl(GEN, {
        method: "POST",
        headers: {
            authorization: `Bearer ${key}`,
            "content-type": "application/json",
        },
        body: JSON.stringify({
            model: MODEL,
            reasoning_effort: "low",
            max_completion_tokens: maxTokens,
            messages,
            ...(specs.length && {
                tools: specs,
                tool_choice: offerTools ? "auto" : "none",
            }),
        }),
        signal,
    });
    if (!res.ok) {
        res.body?.cancel();
        throw new Error(`gen chat -> ${res.status}`);
    }
    return (await res.json()).choices?.[0]?.message ?? {};
}

async function runTool(tools, call) {
    const tool = tools[call.function?.name];
    if (!tool) return { error: "unknown tool" };
    try {
        return await tool(JSON.parse(call.function.arguments || "{}"));
    } catch {
        return { error: "invalid arguments" };
    }
}

// Runs the model until it answers. It may call tools for at most
// MAX_TOOL_CALLS calls; the whole investigation shares one timeout. Without
// specs the model just answers. `answer` shapes the answer: one line by
// default.
export async function ask(
    key,
    payload,
    tools,
    {
        fetchImpl = fetch,
        system = SYSTEM_PROMPT,
        specs = TOOL_SPECS,
        answer = reply,
        maxTokens = 1500,
    } = {},
) {
    return withTimeout(TIMEOUT_MS, async (signal) => {
        const messages = [
            { role: "system", content: system },
            { role: "user", content: JSON.stringify(payload) },
        ];
        let calls = 0;
        for (;;) {
            const offer = calls < MAX_TOOL_CALLS;
            const message = await chat(
                key,
                messages,
                specs,
                offer,
                signal,
                fetchImpl,
                maxTokens,
            );
            if (!offer || !message.tool_calls?.length)
                return answer(message.content);
            messages.push(message);
            // The budget is checked per call: one reply can hold many calls.
            for (const call of message.tool_calls) {
                const result =
                    calls < MAX_TOOL_CALLS
                        ? await runTool(tools, call)
                        : { error: "tool call budget used up" };
                calls++;
                messages.push({
                    role: "tool",
                    tool_call_id: call.id,
                    content: JSON.stringify(result),
                });
            }
        }
    });
}

// A closed incident's footprint over up to 24 hours: its requests and those
// that ended in a server error, its callers (accounts) and those that got
// one. Null if Tinybird can't say.
export async function lost(model, minutes, tinybird) {
    try {
        const [row] = await pipe(
            "infra_watch_callers",
            { model, minutes: Math.min(Math.max(Math.ceil(minutes), 1), 1440) },
            { fetchImpl: fetch, ...tinybird },
        );
        if (!row) return null;
        const { requests, failures, callers, failing_callers } = row;
        return { requests, failures, callers, failing_callers };
    } catch (error) {
        console.error(`lost: ${error.message}`);
        return null;
    }
}

// Counts AI calls per UTC day; null once the day's limit is used.
export function allow(budget, now, limit = DAILY_LIMIT) {
    const day = new Date(now).toISOString().slice(0, 10);
    const count = budget?.day === day ? budget.count : 0;
    return count < limit ? { day, count: count + 1 } : null;
}
