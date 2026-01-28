import debug from "debug";
// Import the new cleaning utilities
import {
    cleanNullAndUndefined as newCleanNullAndUndefined,
    cleanUndefined as newCleanUndefined,
} from "./utils/objectCleaners.js";

const log = debug("pollinations:utils");
const errorLog = debug("pollinations:utils:error");

/**
 * Validates and ensures each message has required properties
 * @param {Array} messages - Array of message objects
 * @returns {Array} - Validated and normalized messages
 */
export function validateAndNormalizeMessages(messages) {
    if (!Array.isArray(messages) || messages.length === 0) {
        throw new Error("Messages must be a non-empty array");
    }

    return messages.map((msg) => {
        // Create a base message with required properties
        const normalizedMsg = {
            role: msg.role || "user",
            content: msg.content || "",
        };

        // Preserve properties needed for function calling
        if (msg.tool_call_id) normalizedMsg.tool_call_id = msg.tool_call_id;
        if (msg.name) normalizedMsg.name = msg.name;
        if (msg.tool_calls) normalizedMsg.tool_calls = msg.tool_calls;

        // Preserve all Gemini-specific thought fields
        Object.keys(msg).forEach((key) => {
            if (key.startsWith("thought") || key === "thought") {
                normalizedMsg[key] = msg[key];
            }
        });

        return normalizedMsg;
    });
}

/**
 * Converts system messages to user messages for models that don't support system messages
 * @param {Array} messages - Array of message objects
 * @returns {Array} - Messages array with system messages converted to user messages
 */
export function convertSystemToUserMessages(messages) {
    if (!Array.isArray(messages) || messages.length === 0) {
        return messages;
    }

    log("Converting system messages to user messages");

    return messages.map((msg) => {
        if (msg.role === "system") {
            log(
                "Converting system message to user message:",
                `${msg.content.substring(0, 50)}...`,
            );
            return {
                ...msg,
                role: "user",
                content: `System instruction: ${msg.content}`,
            };
        }
        return msg;
    });
}

/**
 * Ensures a system message is present in the messages array
 * @param {Array} messages - Array of message objects
 * @param {Object} options - Options object
 * @param {string} defaultSystemPrompt - Default system prompt to use if none exists
 * @returns {Array} - Messages array with system message
 */
export function ensureSystemMessage(
    messages,
    options,
    defaultSystemPrompt = "You are a helpful assistant.",
) {
    // If there's already a system message, or if defaultSystemPrompt is null/undefined, don't add one
    if (
        messages.some((message) => message.role === "system") ||
        defaultSystemPrompt === null ||
        defaultSystemPrompt === undefined
    ) {
        // Still handle jsonMode for existing system messages
        if (options.jsonMode) {
            return messages.map((message) => {
                if (
                    message.role === "system" &&
                    !message.content.toLowerCase().includes("json")
                ) {
                    return {
                        ...message,
                        content: `${message.content} Respond with JSON.`,
                    };
                }
                return message;
            });
        }
        return messages;
    }

    // Add a system message with appropriate content
    const systemContent = options.jsonMode
        ? "Respond in simple JSON format"
        : defaultSystemPrompt;

    return [{ role: "system", content: systemContent }, ...messages];
}

/**
 * Normalizes options with default values
 * @param {Object} options - User provided options
 * @param {Object} defaults - Default option values
 * @returns {Object} - Normalized options with defaults applied
 */
