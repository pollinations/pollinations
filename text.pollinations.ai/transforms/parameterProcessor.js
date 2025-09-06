import debug from "debug";
import { validateTextGenerationParams } from "../utils/parameterValidators.js";

const log = debug("pollinations:transforms:parameters");

/**
 * Transform that processes sampling parameters and parameter filtering
 * @param {Array} messages - Array of message objects
 * @param {Object} options - Request options with _modelConfig and _modelDef
 * @returns {Object} Object with messages and processed options
 */
export function processParameters(messages, options) {
    if (!options._modelConfig || !options._modelDef) {
        return { messages, options };
    }

    const config = options._modelConfig;
    const modelConfig = options._modelDef;
    const virtualModelName = options._virtualModelName;
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
        log(`Applying parameter filter for model ${virtualModelName}, allowing only: ${allowedParams.join(", ")}`);

        const filteredOptions = {};
        
        // Only include allowed parameters
        for (const param of allowedParams) {
            if (updatedOptions[param] !== undefined) {
                filteredOptions[param] = updatedOptions[param];
            }
        }

        // Preserve internal properties
        if (updatedOptions._additionalHeaders) {
            filteredOptions._additionalHeaders = updatedOptions._additionalHeaders;
        }
        if (updatedOptions._modelConfig) {
            filteredOptions._modelConfig = updatedOptions._modelConfig;
        }
        if (updatedOptions._modelDef) {
            filteredOptions._modelDef = updatedOptions._modelDef;
        }
        if (updatedOptions._virtualModelName) {
            filteredOptions._virtualModelName = updatedOptions._virtualModelName;
        }

        return { messages, options: filteredOptions };
    }

    return { messages, options: updatedOptions };
}
