import debug from "debug";

const log = debug("pollinations:transforms:sanitizer");

/**
 * Default configuration for message sanitization
 */
const DEFAULT_SANITIZER_CONFIG = {
    emptyUserMessagePlaceholder: 'Please provide a response.',
    enableEmptyMessageReplacement: true
};

/**
 * Sanitizes messages by replacing empty user content with placeholder text
 * @param {Array} messages - Array of message objects
 * @param {Object} modelConfig - Model configuration object
 * @param {string} virtualModelName - Virtual model name for logging
 * @param {Object} sanitizerConfig - Sanitizer configuration options
 * @returns {Object} Object with sanitized messages and replacement count
 */
function sanitizeMessagesWithPlaceholder(messages, modelConfig, virtualModelName, sanitizerConfig = {}) {
    if (!Array.isArray(messages)) {
        return { messages, replacedCount: 0 };
    }

    const config = { ...DEFAULT_SANITIZER_CONFIG, ...sanitizerConfig };
    
    if (!config.enableEmptyMessageReplacement) {
        return { messages, replacedCount: 0 };
    }

    let replacedCount = 0;
    const sanitized = messages.map(message => {
        if (message.role === 'user' && (!message.content || message.content.trim() === '')) {
            replacedCount++;
            return {
                ...message,
                content: config.emptyUserMessagePlaceholder
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

    // Get sanitizer configuration from options or model definition
    const sanitizerConfig = {
        ...options.modelDef.sanitizerConfig,
        ...options.sanitizerConfig
    };

    const { messages: sanitized, replacedCount } = sanitizeMessagesWithPlaceholder(
        messages,
        options.modelDef,
        options.virtualModelName,
        sanitizerConfig
    );

    if (replacedCount > 0) {
        const placeholder = sanitizerConfig.emptyUserMessagePlaceholder || DEFAULT_SANITIZER_CONFIG.emptyUserMessagePlaceholder;
        log(`Replaced ${replacedCount} empty user message content with: "${placeholder}"`);
    }

    return {
        messages: sanitized,
        options
    };
}
