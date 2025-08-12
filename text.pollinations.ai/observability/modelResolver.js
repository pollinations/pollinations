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
    let resolutionMethod = null;
    
    // Strategy 1: Try to find model by actual model used first
    if (actualModel) {
        model = findModelByName(actualModel);
        if (model) {
            modelForPricing = actualModel;
            resolutionMethod = 'direct_match';
            log(`✅ Found direct match for actual model: ${actualModel}`);
        } else {
            // Strategy 2: Find model whose original_name matches the actual model used
            model = availableModels.find(m => m.original_name === actualModel);
            if (model) {
                modelForPricing = model.name;
                resolutionMethod = 'original_name_match';
                log(`✅ Found model by original_name match: ${model.name} (original_name: ${model.original_name}) for actual model: ${actualModel}`);
            }
        }
    }
    
    // Strategy 3: Fall back to requested model
    if (!model && requestedModel) {
        model = findModelByName(requestedModel);
        if (model) {
            modelForPricing = requestedModel;
            resolutionMethod = 'requested_model';
            
            // Check alignment between requested and actual
            if (actualModel && model.original_name === actualModel) {
                log(`✅ Perfect match: requested model ${requestedModel} has original_name ${model.original_name} matching actual model`);
            } else if (actualModel && actualModel !== requestedModel) {
                log(`⚠️  Using fallback pricing: requested=${requestedModel}, actual=${actualModel}, original_name=${model.original_name || 'null'}`);
            }
        }
    }
    
    if (!model) {
        log(`❌ No model found for pricing: requested=${requestedModel}, actual=${actualModel}`);
    }
    
    return {
        model,
        modelForPricing,
        resolutionMethod,
        pricing: model?.pricing || null
    };
}
