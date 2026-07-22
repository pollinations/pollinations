import {
    COMMUNITY_ENDPOINT_PRICE_FIELDS,
    type CommunityEndpointImagePricing,
    type CommunityEndpointModality,
    type CommunityEndpointPriceField,
    type CommunityEndpointPriceKey,
    type CommunityEndpointPrices,
    type CommunityEndpointVisibility,
    communityEndpointPriceFieldsForModality,
    MIN_COMMUNITY_PRICE_PER_MILLION_TOKENS,
} from "@shared/community-endpoints.ts";
import type { Usage } from "@shared/registry/registry.ts";

type EndpointFormPrices = Record<CommunityEndpointPriceKey, string>;

// The two ways to register: point at a self-hosted OpenAI-compatible endpoint
// (external), or have the platform deploy and run a no-code prompt agent.
export type EndpointMode = "external" | "prompt-agent";

export type McpServerRow = { name: string; url: string };

export type PromptAgentConfig = {
    systemPrompt: string;
    baseModel: string;
    mcpServers: { name: string; url: string }[];
};

export type CommunityEndpoint = {
    id: string;
    modelId: string;
    name: string;
    description: string | null;
    modality: CommunityEndpointModality;
    imagePricing: CommunityEndpointImagePricing;
    baseUrl: string;
    upstreamModel: string;
    // No-code prompt-agent config, present only when the endpoint is a prompt
    // agent; null for self-hosted endpoints.
    promptAgent: PromptAgentConfig | null;
    // private → owner-only, shown only to the owner, no owner-set price;
    // public → globally listed + billed to callers.
    visibility: CommunityEndpointVisibility;
    disabled: boolean;
    disabledReason: string | null;
    disabledAt: string | null;
} & CommunityEndpointPrices;

export type EndpointFormState = {
    mode: EndpointMode;
    modality: CommunityEndpointModality;
    // Detected by the endpoint test for image models; "request" until tested.
    imagePricing: CommunityEndpointImagePricing;
    name: string;
    description: string;
    // private → owner-only, shown only to the owner, no owner-set price;
    // public → globally listed + billed to callers.
    // Public is selectable only by allowlisted owners; defaults private.
    visibility: CommunityEndpointVisibility;
    baseUrl: string;
    upstreamModel: string;
    bearerToken: string;
    // Prompt-agent fields; only read when mode === "prompt-agent".
    systemPrompt: string;
    baseModel: string;
    mcpServers: McpServerRow[];
} & EndpointFormPrices;

export type EndpointPayload = {
    modality: CommunityEndpointModality;
    imagePricing: CommunityEndpointImagePricing;
    name: string;
    description: string;
    // Exactly one of baseUrl / promptAgent is sent, per the mode.
    baseUrl?: string;
    promptAgent?: PromptAgentConfig;
    upstreamModel: string;
    visibility: CommunityEndpointVisibility;
} & CommunityEndpointPrices;

export type CommunityEndpointUsage = Record<string, unknown>;

export type CommunityEndpointTestResponse = {
    ok?: boolean;
    message?: string;
    usage?: CommunityEndpointUsage;
    billableUsage?: Usage;
    imagePricing?: CommunityEndpointImagePricing;
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
    modality: "text",
    imagePricing: "request",
    name: "",
    description: "",
    visibility: "private",
    baseUrl: "",
    upstreamModel: "",
    bearerToken: "",
    systemPrompt: "",
    baseModel: "",
    mcpServers: [],
    ...emptyPriceForm,
};

export const idleAction: ActionState = { status: "idle" };

export const VISIBILITY_LABELS: Record<CommunityEndpointVisibility, string> = {
    private: "Private",
    public: "Public",
};

const TOKENS_PER_MILLION = 1_000_000;

/** Token prices are entered per million; fixed media prices stay per unit. */
export function pricePerTokenToPerMillion(value: number): string {
    return String(Number((value * TOKENS_PER_MILLION).toPrecision(15)));
}

export function pricePerMillionToPerToken(value: string): number {
    const trimmed = value.trim();
    if (!trimmed) return 0;
    if (!isValidPriceInput(trimmed)) return Number.NaN;
    return Number(trimmed) / TOKENS_PER_MILLION;
}

export function storedPriceToFormValue(
    value: number,
    priceUnit: CommunityEndpointPriceField["priceUnit"] = "million",
): string {
    if (value <= 0) return "";
    return priceUnit === "million"
        ? pricePerTokenToPerMillion(value)
        : String(Number(value.toPrecision(15)));
}

export function formPriceToStoredPrice(
    value: string,
    priceUnit: CommunityEndpointPriceField["priceUnit"] = "million",
): number {
    const trimmed = value.trim();
    if (!trimmed) return 0;
    if (!isValidPriceInput(trimmed, priceUnit)) return Number.NaN;
    return priceUnit === "million"
        ? pricePerMillionToPerToken(trimmed)
        : Number(trimmed);
}

