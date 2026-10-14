/**
 * Triage router — a code agent that picks a model per request and answers as it.
 *
 * It routes on three signals, all read live at request time:
 *   1. task tier    — how much reasoning the request looks like it needs
 *   2. model health — 5xx rate, fallback rescues and p95 latency from /models/status
 *   3. price        — prompt + completion price per token from /v1/models
 *
 * Design choice: the router only ever picks from a small curated pool per tier
 * (`POOLS`). A live scoreboard still decides *which* pool member wins, and moves
 * traffic away from a model that is currently degrading, but caller traffic is
 * never sent to an untested long-tail model. Pools are the part a human vouches
 * for; price and health are the part the router decides.
 *
 * Every answer carries the decision in headers (`x-router-*`), so a caller can
 * see which model answered and why in a single call.
 */

type AgentContext = {
    request: Request;
    pollinations: (path: string, init?: RequestInit) => Promise<Response>;
};

type Body = Record<string, unknown> & {
    model?: string;
    input?: unknown;
    messages?: unknown;
    instructions?: string | null;
    tools?: unknown[];
};

type ModelInfo = {
    id: string;
    context_length?: number;
    input_modalities?: string[];
    supported_endpoints?: string[];
    pricing?: Record<string, string>;
};

type StatusRow = {
    model: string;
    is_rollup?: number;
    total_requests?: number;
    status_2xx?: number;
    errors_5xx?: number;
    served?: number;
    fallback_rescues?: number;
    latency_p95_ms?: number | null;
    tokens_per_second?: number | null;
};

type Tier = "fast" | "balanced" | "deep";

type Candidate = {
    id: string;
    price: number;
    penalty: number;
    score: number;
    note: string;
};

type Decision = {
    tier: Tier;
    model: string;
    why: string;
    pool: string;
    degraded: string[];
};

/** Curated pools. A model lands here only after being exercised by hand. */
const POOLS: Record<Tier, string[]> = {
    fast: ["amazon/nova-micro-v1", "openai/gpt-oss-20b", "openai/gpt-5-nano"],
    balanced: [
        "deepseek/deepseek-v4.1-flash",
        "openai/gpt-5.6-luna",
        "z-ai/glm-5.3-flash",
        "openai/gpt-5.4-nano",
    ],
    deep: ["deepseek/deepseek-v4-pro", "openai/gpt-5.6-sol", "x-ai/grok-4.3"],
};

/** Tiers to try after a tier fails, cheapest escalation first. */
const ESCALATION: Record<Tier, Tier[]> = {
    fast: ["balanced", "deep"],
    balanced: ["deep"],
    deep: [],
};

const HARD_WORDS =
    /\b(architect|architecture|design|derive|prove|refactor|research|compare|analyz|analys|strateg|debug|optimi|migrat|benchmark|trade-?off|review)\b/i;

const CACHE_MS = 60_000;

type Signals = {
    models: Map<string, ModelInfo>;
    status: Map<string, StatusRow>;
};

let cache: (Signals & { at: number }) | null = null;

/** Test helper: drop the cached catalog and health snapshot. */
export function resetSignalCache(): void {
    cache = null;
}

function num(value: unknown, fallback = 0): number {
    const parsed = typeof value === "string" ? Number(value) : value;
    return typeof parsed === "number" && Number.isFinite(parsed)
        ? parsed
        : fallback;
}

async function loadSignals(
    pollinations: AgentContext["pollinations"],
): Promise<Signals> {
    const now = Date.now();
    if (cache && now - cache.at < CACHE_MS) return cache;

    const models = new Map<string, ModelInfo>();
    const status = new Map<string, StatusRow>();
    try {
        const catalog = await pollinations("/v1/models");
        if (catalog.ok) {
            const payload = (await catalog.json()) as { data?: ModelInfo[] };
            for (const model of payload.data ?? []) models.set(model.id, model);
        }
    } catch {
        // A missing catalog only costs precision; the pools still route.
    }
    try {
        const health = await pollinations("/models/status?minutes=30");
        if (health.ok) {
            const payload = (await health.json()) as { data?: StatusRow[] };
            for (const row of payload.data ?? []) {
                if (row.is_rollup === 1) status.set(row.model, row);
            }
        }
    } catch {
        // Same here: without status the router falls back to price order.
    }
    cache = { at: now, models, status };
    return cache;
}

