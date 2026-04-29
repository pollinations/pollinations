import type { TransformFn, TransformResult } from "../types.js";

/**
 * Composes multiple transforms into a single transform, applying them left to right.
 */
export function pipe(...transforms: TransformFn[]): TransformFn {
    return (messages, options) =>
        transforms.reduce<TransformResult | Promise<TransformResult>>(
            async (accPromise, transform) => {
                const acc = await accPromise;
                return transform(acc.messages, acc.options);
            },
            Promise.resolve({ messages, options }),
        ) as Promise<TransformResult>;
}

/**
 * Creates a transform that sets default tools only if the user hasn't provided any.
 * Respects explicit empty arrays (user intent to disable tools).
 */
export function addDefaultTools(defaultTools: unknown[]): TransformFn {
    return (messages, options) => ({
        messages,
        options: {
            ...options,
            tools: options.tools !== undefined ? options.tools : defaultTools,
        },
    });
}
