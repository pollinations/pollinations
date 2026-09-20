type AgentContext = {
    request: Request;
    pollinations: (path: string, init?: RequestInit) => Promise<Response>;
};

type ResponsesRequest = Record<string, unknown> & {
    input: string | Array<unknown>;
    instructions?: string | null;
};

type CatalogModel = {
    id: string;
    category?: string;
    output_modalities?: string[];
    supported_endpoints?: string[];
    pricing?: {
        promptTextTokens?: string;
        completionTextTokens?: string;
    };
    health?: {
        status?: string;
        success_rate?: number;
    };
};

type StatusRow = {
    model?: string;
    event_type?: string;
    latency_p50_ms?: number | null;
};

const FALLBACK_MODEL = "openai";
// health.success_rate is a 0-100 percentage, not a fraction.
const MIN_SUCCESS_RATE = 90;
const LIGHT_SCORE = 2;
// A heavy prompt tops out around 3 (length cap) + 1.5 (code) + 1.5 (task
// markers) — 3.5 keeps genuine design/prove work out of STANDARD.
const DEEP_SCORE = 3.5;

const COMPLEX_TASK =
    /(implement|design|prove|derive|optimi[sz]e|debug|architect|research|analy[sz]e|migrat|refactor|реализуй|спроектируй|докажи|оптимизируй|проанализируй|исслед)/gi;

const extractText = (value: unknown): string => {
    if (typeof value === "string") return value;
    if (!Array.isArray(value)) return "";
    return value
        .map((part) => {
            if (typeof part === "string") return part;
            if (part && typeof part === "object") {
                const p = part as { text?: unknown; content?: unknown };
                if (typeof p.text === "string") return p.text;
                if (typeof p.content === "string") return p.content;
            }
            return "";
        })
        .join(" ");
};

