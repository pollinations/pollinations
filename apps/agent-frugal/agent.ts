// frugal — a cost-first, health-aware model router for Pollinations.
//
// For every request it estimates the cost of *this* request (measured input
// length plus a tier-based output estimate), ranks the live catalog by that
// cost, penalises models that are currently failing, and forwards the request
// to the cheapest healthy model that can actually serve it. Classification is
// pure code: no classifier model call, no tokens spent on routing.
//
// The decision is logged and, for non-streaming JSON answers, attached to the
// response body as `frugal_trace` (the gateway in front of an agent caches
// answers and drops per-response headers, so a body trace is the reliable
// channel). Best-effort `X-Frugal-*` headers are set as well.

type AgentContext = {
    request: Request;
    pollinations: (path: string, init?: RequestInit) => Promise<Response>;
};

type Tier = "FAST" | "BALANCED" | "DEEP";

type ResponsesBody = {
    model?: string;
    instructions?: string | null;
    input?: string | Array<unknown>;
    messages?: Array<unknown>;
    prompt?: string;
    tools?: Array<unknown>;
    max_output_tokens?: number;
    max_tokens?: number;
    previous_response_id?: string;
    stream?: boolean;
    [key: string]: unknown;
};

type CatalogModel = {
    id: string;
    category: string;
    community?: boolean;
    input_modalities?: string[];
    supported_endpoints?: string[];
    capabilities?: string[];
    pricing?: {
        promptTextTokens?: string;
        completionTextTokens?: string;
    };
};

type HealthRow = {
    model: string;
    is_rollup: number;
    event_type: string;
    total_requests: number;
    errors_4xx: number;
    errors_5xx: number;
    status_2xx: number;
    served: number;
    fallback_rescues: number;
    retried_503s: number;
    latency_p95_ms?: number | null;
    tokens_per_second?: number | null;
};

const MIN_SAMPLE = 10;
const DEFAULT_MODEL = "openai/gpt-5.4-nano";

/* ---------------------------------------------------------------------------
 * Input normalisation — callers reach a router as a model, so the same agent
 * can be called through the Responses, chat-completions or text endpoints.
 * The gateway usually normalises these, but it is not guaranteed for code
 * agents, so accept all three shapes and convert to a Responses body rather
 * than rejecting a chat- or text-style call.
 *
 * The conversation is then flattened to a string. Not every model accepts an
 * array `input`: openai/gpt-oss-20b — the cheapest model, and therefore the one
 * frugal reaches for most often — rejects it with a 422, while every model we
 * tested accepts a plain string. System turns move into `instructions`; the
 * structured array survives only when it carries media a string cannot.
 * ------------------------------------------------------------------------ */

export function asResponses(body: ResponsesBody): ResponsesBody {
    const { messages, prompt, max_tokens, ...rest } = body;
    const maxOutput =
        body.max_output_tokens !== undefined
            ? {}
            : max_tokens !== undefined
              ? { max_output_tokens: max_tokens }
              : {};

    // Conversation sources, in priority order: a Responses body already has
    // `input`; otherwise accept chat `messages` or a bare `prompt`.
    let source: unknown = body.input;
    if (source === undefined && Array.isArray(messages)) source = messages;
    if (source === undefined && typeof prompt === "string") source = prompt;

    const instructions: string[] = [];
    if (typeof rest.instructions === "string" && rest.instructions) {
        instructions.push(rest.instructions);
    }

    let input: unknown = source;
    if (typeof source !== "string" && Array.isArray(source)) {
        const turns: string[] = [];
        const kept: unknown[] = [];
        let hasMedia = false;
        for (const item of source) {
            if (!item || typeof item !== "object") continue;
            const record = item as Record<string, unknown>;
            if (record.role === "system" || record.role === "developer") {
                const text = flatText(record.content ?? record);
                if (text) instructions.push(text);
                continue;
            }
            if (countImages(record.content) > 0) hasMedia = true;
            kept.push(record);
            const text = flatText(record.content ?? record);
            if (text) {
                const role =
                    typeof record.role === "string" && record.role
                        ? record.role
                        : "user";
                turns.push(`${role}: ${text}`);
            }
        }
        if (hasMedia) input = kept;
        else if (turns.length === 0) input = "";
        else if (turns.length === 1) input = turns[0].replace(/^user: /, "");
        else input = turns.join("\n");
    }

    const out: ResponsesBody = { ...rest, input: input ?? "", ...maxOutput };
    if (instructions.length) out.instructions = instructions.join("\n\n");
    return out;
}

/* ---------------------------------------------------------------------------
 * Classification — pure code, zero LLM spend on routing.
 * ------------------------------------------------------------------------ */

