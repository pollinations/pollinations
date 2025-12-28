/**
 * Creates a message transform function that prepends a system message
 * @param {string} systemMessage - The system message to prepend
 * @returns {Function} Transform function that modifies messages and options
 * @example
 * const transform = createMessageTransform("You are a helpful assistant.");
 * const result = transform([{role: "user", content: "Hello"}], {});
 * // Returns: { messages: [{role: "system", content: "You are a helpful assistant."}, {role: "user", content: "Hello"}], options: {} }
 */
export function createMessageTransform(systemMessage) {
    if (!systemMessage || typeof systemMessage !== "string") {
        throw new Error("systemMessage must be a non-empty string");
    }

    return function transform(messages, options) {
        if (!Array.isArray(messages)) {
            throw new Error("messages must be an array");
        }
        if (!options || typeof options !== "object") {
            throw new Error("options must be an object");
        }

        // Extract any existing system messages
        const systemMessages = messages.filter(
            (message) => message.role === "system",
        );
        const filteredMessages = messages.filter(
            (message) => message.role !== "system",
        );

        // Determine the final system message content
        let finalSystemContent = systemMessage;

        // If there are existing system messages, combine all of them with the preset system message
        if (systemMessages.length > 0) {
            const existingSystemContent = systemMessages
                .map((msg) => msg.content)
                .join("\n\n");
            finalSystemContent = `${systemMessage}\n\n${existingSystemContent}`;
        }

        // Return transformed messages and options
        return {
            messages: [
                { role: "system", content: finalSystemContent },
                ...filteredMessages,
            ],
            options,
        };
    };
}
