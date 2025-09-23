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
    if (!options.model) {
        return { messages, options };
    }

    const virtualModelName = options.model;
    const modelDef = findModelByName(virtualModelName);
    
    if (!modelDef?.config) {
        throw new Error(`Model configuration not found for: ${virtualModelName}`);
    }

    // Get the model configuration object
    const config = typeof modelDef.config === 'function' ? modelDef.config() : modelDef.config;

    // Extract the actual model name
    const actualModelName = config.model || config["azure-model-name"] || config["azure-deployment-id"] || config["vertex-model-id"] || modelDef.name || virtualModelName;
    
    log(
        "Processing request for model:",
        virtualModelName,
        "→",
        actualModelName,
        "with provider:",
        config.provider,
    );

    const result = {
        messages,
        options: {
            ...options,
            model: actualModelName,
            modelConfig: config,
            modelDef: modelDef,
            virtualModelName: virtualModelName
        }
    };
    
    log("resolveModelConfig output - modelDef exists:", !!result.options.modelDef);
    log("resolveModelConfig output - modelConfig exists:", !!result.options.modelConfig);
    
    return result;
}

