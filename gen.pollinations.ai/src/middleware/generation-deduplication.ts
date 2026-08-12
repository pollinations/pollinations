import { SAFETY_HEADER_NAME } from "@shared/schemas/safety.ts";
import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import type { AuthVariables } from "@/middleware/auth.ts";
import type {
    GenerationCacheAdapter,
    GenerationCacheEnv,
    GenerationCacheStorage,
} from "@/middleware/generation-cache.ts";
import { hashGenerationCacheIdentity } from "@/middleware/generation-cache.ts";
import {
    type GenerationAuthSnapshot,
    isGenerationExecution,
} from "@/utils/generation-execution.ts";

const REPLAYED_HEADERS = new Set([
    "accept",
    "cf-connecting-ip",
    "content-type",
    "referer",
    "user-agent",
    "x-forwarded-host",
    "x-original-client-ip",
    SAFETY_HEADER_NAME.toLowerCase(),
]);
const CALLER_WAIT_MS = 90_000;
const RETRY_AFTER_SECONDS = 10;

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
    headers: [string, string][];
    body?: string;
};

export type GenerationJob = {
    cache: GenerationCacheIdentity;
    request: GenerationRequestSnapshot;
    auth: GenerationAuthSnapshot;
};

export type GenerationOutcome =
    | { status: "cached" }
    | { status: "failed"; error: GenerationErrorSnapshot }
    | { status: "unknown"; retryAfterSeconds: number };

export type GenerationExecutionResult =
    | { status: "cached" }
    | { status: "failed"; error: GenerationErrorSnapshot }
    | { status: "unknown" };

type CoordinatorStub = {
    startAndWait(job: GenerationJob): Promise<{
        role: "owner" | "joiner";
        outcome: GenerationOutcome;
    }>;
};

type DeduplicationEnv = {
    Bindings: CloudflareBindings;
    Variables: GenerationCacheEnv["Variables"] &
        AuthVariables & {
            track?: { streamRequested?: boolean };
        };
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

function sanitizeUrl(rawUrl: string): string {
    const url = new URL(rawUrl);
    for (const key of [...url.searchParams.keys()]) {
        if (key.toLowerCase() === "key") url.searchParams.delete(key);
    }
    return url.toString();
}

function sanitizeJsonBody(body: string): string {
    try {
        const parsed = JSON.parse(body);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
            return body;
        }
        for (const key of Object.keys(parsed)) {
            if (key.toLowerCase() === "key") delete parsed[key];
        }
        return JSON.stringify(parsed);
    } catch {
        return body;
    }
}

async function createJob(
    c: Context<DeduplicationEnv>,
    adapter: GenerationCacheAdapter,
    key: string,
): Promise<GenerationJob> {
    let body: string | undefined;
    if (c.req.method !== "GET" && c.req.method !== "HEAD") {
        body = sanitizeJsonBody(await c.req.text());
    }

    return {
        cache: { storage: adapter.storage, key },
        request: {
            url: sanitizeUrl(c.req.url),
            method: c.req.method,
            headers: [...c.req.raw.headers.entries()].filter(([name]) =>
                REPLAYED_HEADERS.has(name.toLowerCase()),
            ),
            ...(body !== undefined && { body }),
        },
        auth: createAuthSnapshot(c.var.auth),
    };
}

function failedResponse(error: GenerationErrorSnapshot): Response {
    const status =
        error.httpStatus >= 400 && error.httpStatus <= 599
            ? error.httpStatus
            : 502;
    const headers = new Headers(error.headers);
    headers.set("X-Cache-Type", "COALESCED-ERROR");
    const body = error.body.buffer.slice(
        error.body.byteOffset,
        error.body.byteOffset + error.body.byteLength,
    ) as ArrayBuffer;
    return new Response(body, { status, headers });
}

function unknownResponse(retryAfterSeconds: number): Response {
    return new Response(
        "Generation outcome is unknown; duplicate generation was not started",
        {
            status: 503,
            headers: {
                "Retry-After": retryAfterSeconds.toString(),
                "X-Cache-Type": "PENDING",
            },
        },
    );
}

function pendingResponse(): Response {
    return Response.json(
        {
            status: "pending",
            message:
                "Generation is still in progress; retry the same request to rejoin it",
        },
        {
            status: 202,
            headers: {
                "Retry-After": RETRY_AFTER_SECONDS.toString(),
                "X-Cache-Type": "PENDING",
            },
        },
    );
}

async function coordinatorName(
    cache: GenerationCacheIdentity,
): Promise<string> {
    return hashGenerationCacheIdentity(cache.storage, cache.key);
}

async function waitForCoordinator(
    promise: ReturnType<CoordinatorStub["startAndWait"]>,
): Promise<Awaited<typeof promise> | null> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), CALLER_WAIT_MS);
    });
    try {
        return await Promise.race([promise, timeout]);
    } finally {
        if (timer !== undefined) clearTimeout(timer);
    }
}

/** Runs after generationAccess, so every caller is authorized before joining. */
export const deduplicateGeneration = createMiddleware<DeduplicationEnv>(
    async (c, next) => {
        const cache = c.var.generationCache;
        if (
            !cache ||
            !c.env.GENERATION_COORDINATOR ||
            isGenerationExecution(c.executionCtx) ||
            c.var.track?.streamRequested === true
        ) {
            return next();
        }

        const stub = c.env.GENERATION_COORDINATOR.getByName(
            await coordinatorName({
                storage: cache.adapter.storage,
                key: cache.key,
            }),
        ) as unknown as CoordinatorStub;
        let result: Awaited<ReturnType<CoordinatorStub["startAndWait"]>>;
        try {
            const coordinated = await waitForCoordinator(
                stub.startAndWait(await createJob(c, cache.adapter, cache.key)),
            );
            if (!coordinated) return pendingResponse();
            result = coordinated;
        } catch (error) {
            c.get("log").error(
                "Generation coordination failed before completion: {error}",
                { error },
            );
            return new Response("Generation coordination is unavailable", {
                status: 503,
            });
        }
        const { role, outcome } = result;

        if (outcome.status === "failed") {
            return failedResponse(outcome.error);
        }
        if (outcome.status === "unknown") {
            return unknownResponse(outcome.retryAfterSeconds);
        }

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
            return new Response("Generation cache is temporarily unavailable", {
                status: 503,
            });
        }
        if (!response) {
            return new Response(
                "Generation completed without a durable cache entry",
                { status: 503 },
            );
        }
        response.headers.set(
            "X-Cache-Type",
            role === "owner" ? "GENERATED" : "COALESCED",
        );
        return response;
    },
);
