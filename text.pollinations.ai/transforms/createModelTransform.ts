import type { TransformFn } from "../types.js";

/**
 * Creates a transform that overrides the model name in options.
 */
export function createModelOverride(targetModel: string): TransformFn {
    return (messages, options) => ({
        messages,
        options: { ...options, model: targetModel },
    });
}
