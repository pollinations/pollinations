type AgentContext = {
    request: Request;
    pollinations: (path: string, init?: RequestInit) => Promise<Response>;
};

type ResponsesRequest = Record<string, unknown> & {
    input: string | Array<unknown>;
    tools?: unknown[];
};

type ModelHealth = {
    status: "healthy" | "degraded" | "down" | "unknown";
    success_rate: number;
};

type ModelEntry = {
    id: string;
    capabilities?: string[];
    input_modalities?: string[];
    health?: ModelHealth;
};

// Free community models, most trusted first. The router only ever escalates
// past this list when every candidate is unhealthy or missing a capability
// the request needs.
const COMMUNITY_CANDIDATES = [
    "community/chigwell/llm7-fast",
    "community/chigwell/claude-haiku-4-5",
    "community/chigwell/gemini-3.7-flash",
    "community/chigwell/glm-5.3",
];

// Paid model used only when no community candidate clears the health bar.
const FALLBACK_MODEL = "openai/gpt-5.4-nano";

async function loadModels(
    pollinations: AgentContext["pollinations"],
): Promise<Map<string, ModelEntry>> {
    const response = await pollinations("/v1/models?status=all");
    if (!response.ok) {
        throw new Error(`Model catalog request failed (${response.status})`);
    }
    const body = (await response.json()) as { data: ModelEntry[] };
    return new Map(body.data.map((entry) => [entry.id, entry]));
}

function needsTools(body: ResponsesRequest): boolean {
    return Array.isArray(body.tools) && body.tools.length > 0;
}

function needsImageInput(input: unknown): boolean {
    if (!Array.isArray(input)) return false;
    return input.some((item) => {
        const content =
            item && typeof item === "object"
                ? (item as { content?: unknown }).content
                : undefined;
        if (!Array.isArray(content)) return false;
        return content.some((part) => {
            if (!part || typeof part !== "object") return false;
            return (
                (part as { type?: string }).type === "input_image" ||
                "image_url" in (part as Record<string, unknown>)
            );
        });
    });
}

type Selection = { model: string; reason: string };

function selectModel(
    body: ResponsesRequest,
    models: Map<string, ModelEntry>,
): Selection {
    const requireTools = needsTools(body);
    const requireImage = needsImageInput(body.input);
    const skipped: string[] = [];

    for (const id of COMMUNITY_CANDIDATES) {
        const entry = models.get(id);
        if (!entry) {
            skipped.push(`${id} (not in catalog)`);
            continue;
        }
        const health = entry.health;
        if (!health || health.status !== "healthy") {
            skipped.push(`${id} (${health?.status ?? "unknown"})`);
            continue;
        }
        if (requireTools && !entry.capabilities?.includes("tool_calling")) {
            skipped.push(`${id} (no tool_calling)`);
            continue;
        }
        if (requireImage && !entry.input_modalities?.includes("image")) {
            skipped.push(`${id} (no image input)`);
            continue;
        }
        const pct = Math.round(health.success_rate * 100);
        const suffix = skipped.length ? `; skipped ${skipped.join(", ")}` : "";
        return {
            model: id,
            reason: `healthy free community model (${pct}% success)${suffix}`,
        };
    }

    return {
        model: FALLBACK_MODEL,
        reason: `no healthy free community model available; skipped ${skipped.join(", ")}`,
    };
}

export default async function agent({
    request,
    pollinations,
}: AgentContext): Promise<Response> {
    const body = (await request.json()) as ResponsesRequest;
    const models = await loadModels(pollinations);
    const { model, reason } = selectModel(body, models);

    const upstream = await pollinations("/v1/responses", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...body, model }),
    });

    const headers = new Headers(upstream.headers);
    headers.set("x-pollinations-router-model", model);
    headers.set("x-pollinations-router-reason", reason.slice(0, 400));
    return new Response(upstream.body, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers,
    });
}
