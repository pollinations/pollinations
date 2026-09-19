type AgentContext = {
    request: Request;
    pollinations: (path: string, init?: RequestInit) => Promise<Response>;
};

type ResponsesRequest = {
    input?: unknown;
    instructions?: string | null;
    tools?: unknown;
    [key: string]: unknown;
};

type CatalogModel = {
    id: string;
    category?: string;
    community?: boolean;
    input_modalities?: string[];
    output_modalities?: string[];
    supported_endpoints?: string[];
    capabilities?: string[];
    tools?: boolean;
    reasoning?: boolean;
    context_length?: number;
    pricing?: {
        promptTextTokens?: string;
        completionTextTokens?: string;
    };
};

type StatusRow = {
    model?: string;
    event_type?: string;
    is_rollup?: number;
    total_requests?: number;
    status_2xx?: number;
    errors_5xx?: number;
    latency_p95_ms?: number | null;
};

type Health = {
    broken: boolean;
    p95: number;
};

const MIN_TRAFFIC = 10;
const MAX_P95_MS = 60_000;
const TEXT_EVENT = "generate.text";
const LONG_PROMPT_CHARS = 4000;

const HARD_PROMPT =
    /\b(implement|design|prove|derive|optimi[sz]e|debug|architect|research|analy[sz]e|migrat|refactor|review|evaluate|compare)\b/i;

function walkText(value: unknown, out: string[]): void {
    if (value == null) return;
    if (typeof value === "string") {
        out.push(value);
        return;
    }
    if (Array.isArray(value)) {
        for (const item of value) walkText(item, out);
        return;
    }
    if (typeof value !== "object") return;
    const object = value as Record<string, unknown>;
    if (typeof object.text === "string") out.push(object.text);
    if (Array.isArray(object.content)) walkText(object.content, out);
    if (typeof object.instructions === "string") out.push(object.instructions);
}

function hasImage(value: unknown): boolean {
    if (value == null) return false;
    if (Array.isArray(value)) return value.some(hasImage);
    if (typeof value !== "object") return false;
    const object = value as Record<string, unknown>;
    const type = typeof object.type === "string" ? object.type : "";
    if (
        type === "input_image" ||
        type === "image" ||
        type === "image_url" ||
        typeof object.image_url === "string"
    ) {
        return true;
    }
    return Array.isArray(object.content) && hasImage(object.content);
}

type Features = {
    text: string;
    needsImage: boolean;
    needsTools: boolean;
    chars: number;
};

export function requirements(request: ResponsesRequest): Features {
    const parts: string[] = [];
    walkText(request.input, parts);
    if (typeof request.instructions === "string") {
        parts.push(request.instructions);
    }
    const text = parts.join("\n");
    return {
        text,
        needsImage: hasImage(request.input),
        needsTools: Array.isArray(request.tools) && request.tools.length > 0,
        chars: text.length,
    };
}

export function difficulty(request: ResponsesRequest): "fast" | "balanced" | "deep" {
    const f = requirements(request);
    const hasCode = f.text.includes("```");
    if (hasCode || HARD_PROMPT.test(f.text)) return "deep";
    if (f.needsImage || f.needsTools) return "balanced";
    if (f.chars > LONG_PROMPT_CHARS) return "balanced";
    return "fast";
}

export function aggregateHealth(rows: StatusRow[]): Map<string, Health> {
    const byModel = new Map<
        string,
        { total: number; ok: number; failed: number; p95: number }
    >();
    for (const row of rows) {
        if (!row.model || row.event_type !== TEXT_EVENT) continue;
        if (row.is_rollup !== 1) continue;
        const entry = byModel.get(row.model) ?? {
            total: 0,
            ok: 0,
            failed: 0,
            p95: 0,
        };
        entry.total += row.total_requests ?? 0;
        entry.ok += row.status_2xx ?? 0;
        entry.failed += row.errors_5xx ?? 0;
        if (typeof row.latency_p95_ms === "number") {
            entry.p95 = Math.max(entry.p95, row.latency_p95_ms);
        }
        byModel.set(row.model, entry);
    }
    const health = new Map<string, Health>();
    for (const [model, entry] of byModel) {
        health.set(model, {
            broken: entry.total >= MIN_TRAFFIC && entry.failed > entry.ok,
            p95: entry.p95,
        });
    }
    return health;
}

