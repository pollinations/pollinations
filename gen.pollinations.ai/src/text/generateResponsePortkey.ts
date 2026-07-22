import { remapUpstreamStatus } from "@shared/error.ts";
import {
    getRegistryModelDefinition,
    type ModelName,
} from "@shared/registry/registry.ts";
import type { CreateResponseRequest } from "@shared/schemas/openai.ts";
import debug from "debug";
import { generateHeaders } from "./transforms/headerGenerator.js";
import type { ServiceError } from "./types.js";
import { resolveModelConfig } from "./utils/modelResolver.js";
import { cleanNullAndUndefined } from "./utils/objectCleaners.js";

const log = debug("pollinations:portkey:responses");
const RESPONSES_AZURE_API_VERSION = "v1";

type ResponseRequestBody = CreateResponseRequest & Record<string, unknown>;

type GenerateResponseOptions = {
    portkeyGatewayUrl?: string;
    userApiKey?: string;
};

function buildEndpoint(gatewayUrl: unknown): string {
    const base =
        typeof gatewayUrl === "string" && gatewayUrl
            ? gatewayUrl
            : process.env.PORTKEY_GATEWAY_URL || "https://portkey.myceli.ai";
    return `${base.replace(/\/+$/, "")}/v1/responses`;
}

function parseJsonSafe(text: string): unknown {
    try {
        return JSON.parse(text);
    } catch {
        return text;
    }
}

function createApiError(
    response: { status: number; statusText: string },
    details: unknown,
    model: string,
): ServiceError {
    const error = new Error(
        `${response.status} ${response.statusText}`,
    ) as ServiceError;
    error.status = remapUpstreamStatus(response.status);
    error.upstreamStatus = response.status;
    error.details = details;
    error.response = { data: details };
    error.model = model;
    return error;
}

function unsupportedModelError(model: string): ServiceError {
    const error = new Error(
        `Model '${model}' does not support /v1/responses`,
    ) as ServiceError;
    error.status = 400;
    error.details = {
        error: {
            message: error.message,
            type: "invalid_request_error",
            param: "model",
            code: "unsupported_endpoint",
        },
    };
    return error;
}

function stripInternalParams(body: ResponseRequestBody) {
    const {
        key: _key,
        private: _private,
        referrer: _referrer,
        referer: _referer,
        safe: _safe,
        ...rest
    } = body;
    return rest;
}

function ensureResponsesHeaders(headers: Record<string, string>) {
    if (headers["x-portkey-provider"] !== "azure-openai") return headers;
    return {
        ...headers,
        "x-portkey-azure-api-version": RESPONSES_AZURE_API_VERSION,
    };
}

export async function generateResponsePortkey(
    body: ResponseRequestBody,
    options: GenerateResponseOptions = {},
): Promise<Response> {
    const requestedModel = body.model || "openai";
    let supportsResponses = false;
    try {
        supportsResponses =
            getRegistryModelDefinition(requestedModel as ModelName)
                .responses === true;
    } catch {
        // Runtime/community models are not part of the bundled registry.
    }
    if (!supportsResponses) throw unsupportedModelError(requestedModel);

    let state = resolveModelConfig([], {
        model: requestedModel,
        userApiKey: options.userApiKey,
    });
    state = await generateHeaders(state.messages, state.options);

    const model = state.options.model;
    if (!model) throw new Error("Model is required");
    const headers = ensureResponsesHeaders(
        (state.options.additionalHeaders || {}) as Record<string, string>,
    );
    const requestBody = cleanNullAndUndefined({
        ...stripInternalParams(body),
        model,
        // Pollinations does not expose retrieve/delete endpoints, so avoid
        // persisting otherwise unreachable response state upstream.
        store: false,
    });
    const endpoint = buildEndpoint(options.portkeyGatewayUrl);

    log("Sending Responses API request", {
        endpoint,
        model,
        stream: body.stream === true,
        requestKeys: Object.keys(requestBody as Record<string, unknown>),
    });

    const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
        const responseText = await response.text();
        throw createApiError(
            response,
            parseJsonSafe(responseText),
            requestedModel,
        );
    }

    return response;
}
