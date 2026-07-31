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
    normalizeCommunityEndpointInputModalities,
} from "@shared/community-endpoints.ts";
import type { ModelInputModality, Usage } from "@shared/registry/registry.ts";

type EndpointFormPrices = Record<CommunityEndpointPriceKey, string>;

export type CommunityEndpoint = {
    id: string;
    modelId: string;
    name: string;
    // Always populated by the API, which falls back for un-backfilled rows.
    title: string;
    description: string | null;
    modality: CommunityEndpointModality;
    imagePricing: CommunityEndpointImagePricing;
    supportsImageEdits: boolean;
    inputModalities: ModelInputModality[];
    baseUrl: string;
    upstreamModel: string;
    // private → owner-only, shown only to the owner, no owner-set price;
    // public → globally listed + billed to callers.
    visibility: CommunityEndpointVisibility;
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
    models: { name: string; type: string; community?: boolean }[],
): FallbackModelOption[] {
    return models
        .filter(
            (model) =>
                model.community &&
                (model.type === "text" || model.type === "image"),
        )
        .map((model) => ({
            modelId: model.name,
            modality: model.type === "image" ? "image" : "text",
        }));
}

export type EndpointFormState = {
    modality: CommunityEndpointModality;
    // Detected by the endpoint test for image models; "request" until tested.
    imagePricing: CommunityEndpointImagePricing;
    // Set only when the endpoint test receives a valid image edit response.
    supportsImageEdits: boolean;
    inputModalities: ModelInputModality[];
    name: string;
    title: string;
    description: string;
    // private → owner-only, shown only to the owner, no owner-set price;
    // public → globally listed + billed to callers.
    // Public is selectable only by allowlisted owners; defaults private.
    visibility: CommunityEndpointVisibility;
    baseUrl: string;
    upstreamModel: string;
    bearerToken: string;
    // Public community model ids, tried in the order listed.
    fallbackModelIds: string[];
} & EndpointFormPrices;

export type EndpointPayload = {
    modality: CommunityEndpointModality;
    imagePricing: CommunityEndpointImagePricing;
    supportsImageEdits: boolean;
    inputModalities: ModelInputModality[];
    name: string;
    title: string;
    description: string;
    baseUrl: string;
    upstreamModel: string;
    visibility: CommunityEndpointVisibility;
    fallbackModelIds: string[];
} & CommunityEndpointPrices;

export type CommunityEndpointUsage = Record<string, unknown>;

export type CommunityEndpointTestResponse = {
    ok?: boolean;
    message?: string;
    usage?: CommunityEndpointUsage;
    billableUsage?: Usage;
    imagePricing?: CommunityEndpointImagePricing;
    supportsImageEdits?: boolean;
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
    modality: "text",
    imagePricing: "request",
    supportsImageEdits: false,
    inputModalities: ["text"],
    name: "",
    title: "",
    description: "",
    visibility: "private",
    baseUrl: "",
    upstreamModel: "",
    bearerToken: "",
    fallbackModelIds: [],
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
        supportsImageEdits: endpoint.supportsImageEdits,
        inputModalities: endpoint.inputModalities,
        name: endpoint.name,
        title: endpoint.title,
        description: endpoint.description ?? "",
        visibility: endpoint.visibility,
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

export function toEndpointPayload(form: EndpointFormState): EndpointPayload {
    const modelName = form.name.trim();
    const imagePricing =
        form.modality === "image" ? form.imagePricing : "request";
    return {
        modality: form.modality,
        imagePricing,
        supportsImageEdits:
            form.modality === "image" && form.supportsImageEdits,
        inputModalities: form.inputModalities,
        name: modelName,
        title: form.title.trim(),
        description: form.description.trim(),
        visibility: form.visibility,
        baseUrl: form.baseUrl.trim(),
        upstreamModel: form.upstreamModel.trim() || modelName,
        // A private model carries no pricing, so a priced fallback target can
        // never satisfy the same-or-lower rule — clear them alongside prices.
        fallbackModelIds:
            form.visibility === "public" ? form.fallbackModelIds : [],
        ...formPricesToPayload(form, form.modality, imagePricing),
    };
}

/** Keep the public model id in sync with the provider model until edited. */
export function nextFormState(
    current: EndpointFormState,
    key: keyof EndpointFormState,
    value: string,
): EndpointFormState {
    if (key === "supportsImageEdits") return current;
    if (key === "modality") {
        const modality = value === "image" ? "image" : "text";
        return {
            ...current,
            modality,
            supportsImageEdits: false,
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
        key === "name" ||
        key === "upstreamModel" ||
        key === "baseUrl" ||
        key === "bearerToken"
    ) {
        next.supportsImageEdits = false;
    }
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
