import { convertSystemToUserMessages } from "../textGenerationUtils.ts";

/**
 * Creates a system prompt transform function that adds a default system prompt
 * only if no system message already exists in the conversation
 * @param {string} defaultSystemPrompt - The default system prompt to add
 * @returns {Function} Transform function that conditionally adds system prompt
 * @example
 * const transform = createSystemPromptTransform("You are a helpful assistant.");
 * const result = transform([{role: "user", content: "Hello"}], {});
 * // Returns: { messages: [{role: "system", content: "You are a helpful assistant."}, {role: "user", content: "Hello"}], options: {} }
 */
export function createSystemPromptTransform(defaultSystemPrompt) {
    if (!defaultSystemPrompt || typeof defaultSystemPrompt !== "string") {
        throw new Error("defaultSystemPrompt must be a non-empty string");
    }

    return function transform(messages, options) {
        if (!Array.isArray(messages)) {
            throw new Error("messages must be an array");
        }
        if (!options || typeof options !== "object") {
            throw new Error("options must be an object");
        }

        // Check if there's already a system message
        const hasSystemMessage = messages.some(
            (message) => message.role === "system",
        );

        // If there's already a system message, don't override it
        if (hasSystemMessage) {
            return {
                messages,
                options,
            };
        }

        // Add the default system prompt at the beginning
        const messagesWithSystemPrompt = [
            { role: "system", content: defaultSystemPrompt },
            ...messages,
        ];

        return {
            messages: messagesWithSystemPrompt,
            options,
        };
    };
}

/**
 * Transform that removes system messages by converting them to user messages
 * @param {Array} messages - Array of message objects
 * @param {Object} options - Request options
 * @returns {Object} Object with converted messages and options
 */
export function removeSystemMessages(messages, options) {
    return {
        messages: convertSystemToUserMessages(messages),
        options,
    };
}