function priceOf(model: ModelInfo | undefined): number {
    const pricing = model?.pricing;
    if (!pricing) return 0;
    return num(pricing.promptTextTokens) + num(pricing.completionTextTokens);
}

/**
 * Reliability multiplier on a model's advertised price: 1 means "as advertised",
 * higher means "expect to pay again after a failure, or to wait".
 *
 * Only 2xx and 5xx count as outcomes: a 4xx is a caller-side mistake and says
 * nothing about whether the model is healthy.
 */
function penaltyOf(row: StatusRow | undefined): {
    penalty: number;
    note: string;
} {
    if (!row || num(row.total_requests) < 5) {
        return { penalty: 1, note: "no recent traffic" };
    }
    const outcomes = num(row.status_2xx) + num(row.errors_5xx);
    if (outcomes < 5) return { penalty: 1, note: "no recent outcomes" };
    const errRate = num(row.errors_5xx) / outcomes;
    const okRate = num(row.status_2xx) / outcomes;
    const rescueRate = num(row.fallback_rescues) / Math.max(num(row.served), 1);
    const p95 = num(row.latency_p95_ms);
    const tps = num(row.tokens_per_second);
    const latency = p95 > 45_000 ? 1 + (p95 - 45_000) / 45_000 : 1;
    const slowTail = okRate < 0.5 ? 1 + 4 * (1 - okRate) : 1;
    const throughput = tps > 0 && tps < 10 ? 1 + (10 - tps) / 10 : 1;
    const penalty =
        (1 + 6 * errRate) *
        (1 + 3 * rescueRate) *
        latency *
        slowTail *
        throughput;

    const notes: string[] = [`${(okRate * 100).toFixed(0)}% ok`];
    if (errRate > 0) notes.push(`${(errRate * 100).toFixed(1)}% 5xx`);
    if (num(row.fallback_rescues) > 0)
        notes.push(`${row.fallback_rescues} rescues`);
    if (p95 > 0) notes.push(`p95 ${Math.round(p95 / 1000)}s`);
    if (tps > 0) notes.push(`${tps.toFixed(0)} tok/s`);
    return { penalty, note: notes.join(", ") };
}

function textOf(value: unknown): string {
    if (typeof value === "string") return value;
    if (Array.isArray(value)) return value.map(textOf).join("\n");
    if (value && typeof value === "object") {
        const record = value as Record<string, unknown>;
        if (typeof record.text === "string") return record.text;
        if (record.content !== undefined) return textOf(record.content);
        if (record.parts !== undefined) return textOf(record.parts);
    }
    return "";
}

function hasImage(value: unknown): boolean {
    if (Array.isArray(value)) return value.some(hasImage);
    if (value && typeof value === "object") {
        const record = value as Record<string, unknown>;
        const type = typeof record.type === "string" ? record.type : "";
        if (type.includes("image")) return true;
        if (record.image_url !== undefined) return true;
        if (record.input_image !== undefined) return true;
        return Object.values(record).some(hasImage);
    }
    return false;
}

function promptText(body: Body): string {
    return [textOf(body.input), textOf(body.messages), body.instructions ?? ""]
        .filter(Boolean)
        .join("\n");
}

