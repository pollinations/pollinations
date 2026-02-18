import { convertSystemToUserMessages } from "../textGenerationUtils.js";

interface Message {
    role: string;
    content: string;
}

type TransformResult = {
    messages: Message[];
    options: Record<string, unknown>;
};

/**
 * Creates a transform that adds a default system prompt only if no system message already exists.
 */
export function createSystemPromptTransform(
    defaultSystemPrompt: string,
): (messages: Message[], options: Record<string, unknown>) => TransformResult {
    if (!defaultSystemPrompt || typeof defaultSystemPrompt !== "string") {
        throw new Error("defaultSystemPrompt must be a non-empty string");
    }

    return function transform(
        messages: Message[],
        options: Record<string, unknown>,
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

/**
 * Transform that converts system messages to user messages for providers that don't support system role.
 */
export function removeSystemMessages(
    messages: Message[],
    options: Record<string, unknown>,
): TransformResult {
    return {
        messages: convertSystemToUserMessages(messages),
        options,
    };
}
