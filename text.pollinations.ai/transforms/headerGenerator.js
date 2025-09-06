import debug from "debug";
import { generatePortkeyHeaders } from "../portkeyUtils.js";

const log = debug("pollinations:transforms:headers");

/**
 * Transform that generates provider-specific headers for the request
 * @param {Array} messages - Array of message objects
 * @param {Object} options - Request options with _modelConfig
 * @returns {Promise<{messages: Array, options: Object}>}
 */
export async function generateHeaders(messages, options) {
    if (!options._modelConfig) {
        return { messages, options };
    }

    const additionalHeaders = await generatePortkeyHeaders(options._modelConfig);
    
    log("Generated headers:", JSON.stringify(additionalHeaders, null, 2));
    log("Input options has _modelDef:", !!options._modelDef);

    const result = {
        messages,
        options: {
            ...options,
            _additionalHeaders: additionalHeaders
        }
    };
    
    log("Output options has _modelDef:", !!result.options._modelDef);
    return result;
}
