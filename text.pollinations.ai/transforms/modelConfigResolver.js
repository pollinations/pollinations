import debug from "debug";
import { findModelByName } from "../availableModels.js";

const log = debug("pollinations:transforms:config");

/**
 * Transform that resolves model configuration and sets up internal properties
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
    const actualModelName = config.model || config["azure-model-name"] || config["azure-deployment-id"] || modelDef.name || virtualModelName;
    
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
            _modelConfig: config,
            _modelDef: modelDef,
            _virtualModelName: virtualModelName
        }
    };
    
    log("resolveModelConfig output - _modelDef exists:", !!result.options._modelDef);
    log("resolveModelConfig output - _modelConfig exists:", !!result.options._modelConfig);
    
    return result;
}
