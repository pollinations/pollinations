/**
 * Simple functional pipe for composing transforms
 * @param {...Function} transforms - Transform functions to compose
 * @returns {Function} Composed transform function
 */
export function pipe(...transforms) {
    return (messages, options) =>
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
 * @param {Array} tools - Tools to add
 * @returns {Function} Transform function
 */
export function addTools(tools) {
    return (messages, options) => ({
        messages,
        options: { ...options, tools: [...(options.tools || []), ...tools] },
    });
}

/**
 * Transform to add default tools only if user hasn't passed any
 * @param {Array} defaultTools - Default tools to use when none provided
 * @returns {Function} Transform function
 */
export function addDefaultTools(defaultTools) {
    return (messages, options) => ({
        messages,
        options: {
            ...options,
            // Only add defaults if no tools were passed by user
            tools: options.tools?.length ? options.tools : defaultTools,
        },
    });
}

/**
 * Simple transform to override model name
 * @param {string|Function} modelName - New model name or function that returns model name
 * @returns {Function} Transform function
 */
export function overrideModel(modelName) {
    return (messages, options) => ({
        messages,
        options: {
            ...options,
            model: typeof modelName === "function" ? modelName() : modelName,
        },
    });
}
