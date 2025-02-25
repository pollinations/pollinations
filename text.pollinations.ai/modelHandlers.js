// modelHandlers.js
// This file now uses the enhanced model definitions from availableModels.js

import { findModelByName } from './availableModels.js';

/**
 * Get a handler function for a specific model
 * @param {string} modelName - The name of the model
 * @returns {Function} - The handler function for the model, or the default handler if not found
 */
export function getHandler(modelName) {
    const model = findModelByName(modelName);
    return model.handler;
}

// Re-export the model handlers map for backward compatibility
export const modelHandlers = {};

// Populate the modelHandlers map from availableModels
import { availableModels } from './availableModels.js';
availableModels.forEach(model => {
    if (model.handler) {
        modelHandlers[model.name] = model.handler;
    }
});