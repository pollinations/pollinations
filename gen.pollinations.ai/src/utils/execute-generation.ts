import { handleError } from "@shared/error.ts";
import { requestId } from "@shared/middleware/request-id.ts";
import { Hono } from "hono";
import type { Env } from "@/env.ts";
import {
    authFromSnapshot,
    type GenerationAuthSnapshot,
} from "@/middleware/auth.ts";
import { balance } from "@/middleware/balance.ts";
import type {
    GenerationErrorSnapshot,
    GenerationOutcome,
} from "@/middleware/generation-deduplication.ts";
import { logger } from "@/middleware/logger.ts";
import { frontendKeyBilling } from "@/middleware/rate-limit-durable.ts";
import { generationExecutorRoutes } from "@/routes/generation-executor.ts";

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
    const body = new Uint8Array(
        (await response.arrayBuffer()).slice(0, ERROR_BODY_BYTES),
    );
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
    result: GenerationOutcome;
    settlement: Promise<void>;
};

function generationExecutor(
    auth: GenerationAuthSnapshot,
    registerGenerationCacheWrite: (promise: Promise<void>) => void,
): Hono<Env> {
    const executor = new Hono<Env>()
        .use("*", requestId())
        .use("*", logger)
        .use("*", authFromSnapshot(auth))
        .use("*", async (c, next) => {
            c.set("registerGenerationCacheWrite", registerGenerationCacheWrite);
            await next();
        })
        .use("*", frontendKeyBilling)
        .use("*", balance)
        .route("/", generationExecutorRoutes);
    executor.onError(handleError);
    return executor;
}

/** Runs a provider handler under the Durable Object alarm's lifetime. */
export async function executeGeneration(
    request: Request,
    auth: GenerationAuthSnapshot,
    env: CloudflareBindings,
): Promise<DetachedGeneration> {
    const promises: Promise<unknown>[] = [];
    let cacheWrite: Promise<void> | undefined;
    const executionCtx = {
        waitUntil(promise: Promise<unknown>) {
            promises.push(promise);
        },
        passThroughOnException() {},
    } as ExecutionContext;

    const response = await generationExecutor(auth, (promise) => {
        cacheWrite = promise;
    }).fetch(request, env, executionCtx);
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
        await settlement;
        throw new Error("Generation completed without a cacheable result");
    }

    try {
        await cacheWrite;
    } catch (error) {
        await settlement;
        throw error;
    }
    return { result: { status: "cached" }, settlement };
}
