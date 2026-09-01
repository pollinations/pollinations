import { collectUpstreamHeaders, remapUpstreamStatus } from "@shared/error.ts";
import type { CreateResponseRequest } from "@shared/schemas/openai.ts";
import { findModelByName } from "../availableModels.js";
import type { ServiceError, TransformOptions } from "../types.js";
import { resolveModelConfig } from "../utils/modelResolver.js";
import { buildDirectResponsesRequestBody } from "./request.js";
import type { DirectResponsesTarget, JsonObject } from "./types.js";

const REQUEST_TIMEOUT_MS = 290_000;

function reasoningEffort(request: CreateResponseRequest): string | undefined {
    const effort = request.reasoning?.effort;
    return typeof effort === "string" ? effort : undefined;
}

/** Resolve a direct Responses target without ever falling back to Portkey. */
export function resolveDirectResponsesTarget(
    modelId: string,
    request: CreateResponseRequest,
    env?: CloudflareBindings,
): DirectResponsesTarget | null {
    const modelDef = findModelByName(modelId);
    if (!modelDef) return null;

    const options: TransformOptions = {
        model: modelId,
        reasoning_effort: reasoningEffort(request),
    };
    const resolved = resolveModelConfig([], options).options;
    const config = resolved.modelConfig ?? {};
    const endpoint = config.responsesEndpoint;
    if (typeof endpoint !== "string") return null;

    const binding = config.responsesApiKeyBinding;
    const bindingValue =
        typeof binding === "string"
            ? (env as Record<string, unknown> | undefined)?.[binding]
            : undefined;
    const authKey =
        typeof bindingValue === "string" && bindingValue
            ? bindingValue
            : config.authKey;
    const authHeader: Record<string, string> =
        typeof authKey !== "string" || !authKey
            ? {}
            : config.responsesAuthHeader === "api-key"
              ? { "api-key": authKey }
              : { Authorization: `Bearer ${authKey}` };
    const configuredHeaders =
        config.responsesHeaders &&
        typeof config.responsesHeaders === "object" &&
        !Array.isArray(config.responsesHeaders)
            ? (config.responsesHeaders as Record<string, string>)
            : {};

    const chatDefaults =
        config.defaultOptions &&
        typeof config.defaultOptions === "object" &&
        !Array.isArray(config.defaultOptions)
            ? (config.defaultOptions as JsonObject)
            : {};
    const responsesDefaults =
        config.responsesDefaults &&
        typeof config.responsesDefaults === "object" &&
        !Array.isArray(config.responsesDefaults)
            ? (config.responsesDefaults as JsonObject)
            : {};
    const defaults: JsonObject = {
        ...(chatDefaults.provider === undefined
            ? {}
            : { provider: chatDefaults.provider }),
        ...(chatDefaults.max_tokens === undefined
            ? {}
            : { max_output_tokens: chatDefaults.max_tokens }),
        ...responsesDefaults,
    };

    return {
        authConfigured: typeof authKey === "string" && authKey.length > 0,
        endpoint,
        headers: { ...authHeader, ...configuredHeaders },
        model: String(resolved.model),
        defaults,
    };
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
            headers: {
                "Content-Type": "application/json",
                ...target.headers,
            },
            body: JSON.stringify(
                buildDirectResponsesRequestBody(request, target),
            ),
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
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