function costPerMillion(pricing?: CatalogModel["pricing"]): number {
    if (!pricing) return Number.NaN;
    const input = Number.parseFloat(pricing.promptTextTokens ?? "NaN");
    const output = Number.parseFloat(pricing.completionTextTokens ?? "NaN");
    if (!Number.isFinite(input) || !Number.isFinite(output)) return Number.NaN;
    return (input + output) * 1_000_000;
}

type Candidate = {
    id: string;
    cost: number;
    p95: number;
};

export function pickModel(
    request: ResponsesRequest,
    catalog: CatalogModel[],
    health: Map<string, Health>,
): { model: string; reason: string; tier: "fast" | "balanced" | "deep" } {
    const f = requirements(request);
    const band = difficulty(request);
    const requiredTokens = Math.ceil(f.chars / 4);

    const candidates: Candidate[] = [];
    for (const model of catalog) {
        if (model.category !== "text") continue;
        if (model.community) continue;
        if (!(model.output_modalities ?? []).includes("text")) continue;
        if (!(model.supported_endpoints ?? []).includes("/v1/responses")) {
            continue;
        }
        if (f.needsImage && !(model.input_modalities ?? []).includes("image")) {
            continue;
        }
        if (
            f.needsTools &&
            model.tools !== true &&
            !(model.capabilities ?? []).includes("tool_calling")
        ) {
            continue;
        }
        if (
            !f.needsTools &&
            band === "deep" &&
            model.reasoning !== true &&
            !(model.capabilities ?? []).includes("reasoning")
        ) {
            continue;
        }
        if (
            typeof model.context_length === "number" &&
            model.context_length > 0 &&
            model.context_length < requiredTokens
        ) {
            continue;
        }
        const cost = costPerMillion(model.pricing);
        if (!Number.isFinite(cost)) continue;
        const state = health.get(model.id);
        if (state?.broken) continue;
        const p95 = state?.p95 ?? 0;
        if (p95 > 0 && p95 > MAX_P95_MS) continue;
        candidates.push({ id: model.id, cost, p95 });
    }

    candidates.sort(
        (a, b) =>
            a.cost - b.cost ||
            (a.p95 || Number.POSITIVE_INFINITY) -
                (b.p95 || Number.POSITIVE_INFINITY),
    );

    if (candidates.length === 0) {
        throw new Error("No eligible healthy text model found");
    }

    const rank =
        band === "fast"
            ? 0
            : band === "balanced"
              ? Math.floor(candidates.length / 2)
              : candidates.length - 1;
    const chosen = candidates[rank];

    const constraints: string[] = [];
    if (f.needsImage) constraints.push("image input");
    if (f.needsTools) constraints.push("tool calling");
    if (band === "deep" && !f.needsImage && !f.needsTools) {
        constraints.push("reasoning");
    }

    const reason = [
        `tier ${band}`,
        constraints.length
            ? `needs ${constraints.join(", ")}`
            : "no constraints",
        `cost rank ${rank + 1}/${candidates.length}`,
        `cost ${fmtCost(chosen.cost)}`,
        chosen.p95 ? `p95 ${Math.round(chosen.p95)}ms` : "no fresh latency",
    ].join("; ");

    return { model: chosen.id, reason, tier: band };
}

function fmtCost(cost: number): string {
    if (cost === 0) return "0";
    return cost < 0.01 ? `${cost.toExponential(1)}` : `${cost.toFixed(2)}`;
}

export default async function agent({
    request,
    pollinations,
}: AgentContext): Promise<Response> {
    const body = (await request.clone().json()) as ResponsesRequest;

    const [catalogResponse, statusResponse] = await Promise.all([
        pollinations("/v1/models", { headers: { accept: "application/json" } }),
        pollinations("/models/status?minutes=30", {
            headers: { accept: "application/json" },
        }).catch(() => undefined),
    ]);

    if (!catalogResponse.ok) {
        throw new Error(`Model catalog failed (${catalogResponse.status})`);
    }
    const catalog = ((await catalogResponse.json()) as { data?: CatalogModel[] })
        .data ?? [];

    const statusRows: StatusRow[] =
        statusResponse && statusResponse.ok
            ? ((await statusResponse.json()) as { data?: StatusRow[] }).data ?? []
            : [];
    const health = aggregateHealth(statusRows);

    const { model, reason, tier } = pickModel(body, catalog, health);

    const downstream = await pollinations("/v1/responses", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...body, model }),
    });

    const response = new Response(downstream.body, downstream);
    response.headers.set("x-value-router-model", model);
    response.headers.set("x-value-router-tier", tier);
    response.headers.set("x-value-router-why", reason);
    return response;
}