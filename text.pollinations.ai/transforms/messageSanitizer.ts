import debug from "debug";

const log = debug("pollinations:transforms:sanitizer");

interface Message {
    role: string;
    content?: string | unknown[];
    [key: string]: unknown;
}

/**
 * Replaces empty user message content with placeholder text.
 */
function sanitizeEmptyUserMessages(messages: Message[]): {
    messages: Message[];
    replacedCount: number;
} {
    if (!Array.isArray(messages)) {
        return { messages, replacedCount: 0 };
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

    return { messages: sanitized, replacedCount };
}

/**
 * Transform that sanitizes messages by replacing empty user content with placeholder text.
 */
export function sanitizeMessages(
    messages: Message[],
    options: Record<string, any>,
): { messages: Message[]; options: Record<string, any> } {
    if (
        !Array.isArray(messages) ||
        !options.modelDef ||
        !options.requestedModel
    ) {
        return { messages, options };
    }

    const { messages: sanitized, replacedCount } =
        sanitizeEmptyUserMessages(messages);

    if (replacedCount > 0) {
        log(
            `Replaced ${replacedCount} empty user message content with placeholder`,
        );
    }

    return { messages: sanitized, options };
}
