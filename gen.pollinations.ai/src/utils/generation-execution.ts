import type { AgentRunClaims } from "@shared/auth/agent-run-token.ts";
import type { AuthenticatedApiKey, AuthUser } from "@shared/auth/api-key.ts";

export type GenerationAuthSnapshot = {
    user: Pick<AuthUser, "id" | "tier">;
    apiKey?: Omit<AuthenticatedApiKey, "rawKey">;
    agentRun?: AgentRunClaims;
};

export type GenerationExecutionProps = {
    type: "generation-execution";
    auth: GenerationAuthSnapshot;
};

type ContextWithGenerationExecution = ExecutionContext & {
    props?: unknown;
    registerGenerationCacheWrite?: (promise: Promise<void>) => void;
    getGenerationCacheWrite?: () => Promise<void> | undefined;
};

export function getGenerationExecutionProps(
    executionCtx: ExecutionContext,
): GenerationExecutionProps | null {
    const props = (executionCtx as ContextWithGenerationExecution).props;
    if (
        !props ||
        typeof props !== "object" ||
        (props as { type?: unknown }).type !== "generation-execution"
    ) {
        return null;
    }
    return props as GenerationExecutionProps;
}

export function isGenerationExecution(executionCtx: ExecutionContext): boolean {
    return getGenerationExecutionProps(executionCtx) !== null;
}

export function registerGenerationCacheWrite(
    executionCtx: ExecutionContext,
    promise: Promise<void>,
): void {
    const register = (executionCtx as ContextWithGenerationExecution)
        .registerGenerationCacheWrite;
    if (!register) {
        throw new Error("Generation cache write registrar is missing");
    }
    register(promise);
}

export function getGenerationCacheWrite(
    executionCtx: ExecutionContext,
): Promise<void> | undefined {
    return (
        executionCtx as ContextWithGenerationExecution
    ).getGenerationCacheWrite?.();
}
