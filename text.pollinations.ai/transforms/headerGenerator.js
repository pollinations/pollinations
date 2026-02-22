import debug from "debug";
import { generatePortkeyHeaders } from "../portkeyUtils.js";

const log = debug("pollinations:transforms:headers");

/**
 * Transform that generates provider-specific headers for the request
 * @param {Array} messages - Array of message objects
 * @param {Object} options - Request options with modelConfig
 * @returns {Promise<{messages: Array, options: Object}>}
 */
export async function generateHeaders(messages, options) {
    if (!options.modelConfig) {
        return { messages, options };
    }

    const additionalHeaders = await generatePortkeyHeaders(
        options.modelConfig,
        options,
    );

    log("Generated headers:", JSON.stringify(additionalHeaders, null, 2));
    log("Input options has modelDef:", !!options.modelDef);

    const result = {
        messages,
        options: {
            ...options,
            additionalHeaders: additionalHeaders,
        },
    };

    log("Output options has modelDef:", !!result.options.modelDef);
    return result;
}
