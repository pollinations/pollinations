import { handleError } from "@shared/error.ts";
import { Hono } from "hono";
import type { Env } from "@/env.ts";
import { authFromSnapshot } from "@/middleware/auth.ts";
import { balance } from "@/middleware/balance.ts";
import type {
    GenerationErrorSnapshot,
    GenerationJob,
    GenerationJobHead,
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
    job: GenerationJob,
    registerCacheWrite: (promise: Promise<void>) => void,
): Hono<Env> {
    const executor = new Hono<Env>()
        .use("*", async (c, next) => {
            c.set("requestId", job.requestId);
            c.header("X-Request-Id", job.requestId);
            await next();
        })
        .use("*", logger)
        .use("*", authFromSnapshot(job.auth))
        .use("*", async (c, next) => {
            c.set("generationExecution", {
                cacheKey: job.cache.key,
                originalPath: job.request.originalPath,
                originalModel: job.request.originalModel,
                registerCacheWrite,
            });
            await next();
        })
        .use("*", frontendKeyBilling)
        .use("*", balance)
        .use("*", async (c, next) => {
            c.var.balance.balanceCheckResult = job.balanceCheckResult;
            c.var.balance.apiKeyBudgetEstimate = job.apiKeyBudgetEstimate;
            await next();
        })
        .route("/", generationExecutorRoutes);
    executor.onError(handleError);
    return executor;
}

/** Runs a provider handler for the coordinator alarm that owns the job. */
export async function executeGeneration(
    job: GenerationJob,
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

    const request = new Request(job.request.url, {
        method: job.request.method,
        headers: job.request.headers,
        body: job.request.body?.slice().buffer,
    });
    const response = await generationExecutor(job, (promise) => {
        cacheWrite = promise;
    }).fetch(request, env, executionCtx);
    const settlement = Promise.allSettled(promises).then(() => {});

    try {
        const failed = !response.ok;
        const error = failed ? await captureError(response) : undefined;
        if (!failed) await drainResponse(response);

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
        // This execution produced a fresh cache entry (the R2 has() pre-check
        // inside missed), so the requester experienced a MISS, not a HIT.
        return { result: { status: "generated" }, settlement };
    } catch (error) {
        await settlement;
        throw error;
    }
}

export const GENERATION_HANDOFF_PATH = "/internal/generation";
export const GENERATION_HANDOFF_HEADER = "x-generation-handoff";

/** JSON form of an outcome; the error body travels as base64. */
type HandoffOutcome =
    | { status: "cached" }
    | { status: "generated" }
    | {
          status: "failed";
          error: Omit<GenerationErrorSnapshot, "body"> & { body: string };
      };

export async function readHandoffResponse(
    response: Response,
): Promise<GenerationOutcome> {
    if (!response.ok) {
        throw new Error(`Generation handoff returned HTTP ${response.status}`);
    }
    const outcome = await response.json<HandoffOutcome>();
    if (outcome.status !== "failed") return outcome;
    const body = new Uint8Array(Buffer.from(outcome.error.body, "base64"));
    return { status: "failed", error: { ...outcome.error, body } };
}

function handoffOutcome(outcome: GenerationOutcome): HandoffOutcome {
    if (outcome.status !== "failed") return outcome;
    const body = Buffer.from(outcome.error.body).toString("base64");
    return { status: "failed", error: { ...outcome.error, body } };
}

/** Runs a job handed off by a coordinator alarm, under this request's zone. */
export const generationHandoffRoutes = new Hono<Env>().post(
    "/:id{[0-9a-f]{64}}",
    async (c) => {
        const coordinators = c.env.GENERATION_COORDINATOR;
        let id: DurableObjectId;
        try {
            id = coordinators.idFromString(c.req.param("id"));
        } catch {
            return c.notFound();
        }
        // RPC typing can't map the auth snapshot; the value is unchanged.
        const job = (await coordinators
            .get(id)
            .takeHandoff(
                c.req.header(GENERATION_HANDOFF_HEADER) ?? "",
            )) as GenerationJobHead | null;
        if (!job) return c.notFound();
        const body = new Uint8Array(await c.req.arrayBuffer());
        const { result, settlement } = await executeGeneration(
            {
                ...job,
                request: {
                    ...job.request,
                    ...(body.byteLength > 0 && { body }),
                },
            },
            c.env,
        );
        c.executionCtx.waitUntil(settlement);
        return c.json(handoffOutcome(result));
    },
);
