// AI follow-up for an alert: one polli model reads the alert's public status
// rows and explains the likely cause in two lines. The model gets no tools
// and never sees a key; the Worker sends only allowlisted status fields.

import { withTimeout } from "./delivery.js";

const GEN = "https://gen.pollinations.ai/v1/chat/completions";
export const MODEL = "openai/gpt-6.1-sol";
export const DAILY_LIMIT = 10;
const TIMEOUT_MS = 45_000;
const MAX_LINE = 200;

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

export const SYSTEM_PROMPT = `You explain one infra-watch alert to the Pollinations maintainers in Discord.
The user message is JSON: the alert, and public request statistics for the last 15 and 60 minutes.

How to read a status row:
- is_rollup 1: what callers finally received for the model. is_rollup 0: one backend that was tried (model_used at provider).
- fallback_used true on a backend row: that backend was tried as a fallback after the primary failed.
- errors_4xx includes errors_402. errors_402 means the caller had no balance; it is not a fault. Other 4xx are caller errors such as bad requests or rate limits.
- errors_5xx: server or provider failures. retried_503s and fallback_rescues: requests saved by a retry or a fallback.
- Latencies are in milliseconds; times are UTC.
- A platform-drop alert lists the models whose traffic fell the most: now10 is the last 10 minutes, baseline10 the average 10 minutes before.

Reply with exactly two lines and no markdown:
WHY <the most likely cause, at most 80 characters, naming providers and counts>
<one plain sentence: what callers experience, and whether it looks like a provider fault, our fault, or a single caller>

Use only numbers from the data. If the data cannot explain the alert, say so on the WHY line.`;

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

// The model's answer as [WHY line, sentence], or null if it is off-format.
export function reply(text) {
    const lines = (text ?? "")
        .split("\n")
        .map((l) => l.trim().slice(0, MAX_LINE))
        .filter(Boolean);
    if (lines.length < 2 || !lines[0].startsWith("WHY")) return null;
    return lines.slice(0, 2);
}

export async function ask(key, payload, { fetchImpl = fetch } = {}) {
    return withTimeout(TIMEOUT_MS, async (signal) => {
        const res = await fetchImpl(GEN, {
            method: "POST",
            headers: {
                authorization: `Bearer ${key}`,
                "content-type": "application/json",
            },
            body: JSON.stringify({
                model: MODEL,
                reasoning_effort: "low",
                max_completion_tokens: 1000,
                messages: [
                    { role: "system", content: SYSTEM_PROMPT },
                    { role: "user", content: JSON.stringify(payload) },
                ],
            }),
            signal,
        });
        if (!res.ok) {
            res.body?.cancel();
            throw new Error(`gen chat -> ${res.status}`);
        }
        const json = await res.json();
        return reply(json.choices?.[0]?.message?.content);
    });
}

// Counts investigations per UTC day; null once the day's limit is used.
export function allow(budget, now) {
    const day = new Date(now).toISOString().slice(0, 10);
    const count = budget?.day === day ? budget.count : 0;
    return count < DAILY_LIMIT ? { day, count: count + 1 } : null;
}

export const followUp = (post, [why, sentence]) =>
    `↳ \`${post.info.model ?? "platform"}\` ${why}\n${sentence}\n-# AI follow-up (${MODEL}) from public status data`;
