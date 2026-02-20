interface TransformResult {
    messages: unknown[];
    options: Record<string, any>;
}

type Transform = (
    messages: unknown[],
    options: Record<string, any>,
) => TransformResult;

/**
 * Composes multiple transforms into a single transform, applying them left to right.
 */
export function pipe(...transforms: Transform[]): Transform {
    return (messages, options) =>
        transforms.reduce<TransformResult>(
            (acc, transform) => transform(acc.messages, acc.options),
            { messages, options },
        );
}

/**
 * Creates a transform that always appends the given tools to existing tools.
 */
export function addTools(tools: unknown[]): Transform {
    return (messages, options) => ({
        messages,
        options: { ...options, tools: [...(options.tools || []), ...tools] },
    });
}

/**
 * Creates a transform that sets default tools only if the user hasn't provided any.
 * Respects explicit empty arrays (user intent to disable tools).
 */
export function addDefaultTools(defaultTools: unknown[]): Transform {
    return (messages, options) => ({
        messages,
        options: {
            ...options,
            tools: options.tools !== undefined ? options.tools : defaultTools,
        },
    });
}

/**
 * Creates a transform that overrides the model name.
 */
export function overrideModel(modelName: string | (() => string)): Transform {
    return (messages, options) => ({
        messages,
        options: {
            ...options,
            model: typeof modelName === "function" ? modelName() : modelName,
        },
    });
}
