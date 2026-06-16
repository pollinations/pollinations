import {
    COMMUNITY_ENDPOINT_PRICE_FIELDS,
    type CommunityEndpointPriceKey,
    type CommunityEndpointPrices,
} from "@shared/community-endpoints.ts";
import type { Usage } from "@shared/registry/registry.ts";

type EndpointFormPrices = Record<CommunityEndpointPriceKey, string>;

export type CommunityEndpoint = {
    id: string;
    modelId: string;
    name: string;
    description: string | null;
    baseUrl: string;
    upstreamModel: string;
    tokenConfigured: boolean;
    contextLength: number | null;
} & CommunityEndpointPrices;

export type EndpointFormState = {
    name: string;
    description: string;
    baseUrl: string;
    upstreamModel: string;
    bearerToken: string;
} & EndpointFormPrices;

export type EndpointPayload = {
    name: string;
    description: string;
    baseUrl: string;
    upstreamModel: string;
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

export type UsageCountEntry = {
    label: string;
    value: number;
};

const emptyPriceForm = Object.fromEntries(
    COMMUNITY_ENDPOINT_PRICE_FIELDS.map((field) => [field.key, ""]),
) as EndpointFormPrices;

export const emptyForm: EndpointFormState = {
    name: "",
    description: "",
    baseUrl: "",
    upstreamModel: "",
    bearerToken: "",
    ...emptyPriceForm,
};

export const idleAction: ActionState = { status: "idle" };

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
    return {
        name: endpoint.name,
        description: endpoint.description ?? "",
        baseUrl: endpoint.baseUrl,
        upstreamModel: endpoint.upstreamModel,
        bearerToken: "",
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

export function hasObservedUsagePath(
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

export function billableUsageCountEntries(
    usage: CommunityEndpointUsage | undefined,
    billableUsage: Usage | undefined,
): UsageCountEntry[] {
    return COMMUNITY_ENDPOINT_PRICE_FIELDS.flatMap((field) =>
        hasObservedPriceField(usage, field)
            ? [
                  {
                      label: field.label,
                      value: billableUsage?.[field.usageType] ?? 0,
                  },
              ]
            : [],
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

export function toEndpointPayload(form: EndpointFormState): EndpointPayload {
    const modelName = form.name.trim();
    return {
        name: modelName,
        description: form.description.trim(),
        baseUrl: form.baseUrl.trim(),
        upstreamModel: form.upstreamModel.trim() || modelName,
        ...formPricesToPayload(form),
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
