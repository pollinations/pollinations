import {
    COMMUNITY_ENDPOINT_PRICE_FIELDS,
    type CommunityEndpointCapabilityFlags,
    type CommunityEndpointKind,
    type CommunityEndpointPriceKey,
    type CommunityEndpointPrices,
    type CommunityEndpointVisibility,
} from "@shared/community-endpoints.ts";
import { COMMUNITY_TOOL_NAME_PATTERN } from "@shared/registry/community-billing.ts";
import type { Usage } from "@shared/registry/registry.ts";

type EndpointFormPrices = Record<CommunityEndpointPriceKey, string>;

export type ToolFeeRow = { name: string; price: string };

// The three ways to register: point at a self-hosted OpenAI-compatible endpoint
// (external), upload worker code the platform deploys and hosts (source), or
// have the platform run a no-code prompt agent (prompt-agent).
export type EndpointMode = "external" | "source" | "prompt-agent";

// Built-in tools a prompt agent can be granted; mirrors PROMPT_AGENT_BUILTIN_TOOLS
// on the backend.
export const PROMPT_AGENT_BUILTIN_TOOLS = ["web_search", "image"] as const;
export type PromptAgentBuiltinTool =
    (typeof PROMPT_AGENT_BUILTIN_TOOLS)[number];

export type McpServerRow = { name: string; url: string; auth: string };

export type PromptAgentConfig = {
    systemPrompt: string;
    baseModel: string;
    tools: PromptAgentBuiltinTool[];
    mcpServers: { name: string; url: string; auth?: string }[];
};

export type CommunityEndpoint = {
    id: string;
    modelId: string;
    name: string;
    description: string | null;
    baseUrl: string;
    upstreamModel: string;
    // Worker source for platform-deployed endpoints; null when self-hosted or a
    // prompt agent (whose config is surfaced separately as `promptAgent`).
    source: string | null;
    // No-code prompt-agent config, present only when the endpoint is a prompt
    // agent; null for self-hosted / source-deployed endpoints.
    promptAgent: PromptAgentConfig | null;
    // private → owner-only, unlisted, free; app → owner+app users [staged];
    // public → listed + billed to callers.
    visibility: CommunityEndpointVisibility;
    toolPrices: Record<string, number>;
    disabled: boolean;
    disabledReason: string | null;
    disabledAt: string | null;
} & CommunityEndpointCapabilityFlags &
    CommunityEndpointPrices;

export type EndpointFormState = {
    mode: EndpointMode;
    name: string;
    description: string;
    // private → owner-only, unlisted, free; public → listed + billed to callers.
    // Only editable by allowlisted owners; defaults private for everyone else.
    visibility: CommunityEndpointVisibility;
    baseUrl: string;
    upstreamModel: string;
    bearerToken: string;
    // Worker source; only read when mode === "source".
    source: string;
    // Prompt-agent fields; only read when mode === "prompt-agent".
    systemPrompt: string;
    baseModel: string;
    builtinTools: PromptAgentBuiltinTool[];
    mcpServers: McpServerRow[];
    kind: CommunityEndpointKind;
    tools: boolean;
    search: boolean;
    reasoning: boolean;
    toolFees: ToolFeeRow[];
} & EndpointFormPrices;

export type EndpointPayload = {
    name: string;
    description: string;
    // Exactly one of baseUrl / source / promptAgent is sent, per the create mode.
    baseUrl?: string;
    source?: string;
    promptAgent?: PromptAgentConfig;
    upstreamModel: string;
    // Omitted on create (defaults private server-side); set by the publish flow.
    visibility?: CommunityEndpointVisibility;
    kind: CommunityEndpointKind;
    tools: boolean;
    search: boolean;
    reasoning: boolean;
    toolPrices: Record<string, number>;
} & CommunityEndpointPrices;

export type CommunityEndpointUsage = Record<string, unknown>;

export type CommunityEndpointTestResponse = {
    ok?: boolean;
    message?: string;
    usage?: CommunityEndpointUsage;
    billableUsage?: Usage;
};

export type ActionState = {
    status: "idle" | "loading" | "success" | "error";
    message?: string;
    usage?: CommunityEndpointUsage;
    billableUsage?: Usage;
};

const emptyPriceForm = Object.fromEntries(
    COMMUNITY_ENDPOINT_PRICE_FIELDS.map((field) => [field.key, ""]),
) as EndpointFormPrices;

export const emptyForm: EndpointFormState = {
    mode: "external",
    name: "",
    description: "",
    visibility: "private",
    baseUrl: "",
    upstreamModel: "",
    bearerToken: "",
    source: "",
    systemPrompt: "",
    baseModel: "",
    builtinTools: [],
    mcpServers: [],
    kind: "model",
    tools: false,
    search: false,
    reasoning: false,
    toolFees: [],
    ...emptyPriceForm,
};

