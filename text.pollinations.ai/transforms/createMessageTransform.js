/**
 * Creates a message transform function that prepends a system message
 * @param {string} systemMessage - The system message to prepend
 * @returns {Function} Transform function that modifies messages and options
 */
export function createMessageTransform(systemMessage) {
    return function transform(messages, options) {
        // Extract any existing system messages
        const systemMessages = messages.filter(
            (message) => message.role === "system",
        );
        const filteredMessages = messages.filter(
            (message) => message.role !== "system",
        );

        // Determine the final system message content
        let finalSystemContent = systemMessage;

        // If there's an existing system message, append it to the preset system message with two newlines
        if (systemMessages.length > 0) {
            finalSystemContent = `${systemMessage}\n\n${systemMessages[0].content}`;
        }

        // Return transformed messages and options
        return {
            messages: [
                { role: "system", content: finalSystemContent },
                ...filteredMessages,
            ],
            options
        };
    };
}
