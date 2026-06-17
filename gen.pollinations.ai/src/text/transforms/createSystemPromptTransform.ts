import type {
    ChatMessage,
    TransformFn,
    TransformOptions,
    TransformResult,
} from "../types.js";

/**
 * Creates a transform that adds a default system prompt only if no system message already exists.
 *
 * An empty string is allowed: an empty system message is a deliberate value used
 * to displace the coding-agent persona some Airforce-resold models default to
 * when no system slot is present, without adding billable prompt tokens.
 */
export function createSystemPromptTransform(
    defaultSystemPrompt: string,
): TransformFn {
    if (typeof defaultSystemPrompt !== "string") {
        throw new Error("defaultSystemPrompt must be a string");
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
