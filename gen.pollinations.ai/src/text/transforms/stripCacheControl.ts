import type {
    ChatMessage,
    TransformOptions,
    TransformResult,
} from "../types.js";

/**
 * Strips Anthropic-style `cache_control` annotations from typed content parts.
 *
 * Some strict OpenAI-compatible providers reject the field with a 400/422
 * (verified: Fireworks Kimi/GLM, Azure-deployed Mistral). Apply this only on
 * model entries whose upstream is known to reject it.
 */
export function stripCacheControl(
    messages: ChatMessage[],
    options: TransformOptions,
): TransformResult {
    const cleaned = messages.map((message) => {
        if (!Array.isArray(message.content)) return message;

        let changed = false;
        const content = message.content.map((part) => {
            if (!part || typeof part !== "object" || Array.isArray(part)) {
                return part;
            }
            const record = part as Record<string, unknown>;
            if (!("cache_control" in record)) return part;

            changed = true;
            const { cache_control: _drop, ...rest } = record;
            return rest;
        });

        return changed ? { ...message, content } : message;
    });

    return { messages: cleaned, options };
}
