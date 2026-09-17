type AgentContext = {
    request: Request;
    pollinations: (path: string, init?: RequestInit) => Promise<Response>;
    model: (id: string) => unknown;
    respond: (opts: unknown) => Promise<Response>;
    mcp: { tools: (s: string) => Promise<unknown>; listTools: (s: string) => Promise<unknown> };
};

// Router that picks cheapest healthy model per request, with explicit trace header.
// Strategy: cost + health + difficulty cascade.
// - Fetches live catalog and 30m status (latency, 5xx) via pollinations() helper.
// - Classifies prompt difficulty via cheap heuristic + optional LLM classifier.
// - Prefers free/community models when healthy, escalates on degradation.
// - Emits X-Pollinations-Router header with chosen model + reason.

const FALLBACK_MODELS = ["openai-fast", "openai", "mistral"];
const CLASSIFIER_MODEL = "openai/gpt-5.4-nano";

interface ModelInfo {
    id: string;
    pricing?: { prompt?: number; completion?: number; total?: number };
    cost?: number;
    capabilities?: string[];
}

interface StatusRow {
    model: string;
    is_rollup: number;
    requests: number;
    errors_5xx: number;
    p95_latency_ms: number;
    fallback_rescues: number;
}

function difficultyHeuristic(input: string): { level: "easy" | "medium" | "hard"; reason: string } {
    const lower = input.toLowerCase();
    const len = input.length;
    const hasCode = /```|function|class |import |def |const |let |async|error|stack/.test(lower);
    const hasReasoning = /prove|theorem|architecture|design system|research|analyze|compare|tradeoff|explain why|step by step/.test(lower);
    const hasImage = lower.includes("image") || lower.includes("photo") || lower.includes("picture");
    const tokens = input.split(/\s+/).length;

    if (len < 80 && tokens < 20 && !hasCode && !hasReasoning) {
        return { level: "easy", reason: "short prompt, no code/reasoning keywords" };
    }
    if (hasReasoning || tokens > 300 || len > 1500 || (hasCode && tokens > 80)) {
        return { level: "hard", reason: hasReasoning ? "reasoning/architecture keywords" : hasCode ? "large code context" : "long prompt" };
    }
    if (hasCode || hasImage || tokens > 80) {
        return { level: "medium", reason: hasCode ? "code present" : hasImage ? "multimodal hint" : "medium length" };
    }
    return { level: "medium", reason: "default medium" };
}

function healthScore(row: StatusRow | undefined): number {
    if (!row || row.requests < 5) return 1.0;
    const errRate = row.errors_5xx / Math.max(1, row.requests);
    const latencyPenalty = row.p95_latency_ms > 8000 ? 0.5 : row.p95_latency_ms > 4000 ? 0.8 : 1.0;
    return Math.max(0, (1 - errRate * 5)) * latencyPenalty;
}

async function fetchJson(pollinations: AgentContext["pollinations"], path: string): Promise<unknown> {
    const r = await pollinations(path);
    if (!r.ok) throw new Error(`GET ${path} failed ${r.status}`);
    return r.json();
}

export default async function agent({ request, pollinations }: AgentContext): Promise<Response> {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const inputRaw = (body.input as string) ?? (body.messages ? JSON.stringify(body.messages) : "");
    const input = typeof inputRaw === "string" ? inputRaw : JSON.stringify(inputRaw);
    const incomingModel = (body.model as string) ?? "router";

    // Fetch catalog + status in parallel
    const [modelsRes, statusRes] = await Promise.all([
        fetchJson(pollinations, "/v1/models").catch(() => null),
        fetchJson(pollinations, "/models/status?minutes=30").catch(() => null),
    ]);

    // Parse models -> sorted by cost
    let catalog: { id: string; cost: number }[] = [];
    if (modelsRes && typeof modelsRes === "object") {
        const data = (modelsRes as { data?: ModelInfo[] }).data ?? (modelsRes as ModelInfo[]);
        const list = Array.isArray(data) ? data : [];
        catalog = list
            .filter((m) => m.id && !m.id.includes("/")) // filter base models
            .map((m) => {
                const c = (m as { pricing?: { prompt?: number } }).pricing?.prompt ?? (m as { cost?: number }).cost ?? 0;
                return { id: m.id, cost: typeof c === "number" ? c : 0 };
            })
            .sort((a, b) => a.cost - b.cost);
    }
    if (catalog.length === 0) catalog = FALLBACK_MODELS.map((id) => ({ id, cost: 0 }));

    // Build health map from status
    const healthMap = new Map<string, StatusRow>();
    if (statusRes && Array.isArray(statusRes)) {
        for (const row of statusRes as StatusRow[]) {
            if (row.is_rollup === 1 && row.model) healthMap.set(row.model, row);
        }
    } else if (statusRes && typeof statusRes === "object" && Array.isArray((statusRes as { data?: unknown[] }).data)) {
        for (const row of (statusRes as { data: StatusRow[] }).data) if (row.is_rollup === 1) healthMap.set(row.model, row);
    }

    // Classify difficulty (heuristic + optional LLM classifier for tie-break)
    const heuristic = difficultyHeuristic(input);
    let finalLevel = heuristic.level;
    let reason = `heuristic:${heuristic.reason}`;

    // Optional: call tiny classifier model for ambiguous medium/hard (only if input > 200 chars to avoid cost)
    if (input.length > 200 && heuristic.level === "medium") {
        try {
            const cls = await pollinations("/v1/responses", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    model: CLASSIFIER_MODEL,
                    instructions: "Classify as FAST, BALANCED, or DEEP. FAST=simple, BALANCED=normal coding/analysis, DEEP=hard reasoning/architecture. Reply one word.",
                    input,
                    max_output_tokens: 8,
                    store: false,
                }),
            });
            if (cls.ok) {
                const j = (await cls.json()) as { output?: { content?: { type: string; text: string }[] }[] };
                const text = j.output?.flatMap((o) => o.content ?? []).find((c) => c.type === "output_text")?.text?.trim().toUpperCase();
                if (text === "DEEP") { finalLevel = "hard"; reason += "+classifier:DEEP"; }
                else if (text === "FAST") { finalLevel = "easy"; reason += "+classifier:FAST"; }
            }
        } catch {
            // ignore classifier failure
        }
    }

    // Pick model by level + health: cheapest healthy for level
    const healthy = catalog.filter((m) => healthScore(healthMap.get(m.id)) > 0.6);
    const pool = healthy.length >= 3 ? healthy : catalog;

    let chosen: string;
    let chooseReason: string;
    if (finalLevel === "easy") {
        chosen = pool[0]?.id ?? catalog[0].id;
        chooseReason = `easy→cheapest healthy (${reason}, health=${healthScore(healthMap.get(chosen)).toFixed(2)})`;
    } else if (finalLevel === "medium") {
        // balanced: median cost healthy
        const mid = Math.floor(pool.length / 2);
        chosen = pool[mid]?.id ?? pool[0].id;
        chooseReason = `medium→balanced cost (#${mid}/${pool.length}, ${reason})`;
    } else {
        // hard: most capable among healthy - pick highest cost healthy (proxy for capability) but still health>0.7
        const capable = [...pool].reverse().find((m) => healthScore(healthMap.get(m.id)) > 0.7) ?? pool[pool.length - 1];
        chosen = capable.id;
        chooseReason = `hard→capable (${reason}, health=${healthScore(healthMap.get(chosen)).toFixed(2)})`;
    }

    // Forward request to chosen model via internal pollinations call (preserve body, just swap model)
    const forwarded = { ...body, model: chosen };
    const upstream = await pollinations("/v1/responses", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(forwarded),
    });

    // Clone response, add routing trace header
    const headers = new Headers(upstream.headers);
    headers.set("x-pollinations-router", JSON.stringify({ chosen, level: finalLevel, reason: chooseReason }));
    headers.set("x-pollinations-router-model", chosen);
    // Also inject short trace into response body if JSON
    const contentType = upstream.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
        const json = await upstream.json().catch(() => null);
        if (json && typeof json === "object") {
            (json as Record<string, unknown>)._router = { chosen, level: finalLevel, reason: chooseReason, heuristic: heuristic.level };
            return new Response(JSON.stringify(json), { status: upstream.status, headers });
        }
    }
    // SSE or other: pass through with header
    return new Response(upstream.body, { status: upstream.status, headers });
}
