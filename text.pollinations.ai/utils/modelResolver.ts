/**
 * Model configuration resolution utilities
 */
import debug from "debug";
import { portkeyConfig } from "../configs/modelConfigs.js";
import { findModelByName } from "../availableModels.js";

const log = debug("pollinations:model-resolver");

/**
 * Transform function that resolves model configuration and sets up internal properties
 * @param {Array} messages - Array of message objects
 * @param {Object} options - Request options with model name
 * @returns {Object} Object with messages and resolved options
 */
export function resolveModelConfig(messages, options) {
    const requestedModel = options.model;
    const modelDef = findModelByName(requestedModel);

    if (!modelDef?.config) {
        throw new Error(`Model configuration not found for: ${requestedModel}`);
    }

    // Get the model configuration object
    const config: any =
        typeof modelDef.config === "function"
            ? modelDef.config()
            : modelDef.config;

    // Extract the actual model name used by the provider
    const usedModel =
        config.model ||
        config["azure-model-name"] ||
        config["azure-deployment-id"] ||
        config["vertex-model-id"];

    log(
        "Processing request for model:",
        requestedModel,
        "→",
        usedModel,
        "with provider:",
        config.provider,
    );

    // Merge defaultOptions from config (e.g., max_tokens for Bedrock)
    // User-provided options take precedence over defaults
    // Filter out undefined values from options so they don't overwrite defaults
    const definedOptions = Object.fromEntries(
        Object.entries(options).filter(([_, v]) => v !== undefined)
    );
    const result = {
        messages,
        options: {
            ...(config.defaultOptions || {}),
            ...definedOptions,
            model: usedModel,
            modelConfig: config,
            modelDef,
            requestedModel,
        },
    };

    log(
        "resolveModelConfig output - modelDef exists:",
        !!result.options.modelDef,
    );
    log(
        "resolveModelConfig output - modelConfig exists:",
        !!result.options.modelConfig,
    );

    return result;
}
