import type { TransformFn } from "../types.js";

export function omitParameters(...names: string[]): TransformFn {
    return (messages, options) => {
        const updated = { ...options };
        for (const name of names) delete updated[name];
        return { messages, options: updated };
    };
}

/** Bedrock Claude accepts temperature or top_p, but not both. */
export const preferTemperature: TransformFn = (messages, options) => {
    const updated = { ...options };
    if (updated.temperature !== undefined) delete updated.top_p;
    return { messages, options: updated };
};
