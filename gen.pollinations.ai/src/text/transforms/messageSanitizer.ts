import debug from "debug";
import type {
    ChatMessage,
    TransformOptions,
    TransformResult,
} from "../types.js";

const log = debug("pollinations:transforms:sanitizer");

/**
 * Strips Anthropic-style `cache_control` annotations from typed content parts.
 * Strict OpenAI-compatible providers (e.g. Fireworks Kimi K2.6) reject the
 * field with a 400. Non-array content is returned untouched.
 */
function stripCacheControlFromContent(content: ChatMessage["content"]) {
    if (!Array.isArray(content)) return content;

    let changed = false;
    const next = content.map((part) => {
        if (!part || typeof part !== "object" || Array.isArray(part)) {
            return part;
        }
        const record = part as Record<string, unknown>;
        if (!("cache_control" in record)) return part;

        changed = true;
        const { cache_control: _drop, ...rest } = record;
        return rest;
    });

    return changed ? next : content;
}

/**
 * Transform that sanitizes messages: replaces empty user content with a
 * placeholder, and strips Anthropic-only `cache_control` annotations from
 * typed content parts so strict upstream providers don't 400.
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
        const content = stripCacheControlFromContent(message.content);
        const base =
            content === message.content ? message : { ...message, content };

        if (base.role !== "user") return base;

        const isEmpty =
            !base.content ||
            (typeof base.content === "string" && base.content.trim() === "") ||
            (Array.isArray(base.content) && base.content.length === 0);

        if (!isEmpty) return base;

        replacedCount++;
        return { ...base, content: "Please provide a response." };
    });

    if (replacedCount > 0) {
        log(
            `Replaced ${replacedCount} empty user message content with placeholder`,
        );
    }

    return { messages: sanitized, options };
}
