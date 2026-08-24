import type { BalanceCheckResult } from "@shared/billing/balance.ts";
import { handleError } from "@shared/error.ts";
import { Hono } from "hono";
import type { Env } from "@/env.ts";
import {
    authFromSnapshot,
    type GenerationAuthSnapshot,
} from "@/middleware/auth.ts";
import { balance } from "@/middleware/balance.ts";
import type { GenerationBilling } from "@/middleware/billing.ts";
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

function failure(httpStatus: number, message: string): GenerationOutcome {
    return {
        status: "failed",
        error: {
            httpStatus,
            headers: [["content-type", "text/plain; charset=UTF-8"]],
            body: new TextEncoder().encode(message),
        },
    };
}

function generationExecutor(
    auth: GenerationAuthSnapshot,
    requestId: string,
    balanceCheckResult: BalanceCheckResult,
    billing: GenerationBilling,
    registerGenerationCacheWrite: (promise: Promise<void>) => void,
): Hono<Env> {
    const executor = new Hono<Env>()
        .use("*", async (c, next) => {
            c.set("requestId", requestId);
            c.header("X-Request-Id", requestId);
            await next();
        })
        .use("*", logger)
        .use("*", authFromSnapshot(auth))
        .use("*", async (c, next) => {
            c.set("registerGenerationCacheWrite", registerGenerationCacheWrite);
            c.set("billing", billing);
            await next();
        })
        .use("*", frontendKeyBilling)
        .use("*", balance)
        .use("*", async (c, next) => {
            c.var.balance.balanceCheckResult = balanceCheckResult;
            await next();
        })
        .route("/", generationExecutorRoutes);
    executor.onError(handleError);
    return executor;
}

/**
 * Runs a provider handler under the Durable Object alarm's lifetime, on the
 * Enter authorization the coordinator obtained. The result is only "cached"
 * once the durable write landed and Enter settled the request: a settlement
 * failure discards the cached output (see track) and fails the generation,
 * so nothing is ever served that was not paid for.
 */
export async function executeGeneration(
    request: Request,
    auth: GenerationAuthSnapshot,
    requestId: string,
    balanceCheckResult: BalanceCheckResult,
    authorizationId: string,
    env: CloudflareBindings,
): Promise<DetachedGeneration> {
    const promises: Promise<unknown>[] = [];
    let cacheWrite: Promise<void> | undefined;
    const billing: GenerationBilling = { authorizationId };
    const executionCtx = {
        waitUntil(promise: Promise<unknown>) {
            promises.push(promise);
        },
        passThroughOnException() {},
    } as ExecutionContext;

    const response = await generationExecutor(
        auth,
        requestId,
        balanceCheckResult,
        billing,
        (promise) => {
            cacheWrite = promise;
        },
    ).fetch(request, env, executionCtx);
    const settlement = Promise.allSettled(promises).then(() => {});

    try {
        const failed = !response.ok;
        const error = failed ? await captureError(response) : undefined;
        if (!failed) await drainResponse(response);

        if (response.headers.get("x-cache") === "HIT") {
            return { result: { status: "cached" }, settlement };
        }
        if (error) {
            // A request refused before tracking ran (no matching route,
            // validation) settles nothing, so release its authorization here.
            if (!billing.settlement) {
                await env.ENTER_GATEWAY.cancel(authorizationId).catch(
                    () => undefined,
                );
            }
            return { result: { status: "failed", error }, settlement };
        }
        if (!cacheWrite) {
            throw new Error("Generation completed without a cacheable result");
        }

        await cacheWrite;
        if (!(await billing.settlement)) {
            return {
                result: failure(502, "Generation billing failed"),
                settlement,
            };
        }
        return { result: { status: "cached" }, settlement };
    } catch (error) {
        await settlement;
        throw error;
    }
}
