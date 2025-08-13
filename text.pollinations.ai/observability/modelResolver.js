import debug from "debug";
import { findModelByName, availableModels } from "../availableModels.js";
const DEFAULT_PROVIDER = 'unknown';

const log = debug("pollinations:model-resolver");

/**
 * Get the provider name for a model by looking it up in availableModels
 * @param {string} modelName - The name of the model
 * @returns {string} - The provider name or 'Unknown' if not found
 */
export function getProviderNameFromModel(modelName) {
    if (!modelName) return DEFAULT_PROVIDER;
    
    const model = findModelByName(modelName);
    return model?.provider || DEFAULT_PROVIDER;
}

/**
 * Resolve model and pricing information with enhanced fallback logic
 * @param {string} requestedModel - The model name that was requested
 * @param {string} actualModel - The model name that was actually used
 * @returns {Object} - Model resolution result with model, pricing, and metadata
 */
export function resolveModelForPricing(requestedModel, actualModel) {
    let model = null;
    let modelForPricing = null;
    
    // Try to find model by actual model used first
    if (actualModel) {
        model = findModelByName(actualModel);
        if (model) {
            modelForPricing = actualModel;
        } else {
            // Find model whose original_name matches the actual model used
            model = availableModels.find(m => m.original_name === actualModel);
            if (model) {
                modelForPricing = model.name;
            }
        }
    }
    
    // Fall back to requested model
    if (!model && requestedModel) {
        model = findModelByName(requestedModel);
        if (model) {
            modelForPricing = requestedModel;
        }
    }
    
    if (!model) {
        log(`No model found for pricing: requested=${requestedModel}, actual=${actualModel}`);
    }
    
    return {
        model,
        modelForPricing,
        pricing: model?.pricing || null
    };
}
