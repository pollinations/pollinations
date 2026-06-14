export type CommunityEndpoint = {
    id: string;
    modelId: string;
    name: string;
    description: string | null;
    baseUrl: string;
    upstreamModel: string;
    tokenConfigured: boolean;
    promptTextPrice: number;
    completionTextPrice: number;
    contextLength: number | null;
};

export type EndpointFormState = {
    name: string;
    description: string;
    baseUrl: string;
    upstreamModel: string;
    bearerToken: string;
    promptTextPrice: string;
    completionTextPrice: string;
};

export type EndpointPayload = {
    name: string;
    description: string;
    baseUrl: string;
    upstreamModel: string;
    promptTextPrice: number;
    completionTextPrice: number;
};

export type ActionState = {
    status: "idle" | "loading" | "success" | "error";
    message?: string;
};

export const emptyForm: EndpointFormState = {
    name: "",
    description: "",
    baseUrl: "",
    upstreamModel: "",
    bearerToken: "",
    promptTextPrice: "",
    completionTextPrice: "",
};

export const idleAction: ActionState = { status: "idle" };

const TOKENS_PER_MILLION = 1_000_000;

/** Stored prices are per-token; the UI shows and accepts them per 1M tokens. */
export function pricePerTokenToPerMillion(value: number): string {
    return String(Number((value * TOKENS_PER_MILLION).toPrecision(15)));
}

export function pricePerMillionToPerToken(value: string): number {
    return Number(value || 0) / TOKENS_PER_MILLION;
}

export function endpointToForm(endpoint: CommunityEndpoint): EndpointFormState {
    return {
        name: endpoint.name,
        description: endpoint.description ?? "",
        baseUrl: endpoint.baseUrl,
        upstreamModel: endpoint.upstreamModel,
        bearerToken: "",
        promptTextPrice: pricePerTokenToPerMillion(endpoint.promptTextPrice),
        completionTextPrice: pricePerTokenToPerMillion(
            endpoint.completionTextPrice,
        ),
    };
}

export function toEndpointPayload(form: EndpointFormState): EndpointPayload {
    const modelName = form.name.trim();
    return {
        name: modelName,
        description: form.description.trim(),
        baseUrl: form.baseUrl.trim(),
        upstreamModel: form.upstreamModel.trim() || modelName,
        promptTextPrice: pricePerMillionToPerToken(form.promptTextPrice),
        completionTextPrice: pricePerMillionToPerToken(
            form.completionTextPrice,
        ),
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