export function tierForBody(body: ResponsesBody): {
    tier: Tier;
    is_long: boolean;
} {
    const input = body.input;
    const text = typeof input === "string" ? input : flatText(input);
    const instructions =
        typeof body.instructions === "string" ? body.instructions : "";
    const len = text.length + instructions.length;

    const isContinued =
        typeof body.previous_response_id === "string" ||
        (typeof text === "string" &&
            (text.match(/^(?:user|assistant): /gm)?.length ?? 0) >= 2);
    const greedy = (body.max_output_tokens ?? 0) > 1600;
    const images = countImages(body.input);
    const hasTools = Array.isArray(body.tools) && body.tools.length > 0;
    const asksReasoning =
        /\b(prove|proof|derive|architecture|synthesi[sz]e|algorithm|rigorous|formal|explain why|step-by-step|design a)\b/i.test(
            text,
        );
    const asksLongForm =
        /\b(essay|long-form|comprehensive report|detailed analysis)\b/i.test(
            text,
        );
    const asksCode =
        /```|\bfunction\b|\bclass\b|\bimport\b|\bconst\b|\bdef\b/.test(text);
    const isLong = len > 1800;

    let tier: Tier;
    if (isLong || greedy || asksReasoning || asksLongForm) tier = "DEEP";
    else if (isContinued || images > 0 || hasTools || asksCode || len > 400)
        tier = "BALANCED";
    else tier = "FAST";
    return { tier, is_long: isLong };
}

export function flatText(value: unknown): string {
    if (typeof value === "string") return value;
    if (Array.isArray(value))
        return value
            .map((item) => flatText(item))
            .filter(Boolean)
            .join(" ");
    if (value && typeof value === "object") {
        const obj = value as Record<string, unknown>;
        if (typeof obj.text === "string") return obj.text;
        if (typeof obj.input_text === "string") return obj.input_text;
        if (obj.content !== undefined) return flatText(obj.content);
    }
    return "";
}

export function countImages(value: unknown): number {
    if (Array.isArray(value))
        return value.reduce((n, item) => n + countImages(item), 0);
    if (value && typeof value === "object") {
        const obj = value as Record<string, unknown>;
        if (
            obj.type === "input_image" ||
            obj.image_url !== undefined ||
            obj.input_image !== undefined
        )
            return 1;
        if (obj.content !== undefined) return countImages(obj.content);
    }
    return 0;
}

/* ---------------------------------------------------------------------------
 * Cost — per-request estimate, not a fixed unit price.
 * ------------------------------------------------------------------------ */

export function inputTokensFor(body: ResponsesBody): number {
    const input = body.input;
    const chars =
        typeof input === "string" ? input.length : flatText(input).length;
    return Math.max(1, Math.round(chars / 4));
}

export function outputTokensFor(tier: Tier): number {
    return tier === "FAST" ? 128 : tier === "BALANCED" ? 512 : 2048;
}

function priceOf(model: CatalogModel): { prompt: number; completion: number } {
    return {
        prompt: Number(model.pricing?.promptTextTokens ?? 0),
        completion: Number(model.pricing?.completionTextTokens ?? 0),
    };
}

export function estimatedCost(
    model: CatalogModel,
    inputTokens: number,
    outputTokens: number,
): number {
    const { prompt, completion } = priceOf(model);
    return inputTokens * prompt + outputTokens * completion;
}

/* ---------------------------------------------------------------------------
 * Health — a continuous penalty (sick = more expensive, rarely picked),
 * plus a hard safety ban only for genuinely dead models.
 * ------------------------------------------------------------------------ */

export function healthPenalty(row: HealthRow | undefined): number {
    if (!row || row.total_requests < MIN_SAMPLE) return 1.15;
    const errorRate = row.errors_5xx / row.total_requests;
    if (errorRate >= 0.1) return 5;
    if (errorRate >= 0.05) return 2.5;
    if (errorRate >= 0.02) return 1.35;
    return 1;
}

function isDead(row: HealthRow | undefined): boolean {
    if (!row || row.total_requests < MIN_SAMPLE) return false;
    const errorRate = row.errors_5xx / row.total_requests;
    if (errorRate >= 0.15) return true;
    if (row.status_2xx === 0 && row.total_requests > 0) return true;
    return false;
}

/* ---------------------------------------------------------------------------
 * Model selection.
 * ------------------------------------------------------------------------ */

export type Pick = { model: string; tier: Tier; reason: string };

export async function select(
    body: ResponsesBody,
    pollinations: AgentContext["pollinations"],
): Promise<Pick> {
    const { tier: wantTier } = tierForBody(body);
    const inputTokens = inputTokensFor(body);
    const [catalog, health] = await Promise.all([
        getCatalog(pollinations),
        getHealth(pollinations),
    ]);

    const needTools = Array.isArray(body.tools) && body.tools.length > 0;
    const hasImages = countImages(body.input) > 0;

    // Candidates that can actually serve this request.
    const eligible = catalog.filter((m) => {
        if (isDead(health.get(m.id))) return false;
        if (!(m.supported_endpoints ?? []).includes("/v1/responses"))
            return false;
        if (m.id.toLowerCase().includes("frugal")) return false; // never route to yourself
        if (m.community) return false; // foundation models only — agents are not router targets
        const { prompt, completion } = priceOf(m);
        if (prompt + completion <= 0) return false; // unpriced entries distort cost ranking
        if (!(m.input_modalities ?? ["text"]).includes("text")) return false;
        if (hasImages && !(m.input_modalities ?? []).includes("image"))
            return false;
        if (needTools && !(m.capabilities ?? []).includes("tool_calling"))
            return false;
        return true;
    });

    if (eligible.length === 0) {
        return {
            model: DEFAULT_MODEL,
            tier: wantTier,
            reason: `${wantTier}: no eligible healthy model — fell back to ${DEFAULT_MODEL}`,
        };
    }

    // Rank by true per-request cost (input measured, output estimated by tier)
    // and adjust for health: a sick model must be remarkably cheaper to win.
    const ranked = eligible
        .map((m) => {
            const out = outputTokensFor(wantTier);
            const base = estimatedCost(m, inputTokens, out);
            const adj = base * healthPenalty(health.get(m.id));
            return { m, base, adj };
        })
        .sort((a, b) => a.adj - b.adj);

    const n = ranked.length;
    const third = Math.max(1, Math.ceil(n / 3));

    let slice: typeof ranked;
    if (wantTier === "FAST") slice = ranked.slice(0, third);
    else if (wantTier === "BALANCED") slice = ranked.slice(third, third * 2);
    else slice = ranked.slice(third * 2);

    // An empty middle/slow slice means the catalog skews tiny: widen outward.
    if (slice.length === 0) {
        if (wantTier === "BALANCED") slice = ranked.slice(0, third * 2);
        else if (wantTier === "DEEP") slice = ranked.slice(third);
    }

    const picked = slice[0];
    if (!picked) {
        return {
            model: DEFAULT_MODEL,
            tier: wantTier,
            reason: `${wantTier}: empty candidate slice — fell back to ${DEFAULT_MODEL}`,
        };
    }
    const penalty = healthPenalty(health.get(picked.m.id));
    return {
        model: picked.m.id,
        tier: wantTier,
        reason: `${wantTier}: estimated ${inputTokens}+${outputTokensFor(wantTier)} tokens ≈ ${picked.base.toFixed(10)} pollen ×${penalty.toFixed(2)} health (${picked.adj.toFixed(10)}) — cheapest of ${slice.length}`,
    };
}

async function getCatalog(
    pollinations: AgentContext["pollinations"],
): Promise<CatalogModel[]> {
    try {
        const r = await pollinations("/v1/models");
        if (!r.ok) return [];
        const j = (await r.json()) as { data?: CatalogModel[] };
        return (j.data ?? []).filter((m) => m.category === "text");
    } catch {
        // A missing catalog degrades to the default model, never an error.
        return [];
    }
}

async function getHealth(
    pollinations: AgentContext["pollinations"],
): Promise<Map<string, HealthRow>> {
    const map = new Map<string, HealthRow>();
    try {
        const r = await pollinations("/models/status?minutes=30");
        if (!r.ok) return map;
        const j = (await r.json()) as { data?: HealthRow[] };
        for (const row of j.data ?? []) {
            if (
                row.is_rollup === 1 &&
                row.event_type === "generate.text" &&
                !map.has(row.model)
            ) {
                map.set(row.model, row);
            }
        }
    } catch {
        // The status feed is advisory: price-only routing beats failing.
    }
    return map;
}

/* ---------------------------------------------------------------------------
 * Entry point.
 * ------------------------------------------------------------------------ */

export default async function agent({
    request,
    pollinations,
}: AgentContext): Promise<Response> {
    let raw: ResponsesBody = {};
    try {
        raw = (await request.json()) as ResponsesBody;
    } catch {
        raw = {};
    }
    const body = asResponses(raw);
    const picked = await select(body, pollinations);

    const trace = {
        model: picked.model,
        tier: picked.tier,
        reason: picked.reason,
    };
    console.log(JSON.stringify({ router: "frugal", ...trace }));

    const upstream = await pollinations("/v1/responses", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...body, model: picked.model }),
    });

    const headers = new Headers(upstream.headers);
    headers.set("X-Frugal-Tier", picked.tier);
    headers.set("X-Frugal-Model", picked.model);
    headers.set("X-Frugal-Reason", picked.reason);

    // Best-effort headers aside, the trace travels inside a JSON body because
    // the gateway caches answers and strips per-response headers.
    const type = upstream.headers.get("content-type") ?? "";
    if (body.stream !== true && type.includes("application/json")) {
        try {
            const payload = (await upstream.json()) as Record<string, unknown>;
            headers.delete("content-length");
            return new Response(
                JSON.stringify({ ...payload, frugal_trace: trace }),
                {
                    status: upstream.status,
                    statusText: upstream.statusText,
                    headers,
                },
            );
        } catch {
            // Non-JSON body despite the content type: pass it through.
        }
    }
    return new Response(upstream.body, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers,
    });
}