function classify(body: Body): { tier: Tier; why: string } {
    const text = promptText(body);
    const chars = text.length;
    const tools = Array.isArray(body.tools) ? body.tools.length : 0;
    const image = hasImage(body.input) || hasImage(body.messages);
    const code = /```|\bfunction\b|\bclass\b|\bimport\b/.test(text);
    const hard = HARD_WORDS.test(text);

    if (chars > 2400 || (hard && chars > 800 && (code || tools > 0))) {
        return {
            tier: "deep",
            why: `long or complex input (${chars} chars${code ? ", code" : ""}${
                tools > 0 ? `, ${tools} tools` : ""
            }${hard ? ", reasoning ask" : ""})`,
        };
    }
    if (image)
        return { tier: "balanced", why: "image input needs a vision model" };
    if (tools > 0)
        return { tier: "balanced", why: `${tools} tool(s) to drive` };
    if (chars < 320 && !code) {
        return { tier: "fast", why: `short plain request (${chars} chars)` };
    }
    return { tier: "balanced", why: `ordinary request (${chars} chars)` };
}

function rank(
    tier: Tier,
    body: Body,
    signals: Signals,
): {
    candidates: Candidate[];
    rejected: Candidate[];
    needVision: boolean;
    tokens: number;
} {
    const path = "/v1/responses";
    const needVision = hasImage(body.input) || hasImage(body.messages);
    const tokens = Math.ceil(promptText(body).length / 4);
    const candidates: Candidate[] = [];
    const rejected: Candidate[] = [];

    for (const id of POOLS[tier]) {
        const info = signals.models.get(id);
        const { penalty, note } = penaltyOf(signals.status.get(id));
        const price = priceOf(info);
        const candidate: Candidate = {
            id,
            price,
            penalty,
            score: price * penalty,
            note,
        };
        // A pool member the catalog no longer lists is dropped, not priced at zero.
        if (signals.models.size > 0 && !info) {
            rejected.push({ ...candidate, note: "not in catalog" });
            continue;
        }
        const endpoints = info?.supported_endpoints ?? [];
        if (endpoints.length > 0 && !endpoints.includes(path)) {
            rejected.push({ ...candidate, note: `no ${path}` });
            continue;
        }
        if (needVision && !(info?.input_modalities ?? []).includes("image")) {
            rejected.push({ ...candidate, note: "no image input" });
            continue;
        }
        if (info?.context_length && info.context_length < tokens * 1.5) {
            rejected.push({ ...candidate, note: "context too small" });
            continue;
        }
        candidates.push(candidate);
    }
    return { candidates, rejected, needVision, tokens };
}

function pick(tier: Tier, body: Body, signals: Signals): Decision {
    const { candidates, rejected, needVision, tokens } = rank(
        tier,
        body,
        signals,
    );

    if (candidates.length === 0) {
        const next = ESCALATION[tier][0];
        if (next) {
            const upgraded = pick(next, body, signals);
            return {
                ...upgraded,
                why: `${upgraded.why}; no usable ${tier} candidate${
                    needVision ? " with image input" : ""
                }`,
            };
        }
        throw new Error(
            "No compatible model in the router pools can serve this request",
        );
    }

    const healthy = candidates.filter((candidate) => candidate.penalty < 6);
    const usable = healthy.length > 0 ? healthy : candidates;
    const degraded = candidates
        .filter((candidate) => candidate.penalty >= 6)
        .map((candidate) => candidate.id);

    // Hardest tier: capability first (price is the capability proxy), health gates it.
    // Cheaper tiers: cheapest healthy model that clears the tier.
    const chosen =
        tier === "deep"
            ? [...usable].sort((a, b) => b.price - a.price)[0]
            : [...usable].sort((a, b) => a.score - b.score)[0];

    const pool = candidates
        .map(
            (candidate) =>
                `${candidate.id}${candidate.id === chosen.id ? "*" : ""}="${(candidate.score * 1e9).toFixed(3)}" (${candidate.note})`,
        )
        .join(" | ");

    const tierReason =
        tier === "deep"
            ? "strongest healthy model"
            : tier === "fast"
              ? "cheapest healthy model"
              : "cheapest healthy model that fits";
    const why = `${tierReason} at ${tier} tier; ${chosen.note}; ~${tokens} input tokens${
        rejected.length > 0
            ? `; skipped ${rejected.map((row) => `${row.id} (${row.note})`).join(", ")}`
            : ""
    }`;

    return { tier, model: chosen.id, why, pool, degraded };
}

/**
 * Callers reach a router as a model, and the agent gateway normalises incoming
 * requests to the Responses API before the agent sees them, so the router
 * answers in that shape. A chat-style body is converted rather than rejected.
 */
function asResponses(body: Body): Body {
    if (body.input !== undefined) return body;
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const input = messages
        .filter((message) => message && typeof message === "object")
        .map((message) => {
            const record = message as Record<string, unknown>;
            const content = record.content;
            if (typeof content !== "string") return record;
            return {
                ...record,
                content: [{ type: "input_text", text: content }],
            };
        });
    const { messages: _messages, max_tokens, ...rest } = body;
    return {
        ...rest,
        input:
            input.length > 0
                ? input
                : [
                      {
                          role: "user",
                          content: [{ type: "input_text", text: "" }],
                      },
                  ],
        ...(max_tokens !== undefined ? { max_output_tokens: max_tokens } : {}),
    } as Body;
}

async function forward(
    body: Body,
    model: string,
    pollinations: AgentContext["pollinations"],
): Promise<Response> {
    return pollinations("/v1/responses", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...body, model }),
    });
}

async function withTrace(
    response: Response,
    decision: Decision,
    escalated: string,
): Promise<Response> {
    // Log as well as set headers: a gateway in front of the agent may cache the
    // answer and drop per-response headers, but the log keeps the decision on record.
    console.log(
        JSON.stringify({
            route: decision.model,
            tier: decision.tier,
            escalated: escalated || undefined,
            why: decision.why,
        }),
    );

    const router: Record<string, unknown> = {
        model: decision.model,
        tier: decision.tier,
        why: decision.why,
    };
    if (decision.pool) router.pool = decision.pool.slice(0, 900);
    if (decision.degraded.length > 0) router.degraded = decision.degraded;
    if (escalated) router.escalated_to = escalated;

    const headers = new Headers(response.headers);
    headers.set("x-router-model", decision.model);
    headers.set("x-router-tier", decision.tier);
    headers.set("x-router-why", decision.why.slice(0, 900));
    if (decision.pool)
        headers.set("x-router-pool", decision.pool.slice(0, 900));
    if (decision.degraded.length > 0) {
        headers.set("x-router-degraded", decision.degraded.join(", "));
    }
    if (escalated) headers.set("x-router-escalated-to", escalated);

    // A JSON answer also carries the trace in the body, so a caller that never sees
    // response headers can still check the routing. Streamed answers are passed
    // through untouched.
    const type = response.headers.get("content-type") ?? "";
    if (!type.includes("application/json")) {
        return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers,
        });
    }
    // The trace changes the JSON body size; preserve the length only for streams.
    headers.delete("content-length");
    try {
        const payload = (await response.json()) as Record<string, unknown>;
        return Response.json(
            { ...payload, router },
            { status: response.status, headers },
        );
    } catch {
        return Response.json(
            {
                error: { message: "Router could not read the model answer" },
                router,
            },
            { status: response.status, headers },
        );
    }
}

export default async function agent({
    request,
    pollinations,
}: AgentContext): Promise<Response> {
    const body = asResponses((await request.json()) as Body);
    const signals = await loadSignals(pollinations);
    const start = classify(body);

    let decision = pick(start.tier, body, signals);
    let escalated = "";
    let last: Response | null = null;

    for (const tier of [start.tier, ...ESCALATION[start.tier]]) {
        if (tier !== start.tier) {
            decision = pick(tier, body, signals);
            escalated = decision.model;
        }
        let response: Response | null = null;
        try {
            response = await forward(body, decision.model, pollinations);
        } catch {
            response = null;
        }
        if (
            response &&
            response.status !== 429 &&
            response.status < 500 &&
            response.status !== 422
        ) {
            return await withTrace(response, decision, escalated);
        }
        last = response;
    }

    if (!last) {
        return Response.json(
            {
                error: {
                    message: "Router could not reach any model",
                    type: "router_error",
                },
            },
            { status: 502, headers: { "x-router-model": decision.model } },
        );
    }
    return await withTrace(last, decision, escalated);
}
