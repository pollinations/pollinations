import type { TransformFn } from "../types.js";

/**
 * Creates a transform that prepends a system message. The client's own
 * system messages pass through untouched after it.
 */
export function createMessageTransform(systemMessage: string): TransformFn {
    return (messages, options) => ({
        messages: [{ role: "system", content: systemMessage }, ...messages],
        options,
    });
}
