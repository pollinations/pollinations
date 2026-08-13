import { app } from "@/app.ts";
import type {
    GenerationErrorSnapshot,
    GenerationExecutionResult,
} from "@/middleware/generation-deduplication.ts";
import type { GenerationAuthSnapshot } from "@/utils/generation-execution.ts";

async function drainResponse(response: Response): Promise<void> {
    const reader = response.body?.getReader();
    if (!reader) return;
    while (!(await reader.read()).done) {
        // Draining completes the existing cache transform/clone.
    }
}

const ERROR_BODY_BYTES = 64 * 1024;
const ERROR_HEADERS = new Set(["content-type", "retry-after"]);
const ERROR_HEADER_PREFIXES = ["x-moderation-", "x-safety-"];

async function captureError(
    response: Response,
): Promise<GenerationErrorSnapshot> {
    const reader = response.body?.getReader();
    const chunks: Uint8Array[] = [];
    let capturedBytes = 0;
    if (reader) {
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            if (capturedBytes < ERROR_BODY_BYTES) {
                const remaining = ERROR_BODY_BYTES - capturedBytes;
                const chunk = value.slice(0, remaining);
                chunks.push(chunk);
                capturedBytes += chunk.byteLength;
            }
        }
    }
    const body = new Uint8Array(capturedBytes);
    let offset = 0;
    for (const chunk of chunks) {
        body.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return {
        httpStatus: response.status,
        headers: [...response.headers.entries()].filter(([name]) => {
            const lowerName = name.toLowerCase();
            return (
                ERROR_HEADERS.has(lowerName) ||
                ERROR_HEADER_PREFIXES.some((prefix) =>
                    lowerName.startsWith(prefix),
                )
            );
        }),
        body,
    };
}

export type DetachedGeneration = {
    result: GenerationExecutionResult;
    settlement: Promise<void>;
};

/** Runs the same route under the Durable Object alarm's lifetime. */
export async function executeGeneration(
    request: Request,
    auth: GenerationAuthSnapshot,
    env: CloudflareBindings,
): Promise<DetachedGeneration> {
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
    const failed = !response.ok;
    const error = failed ? await captureError(response) : undefined;
    if (!failed) await drainResponse(response);
    const settlement = Promise.allSettled(promises).then(() => {});

    if (response.headers.get("x-cache") === "HIT") {
        return { result: { status: "cached" }, settlement };
    }
    if (error) {
        return { result: { status: "failed", error }, settlement };
    }
    if (!cacheWrite) {
        throw new Error("Generation completed without a cacheable result");
    }

    await cacheWrite;
    return { result: { status: "cached" }, settlement };
}
