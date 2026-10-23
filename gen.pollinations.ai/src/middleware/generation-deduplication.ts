import type { BalanceCheckResult } from "@shared/billing/balance.ts";
import { getPublicOrigin } from "@shared/public-origin.ts";
import { getRoutePath } from "@shared/util.ts";
import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import type {
    AuthVariables,
    GenerationAuthSnapshot,
} from "@/middleware/auth.ts";
import type { BalanceVariables } from "@/middleware/balance.ts";
import type {
    GenerationCacheAdapter,
    GenerationCacheEnv,
    GenerationCacheStorage,
} from "@/middleware/generation-cache.ts";
import { hashGenerationCacheIdentity } from "@/middleware/generation-cache.ts";
import type { ModelVariables } from "@/middleware/model.ts";

export type GenerationErrorSnapshot = {
    httpStatus: number;
    headers: [string, string][];
    body: Uint8Array;
};

export type GenerationCacheIdentity = {
    storage: GenerationCacheStorage;
    key: string;
};

export type GenerationRequestSnapshot = {
    url: string;
    method: string;
    /** Public route when execution uses an adapted native request. */
    originalPath?: string;
    originalModel?: string;
    headers: [string, string][];
    body?: Uint8Array;
};

export type GenerationJob = {
    cache: GenerationCacheIdentity;
    request: GenerationRequestSnapshot;
    auth: GenerationAuthSnapshot;
    requestId: string;
    balanceCheckResult: BalanceCheckResult;
    apiKeyBudgetEstimate?: number;
};

/**
 * Job metadata sent to the coordinator. The body travels separately as a
 * stream because serialized RPC values are capped at 32 MiB.
 */
export type GenerationJobHead = Omit<GenerationJob, "request"> & {
    request: Omit<GenerationRequestSnapshot, "body">;
};

export type GenerationOutcome =
    | { status: "cached" }
    | { status: "generated" }
    | { status: "failed"; error: GenerationErrorSnapshot };

export type AsyncJobRecord = {
    /** All accounts that actually submitted this identical request. */
    ownerIds: string[];
    cache: GenerationCacheIdentity;
    status: "pending" | "succeeded" | "failed";
    createdAt: number;
    completedAt?: number;
    error?: { httpStatus: number; message: string };
};

type DeduplicationEnv = {
    Bindings: CloudflareBindings;
    Variables: GenerationCacheEnv["Variables"] &
        AuthVariables & {
            balance: BalanceVariables["balance"];
            track?: {
                streamRequested?: boolean;
                detachedExecutionTracked?: boolean;
            };
        } & Partial<ModelVariables>;
};

function createAuthSnapshot(
    auth: AuthVariables["auth"],
): GenerationAuthSnapshot {
    const user = auth.requireUser();
    let apiKey: GenerationAuthSnapshot["apiKey"];
    if (auth.apiKey) {
        const { rawKey: _rawKey, ...persistedApiKey } = auth.apiKey;
        apiKey = persistedApiKey;
    }
    return {
        user: { id: user.id, tier: user.tier },
        ...(apiKey && { apiKey }),
        ...(auth.agentRun && { agentRun: auth.agentRun }),
    };
}

async function createJob(
    c: Context<DeduplicationEnv>,
    adapter: GenerationCacheAdapter,
    key: string,
): Promise<{ job: GenerationJobHead; body?: Uint8Array }> {
    const balanceCheckResult = c.var.balance.balanceCheckResult;
    if (!balanceCheckResult) {
        throw new Error("Generation balance snapshot is missing");
    }

    const method = c.var.generationRequestMethod ?? c.req.method;
    let body: Uint8Array | undefined;
    if (method !== "GET" && method !== "HEAD") {
        const captured = c.var.generationRequestBody;
        body =
            captured instanceof Uint8Array
                ? captured
                : typeof captured === "string"
                  ? new TextEncoder().encode(captured)
                  : new Uint8Array(await c.req.arrayBuffer());
    }

    // This replays our own request internally; provider clients build their
    // outgoing headers separately. Keep new request options without an allowlist.
    const headers = new Headers(c.req.raw.headers);
    if (c.var.generationRequestContentType) {
        headers.set("content-type", c.var.generationRequestContentType);
    }

    const job: GenerationJobHead = {
        cache: { storage: adapter.storage, key },
        request: {
            url: c.var.generationRequestUrl?.href ?? c.req.url,
            method,
            ...(c.var.generationRequestUrl && {
                originalPath: getRoutePath(c),
                originalModel: c.var.model?.requested,
            }),
            headers: [...headers.entries()],
        },
        auth: createAuthSnapshot(c.var.auth),
        requestId: c.get("requestId"),
        balanceCheckResult,
        apiKeyBudgetEstimate: c.var.balance.apiKeyBudgetEstimate,
    };
    return { job, ...(body !== undefined && { body }) };
}

