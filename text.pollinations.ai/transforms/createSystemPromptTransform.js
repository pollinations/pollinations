/**
 * Creates a system prompt transform function that adds a default system prompt
 * only if no system message already exists in the conversation
 * @param {string} defaultSystemPrompt - The default system prompt to add
 * @returns {Function} Transform function that conditionally adds system prompt
 */
export function createSystemPromptTransform(defaultSystemPrompt) {
    return function transform(messages, options) {
        // Check if there's already a system message
        const hasSystemMessage = messages.some(message => message.role === "system");
        
        // If there's already a system message, don't override it
        if (hasSystemMessage) {
            return {
                messages,
                options
            };
        }
        
        // Add the default system prompt at the beginning
        const messagesWithSystemPrompt = [
            { role: "system", content: defaultSystemPrompt },
            ...messages
        ];
        
        return {
            messages: messagesWithSystemPrompt,
            options
        };
    };
}
