import { collectUpstreamHeaders, remapUpstreamStatus } from "@shared/error.ts";
import type { CreateResponseRequest } from "@shared/schemas/openai.ts";
import { findModelByName } from "../availableModels.js";
import type { ServiceError, TransformOptions } from "../types.js";
import { resolveModelConfig } from "../utils/modelResolver.js";
import { isPlainObject } from "../utils/objectCleaners.js";
import { buildDirectResponsesRequestBody } from "./request.js";

type JsonObject = Record<string, unknown>;

export type DirectResponsesTarget = {
    authConfigured: boolean;
    disableReasoningForForcedTools?: true;
    endpoint: string;
    headers: Record<string, string>;
    model: string;
    defaults: JsonObject;
};

/** Build a Responses target from an already-resolved model configuration. */
export function responsesTargetFromConfig(
    model: string,
    config: Record<string, unknown>,
): DirectResponsesTarget | null {
    const endpoint = config.responsesEndpoint;
    if (typeof endpoint !== "string") return null;

    const authKey = config.authKey;
    const authHeader: Record<string, string> =
        typeof authKey !== "string" || !authKey
            ? {}
            : config.responsesAuthHeader === "api-key"
              ? { "api-key": authKey }
              : { Authorization: `Bearer ${authKey}` };
    const chatDefaults = isPlainObject(config.defaultOptions)
        ? config.defaultOptions
        : {};

    return {
        authConfigured: typeof authKey === "string" && authKey.length > 0,
        ...(config.responsesDisableReasoningForForcedTools === true
            ? { disableReasoningForForcedTools: true as const }
            : {}),
        endpoint,
        headers: authHeader,
        model,
        defaults: {
            ...(chatDefaults.provider === undefined
                ? {}
                : { provider: chatDefaults.provider }),
            ...(chatDefaults.max_tokens === undefined
                ? {}
                : { max_output_tokens: chatDefaults.max_tokens }),
        },
    };
}

function reasoningEffort(request: CreateResponseRequest): string | undefined {
    const effort = request.reasoning?.effort;
    return typeof effort === "string" ? effort : undefined;
}

/** Resolve a direct Responses target without ever falling back to Portkey. */
export function resolveDirectResponsesTarget(
    modelId: string,
    request: CreateResponseRequest,
): DirectResponsesTarget | null {
    const modelDef = findModelByName(modelId);
    if (!modelDef) return null;

    const options: TransformOptions = {
        model: modelId,
        reasoning_effort: reasoningEffort(request),
    };
    const resolved = resolveModelConfig([], options).options;
    const config = resolved.modelConfig ?? {};
    return responsesTargetFromConfig(String(resolved.model), config);
}

function parseJson(text: string): unknown {
    try {
        return JSON.parse(text);
    } catch {
        return text;
    }
}

function errorMessage(details: unknown, response: Response): string {
    if (details && typeof details === "object") {
        const nested = (details as { error?: unknown }).error;
        if (nested && typeof nested === "object") {
            const message = (nested as { message?: unknown }).message;
            if (typeof message === "string" && message) return message;
        }
        const message = (details as { message?: unknown }).message;
        if (typeof message === "string" && message) return message;
    }
    if (typeof details === "string" && details) return details;
    return `${response.status} ${response.statusText}`;
}

export async function callDirectResponses(
    request: CreateResponseRequest,
    target: DirectResponsesTarget,
    fetcher: typeof fetch = fetch,
): Promise<{ response: Response; requestUrl: URL }> {
    const requestUrl = new URL(target.endpoint);
    if (!target.authConfigured) {
        const error = new Error(
            `Responses credentials are not configured for model ${target.model}`,
        ) as ServiceError;
        error.status = 500;
        error.requestUrl = requestUrl;
        throw error;
    }

    let response: Response;
    try {
        response = await fetcher(target.endpoint, {
            method: "POST",
            redirect: "manual",
            headers: {
                "Content-Type": "application/json",
                ...target.headers,
            },
            body: JSON.stringify(
                buildDirectResponsesRequestBody(request, target),
            ),
        });
    } catch (thrown) {
        const error =
            thrown instanceof Error
                ? (thrown as ServiceError)
                : (new Error(String(thrown)) as ServiceError);
        error.status ??= 502;
        error.requestUrl = requestUrl;
        throw error;
    }

    if (!response.ok) {
        const text = await response.text();
        const details = parseJson(text);
        const error = new Error(
            errorMessage(details, response),
        ) as ServiceError;
        error.status = remapUpstreamStatus(response.status);
        error.upstreamStatus = response.status;
        error.details = details;
        error.responseBody = text;
        error.requestUrl = requestUrl;
        error.upstreamHeaders = collectUpstreamHeaders(response.headers);
        throw error;
    }
    if (request.stream && !response.body) {
        const error = new Error(
            "Responses provider returned an empty stream",
        ) as ServiceError;
        error.status = 502;
        error.requestUrl = requestUrl;
        throw error;
    }
    return { response, requestUrl };
}