// A cheap heuristic instead of a classifier call: routing itself costs
// nothing and adds no latency beyond one catalog fetch.
const scoreInput = (text: string): number => {
    let score = Math.min(text.length / 400, 3);
    if (/```/.test(text)) score += 1.5;
    // count every task marker, not just the first one
    const matches = text.match(COMPLEX_TASK) ?? [];
    score += Math.min(matches.length * 1.5, 3);
    score += Math.min((text.match(/\?/g) ?? []).length * 0.3, 1.5);
    return score;
};

const chooseBand = (score: number): "LIGHT" | "STANDARD" | "DEEP" =>
    score < LIGHT_SCORE ? "LIGHT" : score < DEEP_SCORE ? "STANDARD" : "DEEP";

const perMillion = (pricing?: CatalogModel["pricing"]): number => {
    if (!pricing) return Number.NaN;
    const input = Number.parseFloat(pricing.promptTextTokens ?? "NaN");
    const output = Number.parseFloat(pricing.completionTextTokens ?? "NaN");
    if (!Number.isFinite(input) || !Number.isFinite(output)) return Number.NaN;
    return (input + output) * 1_000_000;
};

const fmtLatency = (p50: number): string =>
    Number.isFinite(p50) ? `${Math.round(p50)}ms` : "no fresh traffic";

type Candidate = CatalogModel & {
    costPerMillion: number;
    p50: number;
};

async function pickModel(
    request: ResponsesRequest,
    pollinations: AgentContext["pollinations"],
): Promise<{ model: string; reason: string }> {
    const [catalogRes, statusRes] = await Promise.all([
        pollinations("/v1/models"),
        pollinations("/models/status?minutes=30").catch(() => undefined),
    ]);
    if (!catalogRes.ok) {
        throw new Error(`Model catalog failed (${catalogRes.status})`);
    }
    const catalog = (await catalogRes.json()) as { data?: CatalogModel[] };

    const statusRows: StatusRow[] =
        statusRes && statusRes.ok
            ? (((await statusRes.json()) as { data?: StatusRow[] }).data ?? [])
            : [];
    const p50ByModel = new Map<string, number>();
    for (const row of statusRows) {
        if (
            row.model &&
            row.event_type === "generate.text" &&
            typeof row.latency_p50_ms === "number" &&
            row.latency_p50_ms > 0
        ) {
            const known = p50ByModel.get(row.model);
            if (known === undefined || row.latency_p50_ms < known) {
                p50ByModel.set(row.model, row.latency_p50_ms);
            }
        }
    }

    // Text models from the live catalog, healthy, with honest pricing, that
    // actually support the stateless Responses API the agent forwards to.
    // Router agents are excluded so this model never routes to itself.
    const candidates: Candidate[] = [];
    for (const m of catalog.data ?? []) {
        if (m.category !== "text") continue;
        if (!(m.output_modalities ?? []).includes("text")) continue;
        if (!(m.supported_endpoints ?? []).includes("/v1/responses")) continue;
        if (m.id.includes("router")) continue;
        const health = m.health ?? {};
        if (health.status && health.status !== "healthy") continue;
        if (
            typeof health.success_rate === "number" &&
            health.success_rate < MIN_SUCCESS_RATE
        )
            continue;
        const costPerMillion = perMillion(m.pricing);
        if (!Number.isFinite(costPerMillion)) continue;
        candidates.push({
            ...m,
            costPerMillion,
            p50: p50ByModel.get(m.id) ?? Number.POSITIVE_INFINITY,
        });
    }
    if (candidates.length === 0) {
        return {
            model: FALLBACK_MODEL,
            reason: `no healthy priced text models in the catalog; fell back to ${FALLBACK_MODEL}`,
        };
    }

    candidates.sort(
        (a, b) => a.costPerMillion - b.costPerMillion || a.p50 - b.p50,
    );
    const tertile = Math.max(1, Math.floor(candidates.length / 3));
    const bands = {
        LIGHT: candidates.slice(0, tertile),
        STANDARD: candidates.slice(
            tertile,
            Math.max(tertile + 1, candidates.length - tertile),
        ),
        DEEP: candidates.slice(
            Math.max(tertile + 1, candidates.length - tertile),
        ),
    };

    const text = extractText(request.input);
    const score = scoreInput(text);
    const band = chooseBand(score);
    const byLatency = (a: Candidate, b: Candidate) =>
        a.p50 - b.p50 || a.costPerMillion - b.costPerMillion;

    let pick: Candidate;
    if (band === "DEEP") {
        pick = [...(bands.DEEP.length ? bands.DEEP : candidates)].sort(
            byLatency,
        )[0];
    } else if (band === "STANDARD") {
        // Middle of the band by price so STANDARD never lands on the same
        // model as LIGHT when prices cluster at the band boundary.
        const band2 = bands.STANDARD.length ? bands.STANDARD : candidates;
        pick = band2[Math.floor(band2.length / 2)];
    } else {
        pick = [...bands.LIGHT].sort(byLatency)[0] ?? candidates[0];
    }

    const success = pick.health?.success_rate ?? 0;
    const reason = [
        `${band} tier (input score ${score.toFixed(1)})`,
        `picked ${pick.id} at $${pick.costPerMillion.toFixed(2)}/1M tok`,
        `health ${success.toFixed(1)}%`,
        `fresh p50 ${fmtLatency(pick.p50)}`,
    ].join(" · ");

    return { model: pick.id, reason };
}

export default async function agent({
    request,
    pollinations,
}: AgentContext): Promise<Response> {
    const body = (await request.json()) as ResponsesRequest;
    const { model, reason } = await pickModel(body, pollinations);

    const forward = await pollinations("/v1/responses", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...body, model }),
    });

    // Surface the routing decision without touching the model's answer:
    // headers (best-effort, may be stripped by the gateway) plus a short
    // top-level trace on non-streaming JSON responses.
    const headers = new Headers(forward.headers);
    headers.set("X-Router-Model", model);
    headers.set("X-Router-Reason", reason);

    const contentType = forward.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
        try {
            const payload = (await forward.json()) as Record<string, unknown>;
            payload.router_trace = { model, reason };
            return new Response(JSON.stringify(payload), {
                status: forward.status,
                statusText: forward.statusText,
                headers,
            });
        } catch {
            // fall through to raw forwarding
        }
    }
    return new Response(forward.body, {
        status: forward.status,
        statusText: forward.statusText,
        headers,
    });
}
