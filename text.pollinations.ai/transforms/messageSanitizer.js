import debug from "debug";

const log = debug("pollinations:transforms:sanitizer");

/**
 * Sanitizes messages by replacing empty user content with placeholder text
 * @param {Array} messages - Array of message objects
 * @param {Object} modelConfig - Model configuration object
 * @param {string} virtualModelName - Virtual model name for logging
 * @returns {Object} Object with sanitized messages and replacement count
 */
function sanitizeMessagesWithPlaceholder(messages, modelConfig, virtualModelName) {
    if (!Array.isArray(messages)) {
        return { messages, replacedCount: 0 };
    }

    let replacedCount = 0;
    const sanitized = messages.map(message => {
        if (message.role === 'user' && (!message.content || message.content.trim() === '')) {
            replacedCount++;
            return {
                ...message,
                content: 'Please provide a response.'
            };
        }
        return message;
    });

    return { messages: sanitized, replacedCount };
}

/**
 * Transform that sanitizes messages and applies provider-specific fixes
 * @param {Array} messages - Array of message objects
 * @param {Object} options - Request options with modelDef and virtualModelName
 * @returns {Object} Object with messages and options
 */
export function sanitizeMessages(messages, options) {
    if (!Array.isArray(messages) || !options.modelDef || !options.virtualModelName) {
        return { messages, options };
    }

    const { messages: sanitized, replacedCount } = sanitizeMessagesWithPlaceholder(
        messages,
        options.modelDef,
        options.virtualModelName
    );

    if (replacedCount > 0) {
        log(`Replaced ${replacedCount} empty user message content with placeholder`);
    }

    return {
        messages: sanitized,
        options
    };
}
