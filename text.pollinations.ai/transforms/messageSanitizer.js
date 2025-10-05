import debug from "debug";

const log = debug("pollinations:transforms:sanitizer");

/**
 * Sanitizes messages by replacing empty user content with placeholder text
 * @param {Array} messages - Array of message objects
 * @param {Object} modelConfig - Model configuration object
 * @param {string} requestedModel - Requested model name for logging
 * @returns {Object} Object with sanitized messages and replacement count
 */
function sanitizeMessagesWithPlaceholder(messages, modelConfig, requestedModel) {
    if (!Array.isArray(messages)) {
        return { messages, replacedCount: 0 };
    }

    let replacedCount = 0;
    const sanitized = messages.map(message => {
        if (message.role === 'user') {
            // Check if content is empty, considering different types
            const isEmpty = !message.content || 
                           (typeof message.content === 'string' && message.content.trim() === '') ||
                           (Array.isArray(message.content) && message.content.length === 0);
            
            if (isEmpty) {
                replacedCount++;
                return {
                    ...message,
                    content: 'Please provide a response.'
                };
            }
        }
        return message;
    });

    return { messages: sanitized, replacedCount };
}

/**
 * Transform that sanitizes messages and applies provider-specific fixes
 * @param {Array} messages - Array of message objects
 * @param {Object} options - Request options with modelDef and requestedModel
 * @returns {Object} Object with messages and options
 */
export function sanitizeMessages(messages, options) {
    if (!Array.isArray(messages) || !options.modelDef || !options.requestedModel) {
        return { messages, options };
    }

    const { messages: sanitized, replacedCount } = sanitizeMessagesWithPlaceholder(
        messages,
        options.modelDef,
        options.requestedModel
    );

    if (replacedCount > 0) {
        log(`Replaced ${replacedCount} empty user message content with placeholder`);
    }

    return {
        messages: sanitized,
        options
    };
}
