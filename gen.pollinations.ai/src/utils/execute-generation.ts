import { app } from "@/app.ts";
import type { GenerationExecutionResult } from "@/middleware/generation-deduplication.ts";
import type { GenerationAuthSnapshot } from "@/utils/generation-execution.ts";

async function drainResponse(response: Response): Promise<void> {
    const reader = response.body?.getReader();
    if (!reader) return;
    while (!(await reader.read()).done) {
        // Draining completes the existing cache transform/clone.
    }
}

async function settleWaitUntil(promises: Promise<unknown>[]): Promise<void> {
    let settled = 0;
    while (settled < promises.length) {
        const batch = promises.slice(settled);
        settled = promises.length;
        await Promise.allSettled(batch);
    }
}

/** Runs the same route under the Durable Object alarm's lifetime. */
export async function executeGeneration(
    request: Request,
    auth: GenerationAuthSnapshot,
    env: CloudflareBindings,
): Promise<GenerationExecutionResult> {
    const promises: Promise<unknown>[] = [];
    let cacheWrite: Promise<void> | undefined;
    const executionCtx = {
        props: { type: "generation-execution", auth },
        registerGenerationCacheWrite(promise: Promise<void>) {
            cacheWrite = promise;
        },
        waitUntil(promise: Promise<unknown>) {
            promises.push(promise);
        },
        passThroughOnException() {},
    } as ExecutionContext;

    const response = await app.fetch(request, env, executionCtx);
    await drainResponse(response);

    if (response.headers.get("x-cache") === "HIT") {
        await settleWaitUntil(promises);
        return { status: "cached" };
    }
    if (!response.ok) {
        await settleWaitUntil(promises);
        return { status: "failed", httpStatus: response.status };
    }
    if (!cacheWrite) {
        await settleWaitUntil(promises);
        return { status: "unknown" };
    }

    try {
        await cacheWrite;
    } catch {
        await settleWaitUntil(promises);
        return { status: "unknown" };
    }
    // Billing and telemetry are non-critical to cache correctness, but the
    // detached invocation still keeps them alive and observes failures.
    await settleWaitUntil(promises);
    return { status: "cached" };
}
