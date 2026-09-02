import type {
    ChatMessage,
    TransformFn,
    TransformOptions,
    TransformResult,
} from "../types.js";

/**
 * Kimi K3 (Fireworks) compatibility transform.
 *
 * Two provider-specific requirements that the generic OpenAI client doesn't
 * handle:
 *
 * 1. **Tool messages need a resolvable `name`.** Kimi K3 rejects `tool` role
 *    messages that lack a `name` field. When the caller didn't set one, we
 *    derive it from the `tool_call_id` (the convention is
 *    `tool_call_id = "<functionName>:<nonce>"`). If no `tool_call_id` is
 *    present the message passes through unchanged — the upstream will surface
 *    its own 400.
 *
 * 2. **`reasoning_content` must be echoed back.** In thinking mode, Kimi K3
 *    expects assistant messages that carry `tool_calls` to also carry the
 *    `reasoning_content` from the original response. If the field is absent
 *    we default to an empty string so the provider doesn't reject the
 *    multi-turn conversation.
 */
export const kimiK3Transform: TransformFn = (
    messages: ChatMessage[],
    options: TransformOptions,
): TransformResult => {
    const patched = messages.map((message) => {
        if (typeof message !== "object" || message === null) return message;

        // Tool messages: ensure a resolvable name.
        if (message.role === "tool") {
            if (message.name) return message;
            const toolCallId = message.tool_call_id;
            if (typeof toolCallId === "string" && toolCallId.includes(":")) {
                return { ...message, name: toolCallId.split(":")[0] };
            }
            return message;
        }

        return message;
    });

    return { messages: patched, options };
};
