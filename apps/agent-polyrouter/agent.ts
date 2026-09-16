// polyrouter - a code-only model router for Pollinations.
//
// For every request it picks the cheapest healthy model that fits the
// request's complexity, then forwards the conversation unchanged. No LLM
// call is spent on classification: tiers come from request features, and the
// winner comes from the live catalog (price, capabilities, health) and the
// live status feed (p95 latency, tokens/sec). The gateway already retries a
// model's declared fallbacks - this agent's job is choosing between models.
//
// The decision is exposed on response headers:
//   x-polyrouter-model  - the model that answered
//   x-polyrouter-tier   - fast | balanced | deep
//   x-polyrouter-why    - short human-readable trace (ascii, <= 200 chars)

type AgentContext = {
    request: Request;
    pollinations: (path: string, init?: RequestInit) => Promise<Response>;
};

type Tier = "fast" | "balanced" | "deep";

type CatalogModel = {
    id: string;
    category?: string;
    input_modalities?: string[];
    capabilities?: string[];
    pricing?: { promptTextTokens?: string; completionTextTokens?: string };
    health?: { status?: string; success_rate?: number };
    supported_endpoints?: string[];
};

type StatusRow = {
    model?: string;
    event_type?: string;
    latency_p95_ms?: number | null;
    tokens_per_second?: number | null;
};

export type RequestFeatures = {
    tier: Tier;
    needsTools: boolean;
    needsImage: boolean;
    summary: string;
};

export type PickResult = {
    id: string;
    tier: Tier;
    why: string;
};

const REASONING_HINTS =
    /\b(prove|derive|step[- ]by[- ]step|trade-?offs?|architecture|root cause|analy[sz]e|compare and contrast|debug|refactor|design a|optimi[sz]e|algorithm|time complexity|explain why)\b/gi;

/** Pull text and media flags out of a Responses API `input` value. */
function scanInput(input: unknown): {
    text: string;
    turns: number;
    hasImage: boolean;
} {
    if (typeof input === "string")
        return { text: input, turns: 1, hasImage: false };
    if (!Array.isArray(input)) return { text: "", turns: 0, hasImage: false };
    const parts: string[] = [];
    let hasImage = false;
    for (const item of input) {
        if (!item || typeof item !== "object") continue;
        const content = (item as { content?: unknown }).content;
        if (typeof content === "string") {
            parts.push(content);
            continue;
        }
        if (!Array.isArray(content)) continue;
        for (const part of content) {
            if (!part || typeof part !== "object") continue;
            const type = String((part as { type?: unknown }).type ?? "");
            if (
                type === "input_image" ||
                type === "image_url" ||
                type === "input_audio" ||
                type === "input_video"
            ) {
                hasImage = true;
            }
            const text = (part as { text?: unknown }).text;
            if (typeof text === "string") parts.push(text);
        }
    }
    return { text: parts.join("\n"), turns: input.length, hasImage };
}

/**
 * Classify the request in pure code - cheap and deterministic.
 * fast: short simple prompts. balanced: normal work, media, or tools.
 * deep: long/code-heavy/reasoning-flavoured requests.
 */