export function isValidPriceInput(
    value: string,
    priceUnit: CommunityEndpointPriceField["priceUnit"] = "million",
): boolean {
    const trimmed = value.trim();
    if (!trimmed) return true;
    if (trimmed.includes(",")) return false;
    const parsed = Number(trimmed);
    return (
        Number.isFinite(parsed) &&
        parsed >= 0 &&
        (priceUnit === "image" ||
            parsed === 0 ||
            parsed >= MIN_COMMUNITY_PRICE_PER_MILLION_TOKENS)
    );
}

export function endpointToForm(endpoint: CommunityEndpoint): EndpointFormState {
    const promptAgent = endpoint.promptAgent;
    const fields = new Map(
        communityEndpointPriceFieldsForModality(
            endpoint.modality,
            endpoint.imagePricing,
        ).map((field) => [field.key, field]),
    );
    return {
        mode: promptAgent ? "prompt-agent" : "external",
        modality: endpoint.modality,
        imagePricing: endpoint.imagePricing,
        name: endpoint.name,
        description: endpoint.description ?? "",
        visibility: endpoint.visibility,
        baseUrl: endpoint.baseUrl,
        upstreamModel: endpoint.upstreamModel,
        bearerToken: "",
        systemPrompt: promptAgent?.systemPrompt ?? "",
        baseModel: promptAgent?.baseModel ?? "",
        mcpServers: (promptAgent?.mcpServers ?? []).map((server) => ({
            name: server.name,
            url: server.url,
        })),
        ...(Object.fromEntries(
            COMMUNITY_ENDPOINT_PRICE_FIELDS.map((field) => {
                const modalityField = fields.get(field.key);
                return [
                    field.key,
                    modalityField
                        ? storedPriceToFormValue(
                              endpoint[field.key],
                              modalityField.priceUnit,
                          )
                        : "",
                ];
            }),
        ) as EndpointFormPrices),
    };
}

function formPricesToPayload(
    form: EndpointFormState,
    modality: CommunityEndpointModality,
    imagePricing: CommunityEndpointImagePricing,
): CommunityEndpointPrices {
    const allowed = new Map(
        communityEndpointPriceFieldsForModality(modality, imagePricing).map(
            (field) => [field.key, field],
        ),
    );
    return Object.fromEntries(
        COMMUNITY_ENDPOINT_PRICE_FIELDS.map((field) => {
            const modalityField = allowed.get(field.key);
            if (!modalityField) return [field.key, 0];
            if (!isValidPriceInput(form[field.key], modalityField.priceUnit)) {
                const unit =
                    modalityField.priceUnit === "image" ? "image" : "1M units";
                throw new Error(
                    `Prices must be 0 (free) or a positive amount per ${unit}, using a dot decimal`,
                );
            }
            return [
                field.key,
                formPriceToStoredPrice(
                    form[field.key],
                    modalityField.priceUnit,
                ),
            ];
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
    field: CommunityEndpointPriceField,
): boolean {
    return field.rawUsagePaths.some((path) =>
        hasObservedUsagePath(usage, path),
    );
}

export function observedUsageValue(
    usage: CommunityEndpointUsage | undefined,
    billableUsage: Usage | undefined,
    field: CommunityEndpointPriceField,
): number | null {
    return hasObservedPriceField(usage, field)
        ? (billableUsage?.[field.usageType] ?? 0)
        : null;
}

// Mirrors the backend McpServerSchema name pattern (lowercase alphanumeric with
// _ or -, max 40 chars) so client and server reject the same names.
export const MCP_SERVER_NAME_PATTERN = /^[a-z0-9][a-z0-9_-]{0,39}$/;

// Validates and trims the MCP server rows, dropping fully-empty rows. Mirrors
// the backend McpServerSchema so the API rejects the same inputs.
function mcpServersToPayload(
    rows: McpServerRow[],
): PromptAgentConfig["mcpServers"] {
    const servers: PromptAgentConfig["mcpServers"] = [];
    for (const row of rows) {
        const name = row.name.trim();
        const url = row.url.trim();
        if (!name && !url) continue;
        if (!MCP_SERVER_NAME_PATTERN.test(name)) {
            throw new Error(
                `MCP server name "${name}" must be lowercase alphanumeric with _ or - (max 40 chars)`,
            );
        }
        if (!url) {
            throw new Error(`MCP server "${name}" needs a URL`);
        }
        servers.push({ name, url });
    }
    return servers;
}

export function toPromptAgentConfig(
    form: EndpointFormState,
): PromptAgentConfig {
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
        mcpServers: mcpServersToPayload(form.mcpServers),
    };
}

export function toEndpointPayload(form: EndpointFormState): EndpointPayload {
    const modelName = form.name.trim();
    const modality = form.mode === "prompt-agent" ? "text" : form.modality;
    const imagePricing = modality === "image" ? form.imagePricing : "request";
    const shared = {
        modality,
        imagePricing,
        name: modelName,
        description: form.description.trim(),
        visibility: form.visibility,
        ...formPricesToPayload(form, modality, imagePricing),
    };
    if (form.mode === "prompt-agent") {
        return {
            ...shared,
            // The template runs the base model; there is no separate upstream id.
            upstreamModel: modelName,
            promptAgent: toPromptAgentConfig(form),
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
    if (key === "modality") {
        return {
            ...current,
            modality: value === "image" ? "image" : "text",
        };
    }
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
