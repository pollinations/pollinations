import debug from "debug";
import type {
    ChatMessage,
    TransformOptions,
    TransformResult,
} from "../types.js";

const log = debug("pollinations:transforms:sanitizer");

/**
 * Transform that sanitizes messages by replacing empty user content with placeholder text.
 */
export function sanitizeMessages(
    messages: ChatMessage[],
    options: TransformOptions,
): TransformResult {
    if (
        !Array.isArray(messages) ||
        !options.modelDef ||
        !options.requestedModel
    ) {
        return { messages, options };
    }

    let replacedCount = 0;
    const sanitized = messages.map((message) => {
        if (message.role !== "user") return message;

        const isEmpty =
            !message.content ||
            (typeof message.content === "string" &&
                message.content.trim() === "") ||
            (Array.isArray(message.content) && message.content.length === 0);

        if (!isEmpty) return message;

        replacedCount++;
        return { ...message, content: "Please provide a response." };
    });

    if (replacedCount > 0) {
        log(
            `Replaced ${replacedCount} empty user message content with placeholder`,
        );
    }

    return { messages: sanitized, options };
}
