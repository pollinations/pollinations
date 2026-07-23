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

// A community model can point at an external endpoint or at an independently
// managed agent.
export type EndpointMode = "external" | "agent";

export type McpServerRow = { name: string; url: string };

export type ManagedAgent = {
    id: string;
    name: string;
    systemPrompt: string;
    baseModel: string;
    mcpServers: { name: string; url: string }[];
    createdAt: string;
    updatedAt: string;
};

export type AgentFormState = Pick<
    ManagedAgent,
    "name" | "systemPrompt" | "baseModel" | "mcpServers"
>;

export type AgentPayload = AgentFormState;

export type CommunityEndpoint = {
    id: string;
    modelId: string;
    name: string;
    description: string | null;
    modality: CommunityEndpointModality;
    imagePricing: CommunityEndpointImagePricing;
    baseUrl: string;
    upstreamModel: string;
    agentId: string | null;
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
    agentId: string;
    upstreamModel: string;
    bearerToken: string;
} & EndpointFormPrices;

export type EndpointPayload = {
    modality: CommunityEndpointModality;
    imagePricing: CommunityEndpointImagePricing;
    name: string;
    description: string;
    // Exactly one of baseUrl / agentId is sent, per the mode.
    baseUrl?: string;
    agentId?: string;
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
    agentId: "",
    upstreamModel: "",
    bearerToken: "",
    ...emptyPriceForm,
};

export const emptyAgentForm: AgentFormState = {
    name: "",
    systemPrompt: "",
    baseModel: "",
    mcpServers: [],
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
    const fields = new Map(
        communityEndpointPriceFieldsForModality(
            endpoint.modality,
            endpoint.imagePricing,
        ).map((field) => [field.key, field]),
    );
    return {
        mode: endpoint.agentId ? "agent" : "external",
        modality: endpoint.modality,
        imagePricing: endpoint.imagePricing,
        name: endpoint.name,
        description: endpoint.description ?? "",
        visibility: endpoint.visibility,
        baseUrl: endpoint.baseUrl,
        agentId: endpoint.agentId ?? "",
        upstreamModel: endpoint.upstreamModel,
        bearerToken: "",
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

export function isValidMcpRow(row: McpServerRow): boolean {
    const name = row.name.trim();
    const url = row.url.trim();
    if (!name && !url) return true;
    try {
        new URL(url);
    } catch {
        return false;
    }
    return MCP_SERVER_NAME_PATTERN.test(name);
}

// Validates and trims the MCP server rows, dropping fully-empty rows. Mirrors
// the backend McpServerSchema so the API rejects the same inputs.
function mcpServersToPayload(rows: McpServerRow[]): ManagedAgent["mcpServers"] {
    const servers: ManagedAgent["mcpServers"] = [];
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

export function toAgentPayload(form: AgentFormState): AgentPayload {
    const name = form.name.trim();
    if (!name) throw new Error("Agent name is required");
    const systemPrompt = form.systemPrompt.trim();
    if (!systemPrompt) {
        throw new Error("System prompt is required for a prompt agent");
    }
    const baseModel = form.baseModel.trim();
    if (!baseModel) {
        throw new Error("Base model is required for a prompt agent");
    }
    return {
        name,
        systemPrompt,
        baseModel,
        mcpServers: mcpServersToPayload(form.mcpServers),
    };
}

export function toEndpointPayload(form: EndpointFormState): EndpointPayload {
    const modelName = form.name.trim();
    const modality = form.mode === "agent" ? "text" : form.modality;
    const imagePricing = modality === "image" ? form.imagePricing : "request";
    const shared = {
        modality,
        imagePricing,
        name: modelName,
        description: form.description.trim(),
        visibility: form.visibility,
        ...formPricesToPayload(form, modality, imagePricing),
    };
    if (form.mode === "agent") {
        if (!form.agentId) throw new Error("Choose an agent");
        return {
            ...shared,
            agentId: form.agentId,
            upstreamModel: modelName,
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