export const idleAction: ActionState = { status: "idle" };

export const VISIBILITY_LABELS: Record<CommunityEndpointVisibility, string> = {
    private: "Private",
    app: "App users",
    public: "Public",
};

const TOKENS_PER_MILLION = 1_000_000;

/** Stored prices are per-token; the UI shows and accepts them per 1M tokens. */
export function pricePerTokenToPerMillion(value: number): string {
    return String(Number((value * TOKENS_PER_MILLION).toPrecision(15)));
}

export function pricePerMillionToPerToken(value: string): number {
    const trimmed = value.trim();
    if (!trimmed) return 0;
    if (!isValidPriceInput(trimmed)) return Number.NaN;
    return Number(trimmed) / TOKENS_PER_MILLION;
}

export function isValidPriceInput(value: string): boolean {
    const trimmed = value.trim();
    if (!trimmed) return true;
    if (trimmed.includes(",")) return false;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) && parsed >= 0;
}

export function endpointToForm(endpoint: CommunityEndpoint): EndpointFormState {
    const promptAgent = endpoint.promptAgent;
    // A non-prompt-agent endpoint with stored worker source is source-deployed;
    // otherwise it's a self-hosted external endpoint.
    const mode: EndpointMode = promptAgent
        ? "prompt-agent"
        : endpoint.source
          ? "source"
          : "external";
    return {
        mode,
        name: endpoint.name,
        description: endpoint.description ?? "",
        visibility: endpoint.visibility,
        baseUrl: endpoint.baseUrl,
        upstreamModel: endpoint.upstreamModel,
        bearerToken: "",
        source: endpoint.source ?? "",
        systemPrompt: promptAgent?.systemPrompt ?? "",
        baseModel: promptAgent?.baseModel ?? "",
        builtinTools: promptAgent?.tools ?? [],
        mcpServers: (promptAgent?.mcpServers ?? []).map((server) => ({
            name: server.name,
            url: server.url,
            auth: server.auth ?? "",
        })),
        kind: endpoint.kind,
        tools: endpoint.tools,
        search: endpoint.search,
        reasoning: endpoint.reasoning,
        toolFees: Object.entries(endpoint.toolPrices)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([name, price]) => ({ name, price: String(price) })),
        ...(Object.fromEntries(
            COMMUNITY_ENDPOINT_PRICE_FIELDS.map((field) => [
                field.key,
                endpoint[field.key] > 0
                    ? pricePerTokenToPerMillion(endpoint[field.key])
                    : "",
            ]),
        ) as EndpointFormPrices),
    };
}

function formPricesToPayload(form: EndpointFormState): CommunityEndpointPrices {
    return Object.fromEntries(
        COMMUNITY_ENDPOINT_PRICE_FIELDS.map((field) => {
            if (!isValidPriceInput(form[field.key])) {
                throw new Error("Prices must use dot decimals, e.g. 0.1");
            }
            return [field.key, pricePerMillionToPerToken(form[field.key])];
        }),
    ) as CommunityEndpointPrices;
}

function hasObservedUsagePath(
    usage: CommunityEndpointUsage | undefined,
    path: string,
): boolean {
    if (!usage) return false;
    let current: unknown = usage;
    for (const part of path.split(".")) {
        if (!current || typeof current !== "object" || !(part in current)) {
            return false;
        }
        current = (current as Record<string, unknown>)[part];
    }
    return typeof current === "number" && Number.isFinite(current);
}

export function hasObservedPriceField(
    usage: CommunityEndpointUsage | undefined,
    field: (typeof COMMUNITY_ENDPOINT_PRICE_FIELDS)[number],
): boolean {
    return field.rawUsagePaths.some((path) =>
        hasObservedUsagePath(usage, path),
    );
}

export function observedUsageValue(
    usage: CommunityEndpointUsage | undefined,
    billableUsage: Usage | undefined,
    field: (typeof COMMUNITY_ENDPOINT_PRICE_FIELDS)[number],
): number | null {
    return hasObservedPriceField(usage, field)
        ? (billableUsage?.[field.usageType] ?? 0)
        : null;
}

// Whole-map semantics: the API replaces toolPrices with what we send, so an
// empty map (all rows removed) clears saved fees.
function toolFeesToPayload(rows: ToolFeeRow[]): Record<string, number> {
    const toolPrices: Record<string, number> = {};
    for (const row of rows) {
        const name = row.name.trim();
        const price = Number(row.price.trim());
        if (!COMMUNITY_TOOL_NAME_PATTERN.test(name)) {
            throw new Error(
                `Tool name "${name}" must be lowercase alphanumeric with _ or - (max 40 chars)`,
            );
        }
        if (!Number.isFinite(price) || price <= 0) {
            throw new Error(
                `Tool fee for "${name}" must be a positive Pollen amount per call`,
            );
        }
        toolPrices[name] = price;
    }
    return toolPrices;
}

