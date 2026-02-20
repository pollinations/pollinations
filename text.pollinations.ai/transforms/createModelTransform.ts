/**
 * Creates a transform that overrides the model name in options.
 */
export function createModelOverride(targetModel: string) {
    return (messages: unknown[], options: Record<string, unknown>) => ({
        messages,
        options: { ...options, model: targetModel },
    });
}
