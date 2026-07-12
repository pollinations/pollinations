import type {
    ChatMessage,
    TransformFn,
    TransformOptions,
    TransformResult,
} from "../types.js";

/**
 * Creates a transform that adds a default system prompt only if no system message already exists.
 */
export function createSystemPromptTransform(
    defaultSystemPrompt: string,
): TransformFn {
    if (!defaultSystemPrompt || typeof defaultSystemPrompt !== "string") {
        throw new Error("defaultSystemPrompt must be a non-empty string");
    }

    return function transform(
        messages: ChatMessage[],
        options: TransformOptions,
    ): TransformResult {
        if (!Array.isArray(messages)) {
            throw new Error("messages must be an array");
        }
        if (!options || typeof options !== "object") {
            throw new Error("options must be an object");
        }

        const hasSystemMessage = messages.some((msg) => msg.role === "system");

        if (hasSystemMessage) {
            return { messages, options };
        }

        return {
            messages: [
                { role: "system", content: defaultSystemPrompt },
                ...messages,
            ],
            options,
        };
    };
}
