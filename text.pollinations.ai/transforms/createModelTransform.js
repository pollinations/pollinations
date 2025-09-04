/**
 * Creates a model-specific transform function that handles model quirks and parameter adjustments
 * @param {Object} config - Model-specific configuration
 * @returns {Function} Transform function that modifies messages and options
 */
export function createModelTransform(config = {}) {
    return function modelTransform(messages, options) {
        const processedOptions = { ...options };
        let processedMessages = [...messages];

        // Apply model-specific parameter fixes
        if (config.seedFix === 'null') {
            if (processedOptions.seed !== undefined) {
                console.log(`Setting seed to null for model (was: ${processedOptions.seed})`);
                processedOptions.seed = null;
            }
        }

        // Handle model name overrides (for random selection models)
        if (config.modelNameOverride) {
            if (typeof config.modelNameOverride === 'function') {
                const newModelName = config.modelNameOverride();
                console.log(`Overriding model name to: ${newModelName}`);
                processedOptions.model = newModelName;
            } else if (typeof config.modelNameOverride === 'string') {
                processedOptions.model = config.modelNameOverride;
            }
        }

        // Add tools if specified
        if (config.tools) {
            processedOptions.tools = [...(processedOptions.tools || []), ...config.tools];
        }

        // Apply parameter filtering
        if (config.allowedParameters) {
            const filteredOptions = {};
            
            // Only include parameters that are in the allow list
            for (const param of config.allowedParameters) {
                if (processedOptions[param] !== undefined) {
                    filteredOptions[param] = processedOptions[param];
                }
            }

            // Preserve special internal properties
            if (processedOptions._additionalHeaders) {
                filteredOptions._additionalHeaders = processedOptions._additionalHeaders;
            }

            Object.assign(processedOptions, filteredOptions);
        }

        // Handle system message conversion for models that don't support them
        if (config.supportsSystemMessages === false) {
            processedMessages = processedMessages.map(msg => {
                if (msg.role === 'system') {
                    return {
                        ...msg,
                        role: 'user',
                        content: `System: ${msg.content}`
                    };
                }
                return msg;
            });
        }

        return {
            messages: processedMessages,
            options: processedOptions
        };
    };
}

/**
 * Creates a random model selector transform for models that randomly select from a pool
 * @param {Array<string>} modelPool - Array of model names to randomly select from
 * @returns {Function} Transform function
 */
export function createRandomModelTransform(modelPool) {
    return createModelTransform({
        modelNameOverride: () => {
            const selectedModel = modelPool[Math.floor(Math.random() * modelPool.length)];
            return selectedModel;
        }
    });
}

/**
 * Creates a search-enabled model transform that adds Google Search tools
 * @param {string} baseModelName - The base model name to use for the actual API call
 * @returns {Function} Transform function
 */
export function createSearchModelTransform(baseModelName) {
    return createModelTransform({
        modelNameOverride: baseModelName,
        tools: [{
            type: "function",
            function: {
                name: "google_search"
            }
        }]
    });
}
