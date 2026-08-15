import {
    COMMUNITY_ENDPOINT_PRICE_FIELDS,
    type CommunityEndpointImagePricing,
    type CommunityEndpointModality,
    type CommunityEndpointPriceField,
    type CommunityEndpointPriceKey,
    type CommunityEndpointPrices,
    type CommunityEndpointVisibility,
    communityEndpointPriceFieldsForModality,
    MAX_COMMUNITY_PRICE_PER_IMAGE,
    MAX_COMMUNITY_PRICE_PER_MILLION_TOKENS,
    MIN_COMMUNITY_PRICE_PER_MILLION_TOKENS,
    normalizeCommunityEndpointBaseUrl,
    normalizeCommunityEndpointInputModalities,
} from "@shared/community-endpoints.ts";
import type { ModelInputModality, Usage } from "@shared/registry/registry.ts";

type EndpointFormPrices = Record<CommunityEndpointPriceKey, string>;

export type McpHeaderRow = {
    id: string;
    name: string;
    value: string;
    saved: boolean;
};

export type McpServerRow = {
    id: string;
    name: string;
    url: string;
    headers: McpHeaderRow[];
};

export type ManagedAgent = {
    id: string;
    systemPrompt: string;
    baseModel: string;
    pollinationsTools: boolean;
    mcpServers: {
        name: string;
        url: string;
        headers: Record<string, null>;
    }[];
    createdAt: string;
    updatedAt: string;
};

type AgentFields = Pick<
    ManagedAgent,
    "systemPrompt" | "baseModel" | "pollinationsTools"
>;

export type AgentFormState = AgentFields & { mcpServers: McpServerRow[] };

export type AgentPayload = AgentFields & {
    mcpServers: {
        name: string;
        url: string;
        headers: Record<string, string | null>;
    }[];
};

export type CommunityProviderProfile = {
    name: string | null;
    url: string | null;
};

export type CommunityEndpoint = {
    id: string;
    modelId: string;
    name: string;
    // Always populated by the API, which falls back for un-backfilled rows.
    title: string;
    description: string | null;
    modality: CommunityEndpointModality;
    imagePricing: CommunityEndpointImagePricing;
    inputModalities: ModelInputModality[];
    baseUrl: string;
    upstreamModel: string;
    agentId: string | null;
    // private → owner-only, shown only to the owner, no owner-set price;
    // public → globally listed + billed to callers.
    visibility: CommunityEndpointVisibility;
    perUserRpm: number | null;
    // Public community models tried, in order, when this model's upstream fails.
    fallbackModelIds: string[];
    disabled: boolean;
    disabledReason: string | null;
    disabledAt: string | null;
} & CommunityEndpointPrices;

export type FallbackModelOption = {
    modelId: string;
    modality: CommunityEndpointModality;
};

/**
 * Public community models from the model catalog, in dialog option form. The
 * catalog already excludes private and deactivated models, and the server
 * re-validates modality and pricing on write.
 */
export function publicCommunityFallbackOptions(
    models: {
        name: string;
        type: string;
        community?: boolean;
        agent?: boolean;
    }[],
): FallbackModelOption[] {
    return models
        .filter(
            (model) =>
                model.community &&
                !model.agent &&
                (model.type === "text" || model.type === "image"),
        )
        .map((model) => ({
            modelId: model.name,
            modality: model.type === "image" ? "image" : "text",
        }));
}

export type ModelListingFormState = {
    inputModalities: ModelInputModality[];
    name: string;
    title: string;
    description: string;
    // private → owner-only, shown only to the owner, no owner-set price;
    // public → globally listed + billed to callers.
    // Public is selectable only by allowlisted owners; defaults private.
    visibility: CommunityEndpointVisibility;
    perUserRpm: string;
};

export type EndpointFormState = ModelListingFormState & {
    modality: CommunityEndpointModality;
    // Detected by the endpoint test for image models; "request" until tested.
    imagePricing: CommunityEndpointImagePricing;
    baseUrl: string;
    upstreamModel: string;
    bearerToken: string;
    // Public community model ids, tried in the order listed.
    fallbackModelIds: string[];
} & EndpointFormPrices;

