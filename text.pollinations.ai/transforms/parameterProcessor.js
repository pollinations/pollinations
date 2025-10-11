import debug from "debug";
import { validateTextGenerationParams } from "../utils/parameterValidators.js";

const log = debug("pollinations:transforms:parameters");

/**
 * Transform that processes sampling parameters and parameter filtering
 * @param {Array} messages - Array of message objects
 * @param {Object} options - Request options with modelConfig and modelDef
 * @returns {Object} Object with messages and processed options
 */
export function processParameters(messages, options) {
    if (!options.modelConfig || !options.modelDef) {
        return { messages, options };
    }

    const config = options.modelConfig;
    const modelConfig = options.modelDef;
    const requestedModel = options.requestedModel;
    const updatedOptions = { ...options };

    // Apply model-specific sampling parameter defaults
    const samplingParams = ["temperature", "top_p", "presence_penalty", "frequency_penalty"];
    samplingParams.forEach((param) => {
        if (updatedOptions[param] === undefined && config[param] !== undefined) {
            log(`Setting ${param} to model default value: ${config[param]}`);
            updatedOptions[param] = config[param];
        }
    });

    // Apply parameter filtering if defined
    if (modelConfig.allowedParameters) {
        const allowedParams = modelConfig.allowedParameters;
        log(`Applying parameter filter for model ${requestedModel}, allowing only: ${allowedParams.join(", ")}`);

        const filteredOptions = {};
        
        // Only include allowed parameters
        for (const param of allowedParams) {
            if (updatedOptions[param] !== undefined) {
                filteredOptions[param] = updatedOptions[param];
            }
        }

        // Preserve internal properties
        if (updatedOptions.additionalHeaders) {
            filteredOptions.additionalHeaders = updatedOptions.additionalHeaders;
        }
        if (updatedOptions.modelConfig) {
            filteredOptions.modelConfig = updatedOptions.modelConfig;
        }
        if (updatedOptions.modelDef) {
            filteredOptions.modelDef = updatedOptions.modelDef;
        }
        if (updatedOptions.requestedModel) {
            filteredOptions.requestedModel = updatedOptions.requestedModel;
        }

        return { messages, options: filteredOptions };
    }

    return { messages, options: updatedOptions };
}