export function classify(body: Record<string, unknown>): RequestFeatures {
    const instructions =
        typeof body.instructions === "string" ? body.instructions : "";
    const { text, turns, hasImage } = scanInput(body.input);
    const needsTools = Array.isArray(body.tools) && body.tools.length > 0;

    const full = `${instructions}\n${text}`;
    let score = 0;
    const reasons: string[] = [];
    if (full.length > 1500) {
        score += 1;
        reasons.push("long prompt");
    }
    if (full.length > 6000) {
        score += 1;
        reasons.push("very long prompt");
    }
    if (/```|\bfunction\b|\bclass\b|=>\s*{|Traceback \(/.test(full)) {
        score += 2;
        reasons.push("code");
    }
    const hints = full.match(REASONING_HINTS)?.length ?? 0;
    if (hints > 0) {
        score += Math.min(2, hints);
        reasons.push("reasoning keywords");
    }
    if (turns >= 6) {
        score += 1;
        reasons.push("long conversation");
    }

    let tier: Tier = score >= 4 ? "deep" : score >= 2 ? "balanced" : "fast";
    if (hasImage && tier === "fast") tier = "balanced";
    if (needsTools && tier === "fast") tier = "balanced";

    const summary = [
        `score ${score}`,
        reasons.join(", ") || "simple prompt",
        hasImage ? "has image" : "",
        needsTools ? "has tools" : "",
    ]
        .filter(Boolean)
        .join("; ");
    return { tier, needsTools, needsImage: hasImage, summary };
}

const unitPrice = (model: CatalogModel): number => {
    const pricing = model.pricing ?? {};
    return (
        Number.parseFloat(pricing.promptTextTokens ?? "0") +
        Number.parseFloat(pricing.completionTextTokens ?? "0")
    );
};

const isUsable = (
    model: CatalogModel,
    features: RequestFeatures,
    tierRequirement: Tier | null,
): string | null => {
    if (model.category !== "text") return "not a text model";
    if (!model.supported_endpoints?.includes("/v1/responses"))
        return "no responses endpoint";
    const status = model.health?.status;
    if (status !== "healthy") return `health ${status ?? "unknown"}`;
    if (features.needsImage && !model.input_modalities?.includes("image"))
        return "no image input";
    if (features.needsTools && !model.capabilities?.includes("tool_calling"))
        return "no tool_calling";
    // Deep work goes to models that advertise explicit reasoning.
    if (
        tierRequirement === "deep" &&
        !model.capabilities?.includes("reasoning")
    )
        return "no reasoning";
    return null;
};

/**
 * Pick the winner. Candidates are the healthy text models that satisfy the
 * request's capability needs, sorted by unit price (ties: lower live p95
 * latency, then higher success rate). fast takes the cheapest candidate,
 * balanced the median-priced one, deep the priciest. If a tier has no
 * candidates the search escalates upward, and as a last resort any healthy
 * text model wins. Nothing here retries a model - that is the gateway's job.
 */
export function pickModel(
    catalog: CatalogModel[],
    statusRows: StatusRow[],
    features: RequestFeatures,
): PickResult {
    const latency = new Map<string, number>();
    for (const row of statusRows) {
        if (
            row.event_type === "generate.text" &&
            typeof row.model === "string" &&
            typeof row.latency_p95_ms === "number"
        ) {
            latency.set(row.model, row.latency_p95_ms);
        }
    }

    const skipped = new Map<string, number>();
    const note = (reason: string) =>
        skipped.set(reason, (skipped.get(reason) ?? 0) + 1);

    const candidatesFor = (tierRequirement: Tier | null): CatalogModel[] => {
        const usable: CatalogModel[] = [];
        for (const model of catalog) {
            const reason = isUsable(model, features, tierRequirement);
            if (reason) note(reason);
            else usable.push(model);
        }
        return usable.sort((a, b) => {
            const byPrice = unitPrice(a) - unitPrice(b);
            if (byPrice !== 0) return byPrice;
            const byLatency =
                (latency.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
                (latency.get(b.id) ?? Number.MAX_SAFE_INTEGER);
            if (byLatency !== 0) return byLatency;
            return (
                (b.health?.success_rate ?? 0) - (a.health?.success_rate ?? 0)
            );
        });
    };

    const order: (Tier | null)[] =
        features.tier === "fast"
            ? ["fast", "balanced", "deep", null]
            : features.tier === "balanced"
              ? ["balanced", "deep", null]
              : ["deep", null];

    for (const wanted of order) {
        const candidates = candidatesFor(wanted === "fast" ? null : wanted);
        if (candidates.length === 0) continue;
        const winner =
            wanted === "deep" || wanted === null
                ? candidates[candidates.length - 1]
                : wanted === "balanced"
                  ? candidates[Math.floor((candidates.length - 1) / 2)]
                  : candidates[0];
        const skipTrace = [...skipped.entries()]
            .map(([reason, count]) => `${count} ${reason}`)
            .join(", ");
        const escalated =
            wanted !== features.tier
                ? `escalated ${features.tier}->${wanted ?? "any"}; `
                : "";
        const why =
            `${escalated}${features.summary}; ` +
            `picked ${wanted === "deep" || wanted === null ? "strongest" : wanted === "balanced" ? "median-priced" : "cheapest"} healthy of ${candidates.length}` +
            (skipTrace ? `; skipped ${skipTrace}` : "");
        return { id: winner.id, tier: features.tier, why: why.slice(0, 200) };
    }
    throw new Error(
        "No healthy text model in the catalog can serve this request",
    );
}

export default async function agent({
    request,
    pollinations,
}: AgentContext): Promise<Response> {
    const body = (await request.json()) as Record<string, unknown>;
    const features = classify(body);

    const [catalogResponse, statusResponse] = await Promise.all([
        pollinations("/v1/models?status=all"),
        pollinations("/v1/models/status?minutes=30"),
    ]);
    if (!catalogResponse.ok) {
        throw new Error(
            `Model catalog request failed (${catalogResponse.status})`,
        );
    }
    const catalog =
        ((await catalogResponse.json()) as { data?: CatalogModel[] }).data ??
        [];
    const statusRows: StatusRow[] = statusResponse.ok
        ? (((await statusResponse.json()) as { data?: StatusRow[] }).data ?? [])
        : [];

    const choice = pickModel(catalog, statusRows, features);

    const upstream = await pollinations("/v1/responses", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...body, model: choice.id }),
    });

    const headers = new Headers(upstream.headers);
    headers.set("x-polyrouter-model", choice.id);
    headers.set("x-polyrouter-tier", choice.tier);
    headers.set("x-polyrouter-why", choice.why.replace(/[^\x20-\x7e]/g, "?"));

    // The gateway strips upstream headers, so for non-streaming JSON
    // responses the trace also goes into the body as `polyrouter_trace`.
    const isStream = body.stream === true;
    const contentType = upstream.headers.get("content-type") ?? "";
    if (!isStream && contentType.includes("application/json")) {
        const payload = (await upstream.json()) as Record<string, unknown>;
        payload.polyrouter_trace = {
            model: choice.id,
            tier: choice.tier,
            why: choice.why,
        };
        return new Response(JSON.stringify(payload), {
            status: upstream.status,
            headers,
        });
    }
    return new Response(upstream.body, {
        status: upstream.status,
        headers,
    });
}
