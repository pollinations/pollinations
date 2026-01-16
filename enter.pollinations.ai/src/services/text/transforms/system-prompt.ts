/**
 * Creates a system prompt transform function that adds a default system prompt
 * only if no system message already exists in the conversation
 * @param defaultSystemPrompt - The default system prompt to add
 * @returns Transform function that conditionally adds system prompt
 */
export function createSystemPromptTransform(defaultSystemPrompt: string) {
    if (!defaultSystemPrompt || typeof defaultSystemPrompt !== "string") {
        throw new Error("defaultSystemPrompt must be a non-empty string");
    }

    return function transform(
        messages: Array<{ role: string; content: string }>,
        options: Record<string, unknown>,
    ) {
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
 * Converts system messages to user messages for models that don't support system messages
 */
function convertSystemToUserMessages(
    messages: Array<{ role: string; content: string }>,
) {
    if (!Array.isArray(messages) || messages.length === 0) {
        return messages;
    }

    return messages.map((msg) => {
        if (msg.role === "system") {
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
 * Transform that removes system messages by converting them to user messages
 */
export function removeSystemMessages(
    messages: Array<{ role: string; content: string }>,
    options: Record<string, unknown>,
) {
    return {
        messages: convertSystemToUserMessages(messages),
        options,
    };
}
