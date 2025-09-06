import debug from "debug";

const log = debug("pollinations:transforms:limits");

/**
 * Transform that checks character and token limits and sets max_tokens
 * @param {Array} messages - Array of message objects
 * @param {Object} options - Request options with modelDef and modelConfig
 * @returns {Object} Object with messages and modified options
 */
export function checkLimits(messages, options) {
    if (!options.modelDef) {
        return { messages, options };
    }

    const modelConfig = options.modelDef;
    const config = options.modelConfig;
    const updatedOptions = { ...options };

    // Check character limit
    if (modelConfig.maxInputChars) {
        const totalChars = countMessageCharacters(messages);
        if (totalChars > modelConfig.maxInputChars) {
            throw new Error(
                `Input text exceeds maximum length of ${modelConfig.maxInputChars} characters for model ${options.model} (current: ${totalChars})`
            );
        }
    }

    // Set max_tokens if not provided
    if (!updatedOptions.max_tokens) {
        if (modelConfig.maxTokens) {
            log(`Setting max_tokens to model-specific value: ${modelConfig.maxTokens}`);
            updatedOptions.max_tokens = modelConfig.maxTokens;
        } else if (config["max-tokens"]) {
            log(`Setting max_tokens to default value: ${config["max-tokens"]}`);
            updatedOptions.max_tokens = config["max-tokens"];
        }
    }

    return { messages, options: updatedOptions };
}

function countMessageCharacters(messages) {
    return messages.reduce((total, message) => {
        if (typeof message.content === "string") {
            return total + message.content.length;
        }
        if (Array.isArray(message.content)) {
            return total + message.content.reduce((sum, part) => {
                if (part.type === "text") {
                    return sum + part.text.length;
                }
                return sum;
            }, 0);
        }
        return total;
    }, 0);
}
