/**
 * Functional configuration resolution utilities
 * Eliminates scattered config lookup patterns across the codebase
 */

import { portkeyConfig } from "../configs/modelConfigs.js";

/**
 * Resolves model configuration without default provider fallback
 * @param {string} modelName - Model name to resolve
 * @returns {Object|null} Model configuration or null if not found
 */
export const resolveModelConfig = (modelName) => {
    if (!modelName) return null;
    return portkeyConfig[modelName] || null;
};

/**
 * Resolves model definition from available models
 * @param {Array} availableModels - Array of available model definitions
 * @param {string} modelName - Model name to find
 * @returns {Object|null} Model definition or null if not found
 */
export const resolveModelDefinition = (availableModels, modelName) => {
    if (!modelName || !Array.isArray(availableModels)) return null;
    
    return availableModels.find(model => 
        model.name === modelName || 
        (model.aliases && model.aliases.includes(modelName))
    ) || null;
};

/**
 * Extracts provider from model definition or config
 * @param {Object} modelDef - Model definition
 * @param {Object} config - Model configuration
 * @returns {string|null} Provider name or null
 */
export const resolveProvider = (modelDef, config) => {
    if (modelDef?.provider) return modelDef.provider;
    if (config?.provider) return config.provider;
    return null;
};

/**
 * Resolves tier requirement for a model
 * @param {Object} modelDef - Model definition
 * @returns {string} Tier requirement (defaults to 'anonymous')
 */
export const resolveTier = (modelDef) => {
    return modelDef?.tier || 'anonymous';
};

/**
 * Resolves model capabilities (input/output modalities, tools support)
 * @param {Object} modelDef - Model definition
 * @returns {Object} Capabilities object
 */
export const resolveCapabilities = (modelDef) => {
    return {
        inputModalities: modelDef?.input_modalities || ['text'],
        outputModalities: modelDef?.output_modalities || ['text'],
        supportsTools: modelDef?.tools || false,
        supportsSystemMessages: modelDef?.supportsSystemMessages !== false
    };
};

/**
 * Resolves complete model information
 * @param {Array} availableModels - Array of available model definitions
 * @param {string} modelName - Model name to resolve
 * @returns {Object|null} Complete model information or null
 */
export const resolveCompleteModelInfo = (availableModels, modelName) => {
    const modelDef = resolveModelDefinition(availableModels, modelName);
    if (!modelDef) return null;
    
    const config = resolveModelConfig(modelDef.config ? Object.keys(portkeyConfig).find(key => portkeyConfig[key] === modelDef.config) : modelName);
    
    return {
        definition: modelDef,
        config,
        provider: resolveProvider(modelDef, config),
        tier: resolveTier(modelDef),
        capabilities: resolveCapabilities(modelDef)
    };
};

/**
 * Creates a memoized version of a resolver function
 * @param {Function} resolverFn - Function to memoize
 * @returns {Function} Memoized function
 */
export const memoizeResolver = (resolverFn) => {
    const cache = new Map();
    
    return (...args) => {
        const key = JSON.stringify(args);
        
        if (cache.has(key)) {
            return cache.get(key);
        }
        
        const result = resolverFn(...args);
        cache.set(key, result);
        return result;
    };
};

// Memoized versions for performance
export const memoizedResolveModelConfig = memoizeResolver(resolveModelConfig);
export const memoizedResolveCompleteModelInfo = memoizeResolver(resolveCompleteModelInfo);