// Mirrors the backend McpServerSchema name pattern (lowercase alphanumeric with
// _ or -, max 40 chars) so client and server reject the same names.
export const MCP_SERVER_NAME_PATTERN = /^[a-z0-9][a-z0-9_-]{0,39}$/;

// Validates and trims the MCP server rows, dropping fully-empty rows and the
// optional auth. Mirrors the backend McpServerSchema so the API rejects the
// same inputs.
function mcpServersToPayload(
    rows: McpServerRow[],
): PromptAgentConfig["mcpServers"] {
    const servers: PromptAgentConfig["mcpServers"] = [];
    for (const row of rows) {
        const name = row.name.trim();
        const url = row.url.trim();
        const auth = row.auth.trim();
        if (!name && !url && !auth) continue;
        if (!MCP_SERVER_NAME_PATTERN.test(name)) {
            throw new Error(
                `MCP server name "${name}" must be lowercase alphanumeric with _ or - (max 40 chars)`,
            );
        }
        if (!url) {
            throw new Error(`MCP server "${name}" needs a URL`);
        }
        servers.push(auth ? { name, url, auth } : { name, url });
    }
    return servers;
}

function toPromptAgentConfig(form: EndpointFormState): PromptAgentConfig {
    const systemPrompt = form.systemPrompt.trim();
    if (!systemPrompt) {
        throw new Error("System prompt is required for a prompt agent");
    }
    const baseModel = form.baseModel.trim();
    if (!baseModel) {
        throw new Error("Base model is required for a prompt agent");
    }
    return {
        systemPrompt,
        baseModel,
        tools: form.builtinTools,
        mcpServers: mcpServersToPayload(form.mcpServers),
    };
}

export function toEndpointPayload(form: EndpointFormState): EndpointPayload {
    const modelName = form.name.trim();
    const shared = {
        name: modelName,
        description: form.description.trim(),
        visibility: form.visibility,
        kind: form.kind,
        tools: form.tools,
        search: form.search,
        reasoning: form.reasoning,
        toolPrices: toolFeesToPayload(form.toolFees),
        ...formPricesToPayload(form),
    };
    if (form.mode === "prompt-agent") {
        return {
            ...shared,
            // The template runs the base model; there is no separate upstream id.
            upstreamModel: modelName,
            promptAgent: toPromptAgentConfig(form),
        };
    }
    if (form.mode === "source") {
        const source = form.source.trim();
        if (!source) {
            throw new Error("Worker source is required for a source deploy");
        }
        return {
            ...shared,
            // The deployed worker is the model; there is no separate upstream id.
            upstreamModel: modelName,
            source,
        };
    }
    return {
        ...shared,
        baseUrl: form.baseUrl.trim(),
        upstreamModel: form.upstreamModel.trim() || modelName,
    };
}

/** Keep the public model id in sync with the provider model until edited. */
export function nextFormState(
    current: EndpointFormState,
    key: keyof EndpointFormState,
    value: string,
): EndpointFormState {
    const next = { ...current, [key]: value };
    if (
        key === "upstreamModel" &&
        (!current.name.trim() || current.name === current.upstreamModel)
    ) {
        next.name = value;
    }
    return next;
}

export function providerModelHelper(
    modelOptions: string[],
    modelListState: ActionState,
): string {
    if (modelListState.status === "loading") return "Fetching /models…";
    if (modelListState.status === "error") {
        return modelListState.message || "Model list fetch failed";
    }
    if (modelListState.status === "success") {
        return `${modelOptions.length} models loaded. Pick one or type any model id.`;
    }
    return "Sent as the OpenAI model value. Fetch models or type any model id.";
}

export async function readError(response: Response): Promise<string> {
    const fallback = response.statusText || "Request failed";
    try {
        const text = await response.text();
        if (!text) return fallback;
        try {
            const body = JSON.parse(text) as {
                message?: unknown;
                error?: unknown;
            };
            if (typeof body.message === "string") return body.message;
            if (
                body.error &&
                typeof body.error === "object" &&
                "message" in body.error
            ) {
                const detail = validationDetail(body.error);
                return typeof body.error.message === "string"
                    ? [body.error.message, detail].filter(Boolean).join(": ")
                    : detail || fallback;
            }
            if (typeof body.error === "string") return body.error;
        } catch {
            return text;
        }
        return text;
    } catch {
        return fallback;
    }
}

function validationDetail(error: object): string | null {
    if (
        !("details" in error) ||
        !error.details ||
        typeof error.details !== "object"
    ) {
        return null;
    }
    const { fieldErrors } = error.details as {
        fieldErrors?: Record<string, string[]>;
    };
    const [field, messages] = Object.entries(fieldErrors ?? {})[0] ?? [];
    return field && messages?.length
        ? `${field}: ${messages.join(", ")}`
        : null;
}
