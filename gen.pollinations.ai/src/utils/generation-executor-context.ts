type GenerationExecutorContext = ExecutionContext & {
    registerGenerationCacheWrite?: (promise: Promise<void>) => void;
};

export function registerGenerationCacheWrite(
    executionCtx: ExecutionContext,
    promise: Promise<void>,
): void {
    const register = (executionCtx as GenerationExecutorContext)
        .registerGenerationCacheWrite;
    if (!register) {
        throw new Error("Generation cache write registrar is missing");
    }
    register(promise);
}
