import {
    getModelDefinition,
    type ModelName,
} from "@shared/registry/registry.ts";
import type { CreateResponseRequest } from "@shared/schemas/openai.ts";
import debug from "debug";
import { remapUpstreamStatus } from "@/error.ts";
import { findModelByName } from "./availableModels.js";
import { generatePortkeyHeaders } from "./portkeyUtils.js";
import type { ServiceError, TransformOptions } from "./types.js";
import { cleanNullAndUndefined } from "./utils/objectCleaners.js";

const log = debug("pollinations:portkey:responses");
const RESPONSES_AZURE_API_VERSION = "2025-03-01-preview";

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

function createApiError(
    response: { status: number; statusText: string },
    details: unknown,
    endpoint: string,
): ServiceError {
    const error = new Error(
        `${response.status} ${response.statusText}`,
    ) as ServiceError;
    error.status = remapUpstreamStatus(response.status);
    error.upstreamStatus = response.status;
    error.details = details;
    error.response = { data: details };
    error.model = endpoint;
    return error;
}

function parseJsonSafe(text: string): unknown {
    try {
        return JSON.parse(text);
    } catch {
        return text;
    }
}

function resolveResponseModelConfig(model: string): {
    model: string;
    modelConfig: Record<string, unknown>;
    modelDef: unknown;
} {
    const serviceDef = getModelDefinition(model as ModelName);
    if (!serviceDef.responses) {
        const error = new Error(
            `Model does not support /v1/responses: ${model}`,
        ) as ServiceError;
        error.status = 400;
        error.details = {
            error: {
                message: `Model '${model}' does not support /v1/responses`,
                type: "invalid_request_error",
                param: "model",
                code: "unsupported_endpoint",
            },
        };
        throw error;
    }

    const modelDef = findModelByName(model);
    if (!modelDef?.config) {
        const error = new Error(
            `Model configuration not found for: ${model}`,
        ) as ServiceError;
        error.status = 404;
        throw error;
    }

    const modelConfig = (
        typeof modelDef.config === "function"
            ? modelDef.config()
            : modelDef.config
    ) as Record<string, unknown>;
    const usedModel = (modelConfig.model ||
        modelConfig["azure-model-name"] ||
        modelConfig["azure-deployment-id"] ||
        modelConfig["vertex-model-id"]) as string;

    return { model: usedModel, modelConfig, modelDef };
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
    if (headers["x-portkey-provider"] === "azure-openai") {
        return {
            ...headers,
            "x-portkey-azure-api-version": RESPONSES_AZURE_API_VERSION,
        };
    }
    return headers;
}

export async function generateResponsePortkey(
    body: ResponseRequestBody,
    options: GenerateResponseOptions = {},
) {
    const { model, modelConfig, modelDef } = resolveResponseModelConfig(
        body.model || "openai",
    );
    const transformOptions: TransformOptions = {
        model,
        modelConfig,
        modelDef,
        userApiKey: options.userApiKey,
    };
    const portkeyHeaders = ensureResponsesHeaders(
        await generatePortkeyHeaders(modelConfig, transformOptions),
    );
    const requestBody = cleanNullAndUndefined({
        store: false,
        ...stripInternalParams(body),
        model,
    });
    const endpoint = buildEndpoint(options.portkeyGatewayUrl);

    log("Sending Responses API request", {
        endpoint,
        model,
        requestKeys: Object.keys(requestBody as Record<string, unknown>),
    });

    const response = await fetch(endpoint, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            ...portkeyHeaders,
        },
        body: JSON.stringify(requestBody),
    });

    const responseText = await response.text();
    const responseBody = parseJsonSafe(responseText);

    if (!response.ok) {
        throw createApiError(response, responseBody, endpoint);
    }

    return responseBody;
}
