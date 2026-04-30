import debug from "debug";
import { findModelByName } from "../availableModels.js";
import type {
    ChatMessage,
    ServiceError,
    TransformOptions,
    TransformResult,
} from "../types.js";

const log = debug("pollinations:model-resolver");

function modelResolutionError(message: string): ServiceError {
    const error = new Error(message) as ServiceError;
    error.name = "ModelResolutionError";
    error.status = 404;
    return error;
}

/**
 * Resolves model configuration and sets up internal properties.
 * User-provided options take precedence over model defaults.
 */
export function resolveModelConfig(
    messages: ChatMessage[],
    options: TransformOptions,
): TransformResult {
    const requestedModel = options.model;
    if (!requestedModel) {
        throw modelResolutionError("Model is required");
    }
    const modelDef = findModelByName(requestedModel);

    if (!modelDef?.config) {
        throw modelResolutionError(
            `Model configuration not found for: ${requestedModel}`,
        );
    }

    const config = (
        typeof modelDef.config === "function"
            ? modelDef.config()
            : modelDef.config
    ) as Record<string, unknown>;

    const usedModel = (config.model ||
        config["azure-model-name"] ||
        config["azure-deployment-id"] ||
        config["vertex-model-id"]) as string;

    log(
        "Processing request for model:",
        requestedModel,
        "→",
        usedModel,
        "with provider:",
        config.provider,
    );

    // Filter out undefined values so they don't overwrite config defaults
    const definedOptions = Object.fromEntries(
        Object.entries(options).filter(([_, v]) => v !== undefined),
    );

    return {
        messages,
        options: {
            ...((config.defaultOptions || {}) as Record<string, unknown>),
            ...definedOptions,
            model: usedModel,
            modelConfig: config,
            modelDef,
            requestedModel,
        },
    };
}
