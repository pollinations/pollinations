import debug from "debug";
import type {
    ChatMessage,
    TransformOptions,
    TransformResult,
} from "../types.js";

const log = debug("pollinations:transforms:merge");

/**
 * Merges consecutive messages with the same role into a single message.
 * Fixes "user/assistant messages should alternate" errors from providers like Perplexity.
 */
export function mergeConsecutiveMessages(
    messages: ChatMessage[],
    options: TransformOptions,
): TransformResult {
    if (!Array.isArray(messages) || messages.length <= 1) {
        return { messages, options };
    }

    const merged: ChatMessage[] = [];
    let mergeCount = 0;

    for (const msg of messages) {
        const prev = merged[merged.length - 1];

        // Only merge if same role, both have string content, and not tool/function messages
        if (
            prev &&
            prev.role === msg.role &&
            typeof prev.content === "string" &&
            typeof msg.content === "string" &&
            !msg.tool_call_id &&
            !msg.tool_calls
        ) {
            prev.content = `${prev.content}\n\n${msg.content}`;
            mergeCount++;
        } else {
            merged.push({ ...msg });
        }
    }

    if (mergeCount > 0) {
        log(`Merged ${mergeCount} consecutive same-role messages`);
    }

    return { messages: merged, options };
}