/** Replays an error response already handled by the detached executor. */
function replayFailedResponse(error: GenerationErrorSnapshot): Response {
    const status =
        error.httpStatus >= 400 && error.httpStatus <= 599
            ? error.httpStatus
            : 502;
    const headers = new Headers(error.headers);
    const body = error.body.buffer.slice(
        error.body.byteOffset,
        error.body.byteOffset + error.body.byteLength,
    ) as ArrayBuffer;
    return new Response(body, { status, headers });
}

/** Runs after generationAccess, so every caller is authorized before joining. */
export const deduplicateGeneration = createMiddleware<DeduplicationEnv>(
    async (c, next) => {
        if (c.var.track?.streamRequested === true) {
            return next();
        }

        const cache = c.var.generationCache;
        if (!cache || !c.env.GENERATION_COORDINATOR) {
            c.get("log").error(
                "Generation cache identity or coordinator binding is missing",
            );
            throw new HTTPException(503, {
                message: "Generation coordination is unavailable",
            });
        }

        const name = await hashGenerationCacheIdentity(
            cache.adapter.storage,
            cache.key,
        );
        const stub = c.env.GENERATION_COORDINATOR.getByName(name);
        const { job, body } = await createJob(c, cache.adapter, cache.key);
        const asyncRequested =
            cache.adapter.storage === "media" &&
            !c.var.generationRequestUrl &&
            c.req
                .header("prefer")
                ?.split(",")
                .some((part) =>
                    /^respond-async(?:\s*;.*)?$/i.test(part.trim()),
                );
        const bodyStream =
            body &&
            (new Response(body as Uint8Array<ArrayBuffer>).body ?? undefined);
        if (asyncRequested) {
            try {
                const status = await stub.submit(job, bodyStream);
                if (c.var.track) c.var.track.detachedExecutionTracked = true;
                const url = `${getPublicOrigin(c)}/v1/jobs/${name}`;
                return c.json({ id: name, status, status_url: url }, 202, {
                    Location: url,
                    "Retry-After": "5",
                    "Preference-Applied": "respond-async",
                    "Cache-Control": "private, no-store",
                });
            } catch (error) {
                c.get("log").error(
                    "Async generation submission failed: {error}",
                    {
                        error:
                            error instanceof Error
                                ? error.message
                                : String(error),
                    },
                );
                throw new HTTPException(503, {
                    message: "Generation coordination is unavailable",
                    cause: error,
                });
            }
        }
        let outcome: GenerationOutcome | undefined;
        let coordinationError: HTTPException | undefined;
        try {
            // A Response body is a byte stream, which RPC streams with flow
            // control instead of serializing it into the 32 MiB-capped call.
            outcome = (await stub.startAndWait(
                job,
                bodyStream,
            )) as GenerationOutcome;
        } catch (error) {
            const rpcError = error as Error & {
                durableObjectReset?: boolean;
                overloaded?: boolean;
                retryable?: boolean;
            };
            c.get("log").error(
                "Generation coordination failed before completion: {errorMessage}",
                {
                    errorMessage: rpcError?.message ?? String(error),
                    durableObjectReset: rpcError?.durableObjectReset,
                    overloaded: rpcError?.overloaded,
                    retryable: rpcError?.retryable,
                },
            );
            coordinationError = new HTTPException(503, {
                message: "Generation coordination is unavailable",
                cause: error,
            });
        }
        if (outcome?.status === "failed") {
            if (c.var.track) c.var.track.detachedExecutionTracked = true;
            return replayFailedResponse(outcome.error);
        }
        // A fresh generation was already tracked and billed inside the
        // detached executor; the outer caller must not emit a second usage
        // row for it (it used to be suppressed by the unconditional HIT).
        if (outcome?.status === "generated" && c.var.track) {
            c.var.track.detachedExecutionTracked = true;
        }

        // An RPC failure may happen after the result was saved. Read once;
        // never restart the coordinator or execute another generation here.
        let response: Response | null;
        try {
            response = await cache.adapter.get(
                c as unknown as Context<GenerationCacheEnv>,
                cache.key,
            );
        } catch (error) {
            c.get("log").error(
                "Error reading completed generation from cache: {error}",
                { error },
            );
            throw (
                coordinationError ??
                new HTTPException(503, {
                    message: "Generation cache is temporarily unavailable",
                    cause: error,
                })
            );
        }
        if (!response) {
            throw (
                coordinationError ??
                new HTTPException(503, {
                    message:
                        "Generation completed without a durable cache entry",
                })
            );
        }
        // A job that ran a provider and wrote a fresh cache entry was a MISS
        // for this requester; only pre-existing entries are HITs.
        const cacheStatus = outcome?.status === "generated" ? "MISS" : "HIT";
        c.header("X-Cache", cacheStatus);
        response.headers.set("X-Cache", cacheStatus);
        return response;
    },
);
