type AgentContext = {
    request: Request;
    pollinations: (path: string, init?: RequestInit) => Promise<Response>;
};

type RequestBody = Record<string, unknown> & {
    input?: unknown;
    instructions?: string | null;
    max_output_tokens?: number;
    response_format?: unknown;
    text?: unknown;
};

type CatalogModel = {
    id: string;
    category?: string;
    community?: boolean;
    input_modalities?: string[];
    supported_endpoints?: string[];
    supported_parameters?: string[];
    capabilities?: string[];
    context_length?: number;
    reasoning?: boolean;
    pricing?: Record<string, string | number | null>;
    health?: { status?: string };
};

type StatusRow = {
    model?: string;
    event_type?: string;
    is_rollup?: number;
    total_requests?: number;
    errors_5xx?: number;
    latency_p95_ms?: number | null;
};

type RouteProfile = "vision" | "format" | "deep" | "speed" | "economy";

type RequestSignals = {
    profile: RouteProfile;
    reason: string;
    requiresImage: boolean;
    requiresStructuredOutput: boolean;
    requiresReasoning: boolean;
    estimatedInputTokens: number;
    expectedOutputTokens: number;
};

export type RouteDecision = {
    model: string;
    profile: RouteProfile;
    reason: string;
};

function finiteNumber(value: unknown, fallback: number): number {
    const parsed = typeof value === "number" ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function collectText(value: unknown, parts: string[], depth = 0): void {
    if (depth > 8) return;
    if (typeof value === "string") {
        parts.push(value);
        return;
    }
    if (Array.isArray(value)) {
        for (const item of value) collectText(item, parts, depth + 1);
        return;
    }
    if (!value || typeof value !== "object") return;
    for (const item of Object.values(value as Record<string, unknown>)) {
        collectText(item, parts, depth + 1);
    }
}

function collectMessageText(value: unknown, parts: string[], depth = 0): void {
    if (depth > 8) return;
    if (typeof value === "string") {
        parts.push(value);
        return;
    }
    if (Array.isArray(value)) {
        for (const item of value) collectMessageText(item, parts, depth + 1);
        return;
    }
    if (!value || typeof value !== "object") return;
    const item = value as Record<string, unknown>;
    if (typeof item.text === "string") parts.push(item.text);
    else if (item.content !== undefined)
        collectMessageText(item.content, parts, depth + 1);
}

function textInput(value: unknown): string {
    const parts: string[] = [];

    if (Array.isArray(value)) {
        for (const item of value) {
            if (!item || typeof item !== "object") {
                collectText(item, parts);
                continue;
            }
            const message = item as Record<string, unknown>;
            const contentParts: string[] = [];
            collectMessageText(message.content, contentParts);
            if (contentParts.length === 0) continue;
            const role =
                typeof message.role === "string" ? `${message.role}: ` : "";
            parts.push(`${role}${contentParts.join("\n")}`);
        }
    } else {
        collectText(value, parts);
    }

    return parts.join("\n\n");
}

function containsImage(value: unknown, depth = 0): boolean {
    if (depth > 8 || !value) return false;
    if (Array.isArray(value)) {
        return value.some((item) => containsImage(item, depth + 1));
    }
    if (typeof value !== "object") return false;

    const entry = value as Record<string, unknown>;
    const type = typeof entry.type === "string" ? entry.type.toLowerCase() : "";
    if (type.includes("image") || "image_url" in entry) return true;
    return Object.values(entry).some((item) => containsImage(item, depth + 1));
}

function requestsStructuredOutput(body: RequestBody, text: string): boolean {
    if (body.response_format !== undefined) return true;
    const textConfig = JSON.stringify(body.text ?? "").toLowerCase();
    if (
        textConfig.includes("json_schema") ||
        textConfig.includes("json_object")
    ) {
        return true;
    }
    return /\b(valid json|json schema|strict json|xml only|csv only)\b/i.test(
        text,
    );
}

export function analyzeRequest(body: RequestBody): RequestSignals {
    const textParts: string[] = [];
    collectText(body.input, textParts);
    const text = textParts.join("\n");
    const serializedInput = JSON.stringify(body.input ?? "");
    const estimatedInputTokens = Math.max(
        1,
        Math.ceil(serializedInput.length / 4),
    );
    const expectedOutputTokens = Math.min(
        4096,
        Math.max(16, finiteNumber(body.max_output_tokens, 512)),
    );
    const requiresImage = containsImage(body.input);
    const requiresStructuredOutput = requestsStructuredOutput(body, text);
    const requiresReasoning =
        estimatedInputTokens > 6000 ||
        /\b(formal proof|security audit|threat model|distributed system|race condition|architecture trade-?offs?|derive|multi-step reasoning)\b/i.test(
            text,
        );
    const speedRequested =
        expectedOutputTokens <= 128 ||
        /\b(urgent|quick(?:ly)?|fast(?:est)?|low latency|one (?:word|sentence)|brief answer)\b/i.test(
            text,
        );

    if (requiresImage) {
        return {
            profile: "vision",
            reason: "image input requires a vision-capable model",
            requiresImage,
            requiresStructuredOutput,
            requiresReasoning,
            estimatedInputTokens,
            expectedOutputTokens,
        };
    }
    if (requiresStructuredOutput) {
        return {
            profile: "format",
            reason: "the request requires structured-output support",
            requiresImage,
            requiresStructuredOutput,
            requiresReasoning,
            estimatedInputTokens,
            expectedOutputTokens,
        };
    }
    if (requiresReasoning) {
        return {
            profile: "deep",
            reason: "a complex or long request requires reasoning capability",
            requiresImage,
            requiresStructuredOutput,
            requiresReasoning,
            estimatedInputTokens,
            expectedOutputTokens,
        };
    }
    if (speedRequested) {
        return {
            profile: "speed",
            reason: "a short or urgent request prioritizes live p95 latency",
            requiresImage,
            requiresStructuredOutput,
            requiresReasoning,
            estimatedInputTokens,
            expectedOutputTokens,
        };
    }
    return {
        profile: "economy",
        reason: "an ordinary text request minimizes estimated cost after health checks",
        requiresImage,
        requiresStructuredOutput,
        requiresReasoning,
        estimatedInputTokens,
        expectedOutputTokens,
    };
}

function statusByModel(rows: StatusRow[]): Map<string, StatusRow> {
    return new Map(
        rows
            .filter(
                (row) =>
                    row.is_rollup === 1 &&
                    row.event_type === "generate.text" &&
                    typeof row.model === "string",
            )
            .map((row) => [row.model as string, row]),
    );
}

function requestCost(model: CatalogModel, signals: RequestSignals): number {
    const prompt = finiteNumber(
        model.pricing?.promptTextTokens,
        Number.POSITIVE_INFINITY,
    );
    const completion = finiteNumber(
        model.pricing?.completionTextTokens,
        Number.POSITIVE_INFINITY,
    );
    return (
        prompt * signals.estimatedInputTokens +
        completion * signals.expectedOutputTokens
    );
}

function supportsRequest(
    model: CatalogModel,
    signals: RequestSignals,
): boolean {
    if (!model.id || model.category !== "text" || model.community === true)
        return false;
    if (!model.supported_endpoints?.includes("/v1/responses")) return false;
    if (model.health?.status === "down") return false;
    if (signals.requiresImage && !model.input_modalities?.includes("image"))
        return false;
    if (
        signals.requiresStructuredOutput &&
        !model.supported_parameters?.some((parameter) =>
            ["response_format", "structured_outputs"].includes(parameter),
        )
    ) {
        return false;
    }
    if (
        signals.requiresReasoning &&
        model.reasoning !== true &&
        !model.capabilities?.includes("reasoning")
    ) {
        return false;
    }
    const neededContext =
        signals.estimatedInputTokens + signals.expectedOutputTokens;
    return finiteNumber(model.context_length, 0) >= neededContext;
}

export function chooseModel(
    models: CatalogModel[],
    statuses: StatusRow[],
    signals: RequestSignals,
): RouteDecision {
    const live = statusByModel(statuses);
    const candidates = models.filter((model) => {
        if (!supportsRequest(model, signals)) return false;
        const status = live.get(model.id);
        const requests = finiteNumber(status?.total_requests, 0);
        const failures = finiteNumber(status?.errors_5xx, 0);
        return requests < 10 || failures / requests <= 0.1;
    });

    if (candidates.length === 0) {
        throw new Error(
            `No healthy model satisfies the ${signals.profile} contract`,
        );
    }

    const score = (model: CatalogModel): number => {
        const status = live.get(model.id);
        const observedRequests = finiteNumber(status?.total_requests, 0);
        // Do not let a tiny sample win the speed route: endpoint-level
        // incompatibilities often hide behind a handful of fast successes.
        const p95 =
            observedRequests >= 100
                ? finiteNumber(status?.latency_p95_ms, 30_000)
                : 30_000;
        const requests = Math.max(1, observedRequests);
        const failureRate = finiteNumber(status?.errors_5xx, 0) / requests;
        const cost = requestCost(model, signals);
        const healthPenalty = failureRate * 100_000;

        if (signals.profile === "speed") {
            return p95 + cost * 10_000_000 + healthPenalty;
        }
        if (signals.profile === "deep") {
            const overBudgetPenalty = cost > 0.02 ? 1_000_000 : 0;
            const unitPrice = finiteNumber(
                model.pricing?.completionTextTokens,
                0,
            );
            const qualityProxy =
                Math.log2(Math.max(1, finiteNumber(model.context_length, 1))) +
                Math.log10(Math.max(1, unitPrice * 1_000_000_000));
            return (
                overBudgetPenalty -
                qualityProxy * 1000 +
                p95 / 100 +
                healthPenalty
            );
        }
        return cost * 1_000_000_000 + p95 / 10 + healthPenalty;
    };

    const selected = [...candidates].sort((left, right) => {
        const difference = score(left) - score(right);
        return difference === 0 ? left.id.localeCompare(right.id) : difference;
    })[0];

    return {
        model: selected.id,
        profile: signals.profile,
        reason: signals.reason,
    };
}

async function loadCatalog(
    pollinations: AgentContext["pollinations"],
): Promise<CatalogModel[]> {
    const response = await pollinations("/v1/models");
    if (!response.ok)
        throw new Error(`Model catalog failed (${response.status})`);
    const body = (await response.json()) as { data?: CatalogModel[] };
    if (!Array.isArray(body.data))
        throw new Error("Model catalog returned no data");
    return body.data;
}

async function loadStatus(
    pollinations: AgentContext["pollinations"],
): Promise<StatusRow[]> {
    try {
        const response = await pollinations("/models/status?minutes=30");
        if (!response.ok) return [];
        const body = (await response.json()) as { data?: StatusRow[] };
        return Array.isArray(body.data) ? body.data : [];
    } catch {
        return [];
    }
}

export default async function agent({
    request,
    pollinations,
}: AgentContext): Promise<Response> {
    const body = (await request.json()) as RequestBody;
    const signals = analyzeRequest(body);
    const [models, statuses] = await Promise.all([
        loadCatalog(pollinations),
        loadStatus(pollinations),
    ]);
    const decision = chooseModel(models, statuses, signals);
    const trace = `[route: ${decision.model} | ${decision.profile}: ${decision.reason}]`;
    const transparencyInstruction = `Begin your answer with exactly this routing trace on its own line: ${trace}`;
    const instructions = [body.instructions, transparencyInstruction]
        .filter(
            (value): value is string =>
                typeof value === "string" && value.length > 0,
        )
        .join("\n\n");
    // Some Responses providers only accept the string form of `input` even
    // though their catalog entry advertises the endpoint. Flatten text-only
    // histories while preserving multimodal arrays for vision-capable routes.
    const input = signals.requiresImage ? body.input : textInput(body.input);

    return pollinations("/v1/responses", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
            ...body,
            model: decision.model,
            input,
            instructions,
        }),
    });
}
