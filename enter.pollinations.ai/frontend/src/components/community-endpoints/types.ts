import {
    COMMUNITY_ENDPOINT_PRICE_FIELDS,
    type CommunityEndpointAdvertised,
    type CommunityEndpointCapability,
    type CommunityEndpointImagePricing,
    type CommunityEndpointModality,
    type CommunityEndpointPriceField,
    type CommunityEndpointPriceKey,
    type CommunityEndpointPrices,
    type CommunityEndpointVisibility,
    communityEndpointPriceFieldsForModality,
    MAX_COMMUNITY_PRICE_PER_IMAGE,
    MAX_COMMUNITY_PRICE_PER_MILLION_TOKENS,
    MAX_COMMUNITY_PRICE_PER_SECOND,
    MIN_COMMUNITY_PRICE_PER_MILLION_TOKENS,
    normalizeCommunityEndpointAdvertised,
    normalizeCommunityEndpointInputModalities,
} from "@shared/community-endpoints.ts";
import type { ModelInputModality, Usage } from "@shared/registry/registry.ts";

type EndpointFormPrices = Record<CommunityEndpointPriceKey, string>;

export type ManagedAgent = {
    id: string;
    name: string;
    title: string;
    description: string | null;
    visibility: CommunityEndpointVisibility;
    baseUrl: string;
    upstreamModel: string;
    systemPrompt: string;
    baseModel: string;
    mcpServers: "pollinations"[];
    createdAt: string;
    updatedAt: string;
};

type AgentFields = Pick<
    ManagedAgent,
    "systemPrompt" | "baseModel" | "mcpServers"
>;

export type AgentFormState = AgentFields;

export type AgentPayload = AgentFields;

export type CommunityProviderProfile = {
    name: string | null;
    url: string | null;
};

type CommunityEndpointBase = {
    id: string;
    modelId: string;
    name: string;
    // Always populated by the API, which falls back for un-backfilled rows.
    title: string;
    description: string | null;
    baseUrl: string;
    upstreamModel: string;
    // private → owner-only, shown only to the owner, no owner-set price;
    // public → globally listed + billed to callers.
    visibility: CommunityEndpointVisibility;
    hidden: boolean;
    hiddenReason: string | null;
    hiddenAt: string | null;
};

export type ProxyCommunityEndpoint = CommunityEndpointBase &
    CommunityEndpointPrices & {
        type: "proxy";
        modality: CommunityEndpointModality;
        imagePricing: CommunityEndpointImagePricing;
        inputModalities: ModelInputModality[];
        advertised: CommunityEndpointAdvertised;
        perUserRpm: number | null;
        paidOnly: boolean;
        fallbacks: string[];
    };

export type PromptAgentCommunityEndpoint = CommunityEndpointBase & {
    type: "prompt_agent";
};

export type EndpointAgentCommunityEndpoint = CommunityEndpointBase & {
    type: "endpoint_agent";
    perUserRpm: number | null;
};

export type CommunityEndpoint =
    | ProxyCommunityEndpoint
    | PromptAgentCommunityEndpoint
    | EndpointAgentCommunityEndpoint;

export type EditableEndpoint =
    | ProxyCommunityEndpoint
    | EndpointAgentCommunityEndpoint;

export type FallbackModelOption = {
    modelId: string;
    modality: CommunityEndpointModality;
};

