import debug from "debug";
import type {
    ChatMessage,
    TransformOptions,
    TransformResult,
} from "../types.js";

const log = debug("pollinations:transforms:normalize-content");

/**
 * Custom-host patterns for providers that only accept plain-string `content`
 * and reject multi-part content arrays or extra fields like `cache_control`.
 */
const STRING_ONLY_HOSTS = ["api.fireworks.ai", "dashscope"];

/**
 * Returns true when the resolved model config targets a provider that
 * cannot handle multi-part content arrays (e.g. Fireworks / DashScope).
 */
function requiresStringContent(
    config: Record<string, unknown> | undefined,
): boolean {
    if (!config) return false;
    const host = config["custom-host"] as string | undefined;
    if (!host) return false;
    return STRING_ONLY_HOSTS.some((pattern) => host.includes(pattern));
}

/**
 * Flatten multi-part content arrays into plain strings and strip
 * unsupported fields (e.g. `cache_control`) for providers that require it.
 *
 * Input like:
 *   [{ type: "text", text: "Hello", cache_control: { type: "ephemeral" } }]
 * becomes:
 *   "Hello"
 */
export function normalizeContent(
    messages: ChatMessage[],
    options: TransformOptions,
): TransformResult {
    const config = options.modelConfig as Record<string, unknown> | undefined;

    if (!requiresStringContent(config)) {
        return { messages, options };
    }

    let changed = 0;
    const normalized = messages.map((msg) => {
        if (!Array.isArray(msg.content)) return msg;

        const textParts: string[] = [];
        for (const part of msg.content) {
            if (
                typeof part === "object" &&
                part !== null &&
                (part as Record<string, unknown>).type === "text"
            ) {
                textParts.push(
                    (part as Record<string, unknown>).text as string,
                );
            } else if (typeof part === "string") {
                textParts.push(part);
            }
        }

        if (textParts.length > 0) {
            changed++;
            return { ...msg, content: textParts.join("\n") };
        }

        return msg;
    });

    if (changed > 0) {
        log(
            `Normalized ${changed} multi-part message(s) to plain strings for host: ${config?.["custom-host"]}`,
        );
    }

    return { messages: normalized, options };
}