type ModelListingPayload = {
    inputModalities: ModelInputModality[];
    name: string;
    title: string;
    description: string;
    visibility: CommunityEndpointVisibility;
    perUserRpm: number | null;
};

export type EndpointPayload = ModelListingPayload & {
    modality: CommunityEndpointModality;
    imagePricing: CommunityEndpointImagePricing;
    baseUrl: string;
    upstreamModel: string;
    fallbackModelIds: string[];
} & CommunityEndpointPrices;

export type AgentListingPayload = ModelListingPayload & {
    agentId: string;
    modality: "text";
};

export type AgentListingDetailsPayload = Omit<AgentListingPayload, "agentId">;

export type CommunityEndpointUsage = Record<string, unknown>;

export type CommunityEndpointTestResponse = {
    ok?: boolean;
    message?: string;
    usage?: CommunityEndpointUsage;
    billableUsage?: Usage;
    imagePricing?: CommunityEndpointImagePricing;
    inputModalities?: ModelInputModality[];
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

const emptyListingForm: ModelListingFormState = {
    inputModalities: ["text"],
    name: "",
    title: "",
    description: "",
    visibility: "private",
    perUserRpm: "",
};

export const emptyForm: EndpointFormState = {
    ...emptyListingForm,
    modality: "text",
    imagePricing: "request",
    baseUrl: "",
    upstreamModel: "",
    bearerToken: "",
    fallbackModelIds: [],
    ...emptyPriceForm,
};

export const emptyAgentForm: AgentFormState = {
    systemPrompt: "",
    baseModel: "",
    pollinationsTools: false,
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
    const maximum =
        priceUnit === "image"
            ? MAX_COMMUNITY_PRICE_PER_IMAGE
            : MAX_COMMUNITY_PRICE_PER_MILLION_TOKENS;
    return (
        Number.isFinite(parsed) &&
        parsed >= 0 &&
        parsed <= maximum &&
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
        modality: endpoint.modality,
        imagePricing: endpoint.imagePricing,
        inputModalities: endpoint.inputModalities,
        name: endpoint.name,
        title: endpoint.title,
        description: endpoint.description ?? "",
        visibility: endpoint.visibility,
        perUserRpm: endpoint.perUserRpm?.toString() ?? "",
        baseUrl: endpoint.baseUrl,
        upstreamModel: endpoint.upstreamModel,
        bearerToken: "",
        fallbackModelIds: endpoint.fallbackModelIds ?? [],
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

export function agentListingToForm(
    endpoint?: CommunityEndpoint,
): ModelListingFormState {
    return endpoint
        ? {
              inputModalities: ["text"],
              name: endpoint.name,
              title: endpoint.title,
              description: endpoint.description ?? "",
              visibility: endpoint.visibility,
              perUserRpm: "",
          }
        : { ...emptyListingForm };
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
                    `Prices must be within the allowed range per ${unit}, using a dot decimal`,
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
export const MCP_HEADER_NAME_PATTERN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]{1,128}$/;

export function isValidMcpRow(row: McpServerRow): boolean {
    const name = row.name.trim();
    const url = row.url.trim();
    const nonEmptyHeaders = row.headers.filter(
        (header) => header.name.trim() || header.value,
    );
    if (!name && !url && nonEmptyHeaders.length === 0) return true;
    try {
        normalizeCommunityEndpointBaseUrl(url);
    } catch {
        return false;
    }
    if (!MCP_SERVER_NAME_PATTERN.test(name)) return false;

    const headerNames = new Set<string>();
    for (const header of nonEmptyHeaders) {
        const headerName = header.name.trim();
        if (
            !MCP_HEADER_NAME_PATTERN.test(headerName) ||
            (!header.saved && !header.value) ||
            header.value.includes("\r") ||
            header.value.includes("\n")
        ) {
            return false;
        }
        const normalized = headerName.toLowerCase();
        if (headerNames.has(normalized)) return false;
        headerNames.add(normalized);
    }
    return nonEmptyHeaders.length <= 16;
}

// Validates and trims the MCP server rows, dropping fully-empty rows. Mirrors
// the backend McpServerSchema so the API rejects the same inputs.
function mcpServersToPayload(rows: McpServerRow[]): AgentPayload["mcpServers"] {
    const servers: AgentPayload["mcpServers"] = [];
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
        const headers: Record<string, string | null> = {};
        for (const header of row.headers) {
            const headerName = header.name.trim();
            if (!headerName && !header.value) continue;
            if (!MCP_HEADER_NAME_PATTERN.test(headerName)) {
                throw new Error(
                    `MCP server "${name}" has an invalid header name`,
                );
            }
            if (!header.saved && !header.value) {
                throw new Error(
                    `MCP header "${headerName}" for server "${name}" needs a value`,
                );
            }
            headers[headerName] = header.value || null;
        }
        try {
            servers.push({
                name,
                url: normalizeCommunityEndpointBaseUrl(url),
                headers,
            });
        } catch {
            throw new Error(
                `MCP server "${name}" must use HTTPS and target a public host`,
            );
        }
    }
    return servers;
}

export function toAgentPayload(form: AgentFormState): AgentPayload {
    const systemPrompt = form.systemPrompt.trim();
    if (!systemPrompt) {
        throw new Error("System prompt is required for a prompt agent");
    }
    const baseModel = form.baseModel.trim();
    if (!baseModel) {
        throw new Error("Base model is required for a prompt agent");
    }
    const mcpServers = mcpServersToPayload(form.mcpServers);
    const names = new Set(form.pollinationsTools ? ["pollinations"] : []);
    for (const server of mcpServers) {
        if (names.has(server.name)) {
            throw new Error(
                `MCP server name "${server.name}" is already in use`,
            );
        }
        names.add(server.name);
    }
    return {
        systemPrompt,
        baseModel,
        pollinationsTools: form.pollinationsTools,
        mcpServers,
    };
}

function listingFieldsToPayload(form: ModelListingFormState) {
    if (!isValidPerUserRpm(form.perUserRpm)) {
        throw new Error("Per-user RPM must be a positive number");
    }
    return {
        inputModalities: form.inputModalities,
        name: form.name.trim(),
        title: form.title.trim(),
        description: form.description.trim(),
        visibility: form.visibility,
        perUserRpm: form.perUserRpm.trim() ? Number(form.perUserRpm) : null,
    };
}

export function toEndpointPayload(form: EndpointFormState): EndpointPayload {
    const modality = form.modality;
    const imagePricing = modality === "image" ? form.imagePricing : "request";
    return {
        ...listingFieldsToPayload(form),
        modality,
        imagePricing,
        baseUrl: form.baseUrl.trim(),
        upstreamModel: form.upstreamModel.trim() || form.name.trim(),
        // Private models carry no public pricing, so their fallbacks cannot be
        // validated against a quoted price.
        fallbackModelIds:
            form.visibility === "public" ? form.fallbackModelIds : [],
        ...formPricesToPayload(form, modality, imagePricing),
    };
}

export function toAgentListingPayload(
    form: ModelListingFormState,
): AgentListingDetailsPayload {
    return {
        ...listingFieldsToPayload({
            ...form,
            inputModalities: ["text"],
            perUserRpm: "",
        }),
        modality: "text",
    };
}

export function isValidPerUserRpm(value: string): boolean {
    const trimmed = value.trim();
    if (!trimmed) return true;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) && parsed > 0;
}

/** Keep the public model id in sync with the provider model until edited. */
export function nextFormState(
    current: EndpointFormState,
    key: keyof EndpointFormState,
    value: string,
): EndpointFormState {
    if (key === "modality") {
        const modality = value === "image" ? "image" : "text";
        return {
            ...current,
            modality,
            inputModalities: normalizeCommunityEndpointInputModalities(
                current.inputModalities,
                modality,
            ),
            // Targets must match the modality; the old choices no longer can.
            fallbackModelIds: [],
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