/**
 * Public community models from the model catalog, in dialog option form. The
 * catalog already excludes private and hidden models, and the server
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
                (model.type === "text" ||
                    model.type === "image" ||
                    model.type === "audio"),
        )
        .map((model) => ({
            modelId: model.name,
            modality:
                model.type === "image"
                    ? "image"
                    : model.type === "audio"
                      ? "transcription"
                      : "text",
        }));
}

export type ModelListingFormState = {
    inputModalities: ModelInputModality[];
    capabilities: CommunityEndpointCapability[];
    contextLength: string;
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
    // Callers may only spend Paid Pollen. Useful for pay-as-you-go upstreams.
    paidOnly: boolean;
    // Public community model ids, tried in the order listed.
    fallbacks: string[];
} & EndpointFormPrices;

type ModelListingPayload = {
    inputModalities: ModelInputModality[];
    advertised: CommunityEndpointAdvertised;
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
    paidOnly: boolean;
    fallbacks: string[];
} & CommunityEndpointPrices;

export type AgentListingDetailsPayload = {
    name: string;
    title: string;
    description: string;
    visibility: CommunityEndpointVisibility;
};

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
    capabilities: [],
    contextLength: "",
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
    paidOnly: false,
    fallbacks: [],
    ...emptyPriceForm,
};

export const emptyAgentForm: AgentFormState = {
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
    const maximum =
        priceUnit === "image"
            ? MAX_COMMUNITY_PRICE_PER_IMAGE
            : priceUnit === "second"
              ? MAX_COMMUNITY_PRICE_PER_SECOND
              : MAX_COMMUNITY_PRICE_PER_MILLION_TOKENS;
    return (
        Number.isFinite(parsed) &&
        parsed >= 0 &&
        parsed <= maximum &&
        (priceUnit !== "million" ||
            parsed === 0 ||
            parsed >= MIN_COMMUNITY_PRICE_PER_MILLION_TOKENS)
    );
}

export function endpointToForm(endpoint: EditableEndpoint): EndpointFormState {
    if (endpoint.type === "endpoint_agent") {
        return {
            ...emptyForm,
            name: endpoint.name,
            title: endpoint.title,
            description: endpoint.description ?? "",
            visibility: endpoint.visibility,
            perUserRpm: endpoint.perUserRpm?.toString() ?? "",
            baseUrl: endpoint.baseUrl,
            upstreamModel: endpoint.upstreamModel,
        };
    }
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
        capabilities: endpoint.advertised.capabilities ?? [],
        contextLength: endpoint.advertised.contextLength?.toString() ?? "",
        name: endpoint.name,
        title: endpoint.title,
        description: endpoint.description ?? "",
        visibility: endpoint.visibility,
        perUserRpm: endpoint.perUserRpm?.toString() ?? "",
        baseUrl: endpoint.baseUrl,
        upstreamModel: endpoint.upstreamModel,
        bearerToken: "",
        paidOnly: endpoint.paidOnly,
        fallbacks: endpoint.fallbacks ?? [],
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
    endpoint?: PromptAgentCommunityEndpoint,
): ModelListingFormState {
    return endpoint
        ? {
              inputModalities: ["text"],
              capabilities: [],
              contextLength: "",
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
                    modalityField.priceUnit === "image"
                        ? "image"
                        : modalityField.priceUnit === "second"
                          ? "second"
                          : "1M units";
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

export function toAgentPayload(form: AgentFormState): AgentPayload {
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
        mcpServers: form.mcpServers,
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
        advertised: normalizeCommunityEndpointAdvertised(
            {
                capabilities: form.capabilities,
                contextLength: form.contextLength.trim()
                    ? Number(form.contextLength)
                    : undefined,
            },
            modality,
        ),
        baseUrl: form.baseUrl.trim(),
        upstreamModel: form.upstreamModel.trim() || form.name.trim(),
        paidOnly: form.visibility === "public" ? form.paidOnly : false,
        // Private models carry no public pricing, so their fallbacks cannot be
        // validated against a quoted price.
        fallbacks: form.visibility === "public" ? form.fallbacks : [],
        ...formPricesToPayload(form, modality, imagePricing),
    };
}

export function toAgentListingPayload(
    form: ModelListingFormState,
): AgentListingDetailsPayload {
    return {
        name: form.name.trim(),
        title: form.title.trim(),
        description: form.description.trim(),
        visibility: form.visibility,
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
        const modality =
            value === "image"
                ? "image"
                : value === "transcription"
                  ? "transcription"
                  : "text";
        return {
            ...current,
            modality,
            inputModalities: normalizeCommunityEndpointInputModalities(
                current.inputModalities,
                modality,
            ),
            // Targets must match the modality; the old choices no longer can.
            fallbacks: [],
            capabilities: modality === "text" ? current.capabilities : [],
            contextLength: modality === "text" ? current.contextLength : "",
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
