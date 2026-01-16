/**
 * Simple functional pipe for composing transforms
 * @param transforms - Transform functions to compose
 * @returns Composed transform function
 */
export function pipe(
    ...transforms: Array<
        (
            messages: unknown[],
            options: Record<string, unknown>,
        ) => { messages: unknown[]; options: Record<string, unknown> }
    >
) {
    return (messages: unknown[], options: Record<string, unknown>) =>
        transforms.reduce(
            (acc, transform) => {
                const result = transform(acc.messages, acc.options);
                return {
                    messages: result.messages,
                    options: result.options,
                };
            },
            { messages, options },
        );
}

/**
 * Simple transform to add tools (always appends)
 * @param tools - Tools to add
 * @returns Transform function
 */
export function addTools(tools: unknown[]) {
    return (messages: unknown[], options: Record<string, unknown>) => ({
        messages,
        options: {
            ...options,
            tools: [...((options.tools as unknown[]) || []), ...tools],
        },
    });
}

/**
 * Transform to add default tools only if user hasn't passed any
 * @param defaultTools - Default tools to use when none provided
 * @returns Transform function
 */
export function addDefaultTools(defaultTools: unknown[]) {
    return (messages: unknown[], options: Record<string, unknown>) => ({
        messages,
        options: {
            ...options,
            // Only add defaults if user hasn't explicitly passed tools (even empty array)
            // Check for undefined/null, not just length, to respect user's intent to disable tools
            tools: options.tools !== undefined ? options.tools : defaultTools,
        },
    });
}

/**
 * Simple transform to override model name
 * @param modelName - New model name or function that returns model name
 * @returns Transform function
 */
export function overrideModel(modelName: string | (() => string)) {
    return (messages: unknown[], options: Record<string, unknown>) => ({
        messages,
        options: {
            ...options,
            model: typeof modelName === "function" ? modelName() : modelName,
        },
    });
}