export function normalizeOptions(options = {}, defaults = {}) {
    const normalized = { ...defaults, ...options };

    // Handle streaming option - ensure it's properly normalized to a boolean
    if (normalized.stream !== undefined) {
        // Convert string 'true' to boolean true
        if (
            normalized.stream === "true" ||
            normalized.stream === "1" ||
            normalized.stream === "yes"
        ) {
            normalized.stream = true;
            log(
                'Normalized stream option from string "%s" to boolean true',
                options.stream,
            );
        } else if (
            normalized.stream === "false" ||
            normalized.stream === "0" ||
            normalized.stream === "no"
        ) {
            normalized.stream = false;
            log(
                'Normalized stream option from string "%s" to boolean false',
                options.stream,
            );
        } else {
            normalized.stream = Boolean(normalized.stream);
            log(
                'Normalized stream option from "%s" to boolean %s',
                options.stream,
                normalized.stream,
            );
        }
    } else {
        normalized.stream = false;
        log("Stream option not provided, defaulting to false");
    }

    // Log the normalized stream option for debugging
    if (normalized.stream) {
        log(
            "Streaming mode enabled, original value: %s, normalized: %s",
            options.stream,
            normalized.stream,
        );
    }

    // Handle special cases for common options
    if (normalized.temperature !== undefined) {
        // Ensure temperature is within valid range (0-3)
        normalized.temperature = Math.max(
            0,
            Math.min(3, normalized.temperature),
        );
    }

    if (normalized.top_p !== undefined) {
        // Ensure top_p is within valid range (0-1)
        normalized.top_p = Math.max(0, Math.min(1, normalized.top_p));
    }

    if (normalized.presence_penalty !== undefined) {
        // Ensure presence_penalty is within valid range (-2 to 2)
        normalized.presence_penalty = Math.max(
            -2,
            Math.min(2, normalized.presence_penalty),
        );
    }

    if (normalized.frequency_penalty !== undefined) {
        // Ensure frequency_penalty is within valid range (-2 to 2)
        normalized.frequency_penalty = Math.max(
            -2,
            Math.min(2, normalized.frequency_penalty),
        );
    }

    if (normalized.repetition_penalty !== undefined) {
        // Ensure repetition_penalty is within valid range (typically 1.0 to 2.0, but allow wider)
        normalized.repetition_penalty = Math.max(
            0,
            Math.min(2, normalized.repetition_penalty),
        );
    }

    // // Handle maxTokens parameter
    // if (normalized.maxTokens === undefined) {
    //   // If not provided, use default value
    //   normalized.maxTokens = defaults.maxTokens || 8192;
    //   log('maxTokens option not provided, defaulting to %d', normalized.maxTokens);
    // } else if (normalized.maxTokens <= 0) {
    //   // Reset to default if invalid
    //   normalized.maxTokens = defaults.maxTokens || 8192;
    //   log('Invalid maxTokens value (%s), defaulting to %d', options.maxTokens, normalized.maxTokens);
    // } else {
    //   log('Using maxTokens value: %d', normalized.maxTokens);
    // }

    if (typeof normalized.seed === "number") {
        // Ensure seed is an integer
        normalized.seed = Math.floor(normalized.seed);
    }

    // Handle maxTokens -> max_tokens mapping
    if (normalized.maxTokens !== undefined) {
        normalized.max_tokens = normalized.maxTokens;
        delete normalized.maxTokens;
    }

    // Handle jsonMode -> response_format conversion
    if (normalized.jsonMode) {
        if (!normalized.response_format) {
            normalized.response_format = { type: "json_object" };
        }
        delete normalized.jsonMode;
    }

    return normalized;
}

/**
 * Formats a response to match OpenAI's format
 * @param {Object} response - Provider response
 * @param {string} modelName - Model name
 * @returns {Object} - OpenAI-compatible response
 */
export function formatToOpenAIResponse(response, modelName) {
    // If already in OpenAI format with choices array, return as is
    if (response.choices && Array.isArray(response.choices)) {
        return response;
    }

    // If it's an error response, return it directly
    if (response.error) {
        return response;
    }

    // Create a message object based on the response
    const message = {
        role: "assistant",
    };

    // Handle different response formats
    if (typeof response === "string") {
        message.content = response;
    } else if (response.tool_calls) {
        // If the response has tool_calls, include them in the message
        message.tool_calls = response.tool_calls;
        message.content = response.content || "";
    } else {
        // For other object responses, stringify them
        message.content = JSON.stringify(response);
    }

    // Create a basic OpenAI-compatible response structure
    return {
        id: `pllns_${Date.now().toString(36)}`,
        object: "chat.completion",
        created: Date.now(),
        model: modelName,
        choices: [
            {
                message,
                finish_reason: "stop",
                index: 0,
            },
        ],
        usage: {
            prompt_tokens: 0,
            completion_tokens: 0,
            total_tokens: 0,
        },
    };
}

/**
 * Generates a unique request ID
 * @returns {string} - Unique request ID
 */
export function generateRequestId() {
    return Math.random().toString(36).substring(7);
}

/**
 * Removes undefined values from an object
 * @param {Object} obj - Object to clean
 * @returns {Object} - Object without undefined values
 */
export function cleanUndefined(obj) {
    return newCleanUndefined(obj);
}

/**
 * Removes undefined and null values from an object
 * @param {Object} obj - Object to clean
 * @returns {Object} - Object without undefined or null values
 */
export function cleanNullAndUndefined(obj) {
    return newCleanNullAndUndefined(obj);
}

/**
 * Creates a standardized error response
 * @param {Error} error - Error object
 * @returns {Object} - Standardized error response
 */
export function createErrorResponse(error) {
    errorLog(`Error:`, error);

    return {
        error: {
            message: error.message || "An unexpected error occurred",
            code: error.code || 500,
        },
    };
}
