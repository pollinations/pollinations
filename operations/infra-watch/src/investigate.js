// AI follow-up for an alert: one polli model reads the alert's public status
// rows, may call read-only tools for more, and writes a short report. Tools
// are code in this Worker: the model never sees a key, and every tool
// returns allowlisted fields only.

import { withTimeout } from "./delivery.js";

const GEN = "https://gen.pollinations.ai/v1/chat/completions";
export const MODEL = "openai/gpt-6.1-sol";
export const DAILY_LIMIT = 10;
export const MAX_TOOL_CALLS = 8;
// One Discord message holds 2,000 characters; leave room for the frame.
export const MAX_REPORT = 1800;
const TIMEOUT_MS = 90_000;
const MAX_LINE = 300;
// WHY, one sentence, then up to 12 evidence lines.
const MAX_LINES = 14;

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

export const SYSTEM_PROMPT = `You investigate one infra-watch alert for the Pollinations maintainers in a private Discord channel.
The user message is JSON: the alert, and public request statistics for the last 15 and 60 minutes.

You may call read-only tools when they help explain the alert, at most ${MAX_TOOL_CALLS} calls in all:
- model_status(model, minutes): public status rows of any official model for the last 15 or 60 minutes, for example a fallback target or a related model.

How to read a status row:
- is_rollup 1: one count per request, what callers finally received for the model. is_rollup 0: attempts on one backend (model_used at provider). A retried request appears on more than one backend row, so backend rows can add up to more than the rollup.
- fallback_used true on a backend row: that backend was tried as a fallback after the primary failed.
- errors_4xx includes errors_402. errors_402 means the caller had no balance; it is not a fault. Other 4xx are caller errors such as bad requests or rate limits.
- errors_5xx: server or provider failures.
- retried_503s: attempts that got a 503 and were retried on another backend. The retry may still have failed, so this is not a count of saved requests.
- fallback_rescues: requests that finally succeeded through a fallback.
- Latencies are in milliseconds; times are UTC.
- A platform-drop alert lists the models whose traffic fell the most: now10 is the last 10 minutes, baseline10 the average 10 minutes before.

Reply in plain text, without headings or code blocks:
WHY <the most likely cause, at most 80 characters, naming providers and counts>
<one plain sentence: what callers experience, and whether it looks like a provider fault, our fault, or a single caller>
Then up to 12 short lines starting with "- ": the evidence (numbers and times), which component is involved, and what a maintainer should check next.

Use only facts from the data and tool results. If they cannot explain the alert, say so on the WHY line.`;

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
];

export const investigates = (post) =>
    post.type === "alert" &&
    ["DEGRADED", "PLATFORM_DROP"].includes(post.info.kind);

const pick = (row) => Object.fromEntries(FIELDS.map((f) => [f, row[f]]));

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

// Read-only tools over the data this check already fetched. Official
// models only: community model names are chosen by their owners.
export const toolsFor = (data) => ({
    model_status: ({ model, minutes }) => {
        if (!data.official.has(model))
            return { error: "not an official model" };
        const hour = minutes === 60;
        const rows = (hour ? data.last60 : data.recent)
            .filter((r) => r.model === model)
            .map(pick);
        return { model, minutes: hour ? 60 : 15, rows };
    },
});

// The model's report as lines (WHY, a sentence, evidence), cut to fit one
// Discord message, or null if it is off-format.
export function reply(text) {
    const lines = (text ?? "")
        .split("\n")
        .map((l) => l.trim().slice(0, MAX_LINE))
        .filter(Boolean)
        .slice(0, MAX_LINES);
    if (lines.length < 2 || !lines[0].startsWith("WHY")) return null;
    while (lines.join("\n").length > MAX_REPORT) lines.pop();
    return lines;
}

async function chat(key, messages, offerTools, signal, fetchImpl) {
    const res = await fetchImpl(GEN, {
        method: "POST",
        headers: {
            authorization: `Bearer ${key}`,
            "content-type": "application/json",
        },
        body: JSON.stringify({
            model: MODEL,
            reasoning_effort: "low",
            max_completion_tokens: 1500,
            messages,
            tools: TOOL_SPECS,
            tool_choice: offerTools ? "auto" : "none",
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
// MAX_TOOL_CALLS calls; the whole investigation shares one timeout.
export async function ask(key, payload, tools, { fetchImpl = fetch } = {}) {
    return withTimeout(TIMEOUT_MS, async (signal) => {
        const messages = [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: JSON.stringify(payload) },
        ];
        let calls = 0;
        for (;;) {
            const offer = calls < MAX_TOOL_CALLS;
            const message = await chat(key, messages, offer, signal, fetchImpl);
            if (!offer || !message.tool_calls?.length)
                return reply(message.content);
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

// Counts investigations per UTC day; null once the day's limit is used.
export function allow(budget, now) {
    const day = new Date(now).toISOString().slice(0, 10);
    const count = budget?.day === day ? budget.count : 0;
    return count < DAILY_LIMIT ? { day, count: count + 1 } : null;
}

export const followUp = (post, [why, ...rest]) =>
    [
        `↳ \`${post.info.model ?? "platform"}\` ${why}`,
        ...rest,
        `-# AI follow-up (${MODEL}) from public status data`,
    ].join("\n");
