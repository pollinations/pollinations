import type { BalanceCheckResult } from "@shared/billing/balance.ts";
import { SAFETY_HEADER_NAME } from "@shared/schemas/safety.ts";
import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
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

const EXECUTOR_HEADERS = new Set([
    "accept",
    "cf-connecting-ip",
    "content-type",
    "referer",
    "user-agent",
    "x-forwarded-host",
    "x-original-client-ip",
    SAFETY_HEADER_NAME.toLowerCase(),
]);

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
    body?: Uint8Array;
};

export type GenerationJob = {
    cache: GenerationCacheIdentity;
    request: GenerationRequestSnapshot;
    auth: GenerationAuthSnapshot;
    requestId: string;
    balanceCheckResult: BalanceCheckResult;
};

export type GenerationOutcome =
    | { status: "cached" }
    | { status: "failed"; error: GenerationErrorSnapshot };

type DeduplicationEnv = {
    Bindings: CloudflareBindings;
    Variables: GenerationCacheEnv["Variables"] &
        AuthVariables & {
            balance: BalanceVariables["balance"];
            track?: {
                streamRequested?: boolean;
                detachedExecutionTracked?: boolean;
            };
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
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            for (const key of Object.keys(parsed)) {
                if (key.toLowerCase() === "key") delete parsed[key];
            }
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
    const balanceCheckResult = c.var.balance.balanceCheckResult;
    if (!balanceCheckResult) {
        throw new Error("Generation balance snapshot is missing");
    }

    let body: Uint8Array | undefined;
    if (c.req.method !== "GET" && c.req.method !== "HEAD") {
        const captured = c.var.generationRequestBody;
        body =
            captured instanceof Uint8Array
                ? captured
                : new TextEncoder().encode(
                      sanitizeJsonBody(captured ?? (await c.req.text())),
                  );
    }

    const headers = [...c.req.raw.headers.entries()].filter(([name]) =>
        EXECUTOR_HEADERS.has(name.toLowerCase()),
    );
    if (c.var.generationRequestContentType) {
        const contentType = c.var.generationRequestContentType;
        const existing = headers.findIndex(
            ([name]) => name.toLowerCase() === "content-type",
        );
        if (existing === -1) headers.push(["content-type", contentType]);
        else headers[existing] = [headers[existing][0], contentType];
    }

    return {
        cache: { storage: adapter.storage, key },
        request: {
            url: sanitizeUrl(c.req.url),
            method: c.req.method,
            headers,
            ...(body !== undefined && { body }),
        },
        auth: createAuthSnapshot(c.var.auth),
        requestId: c.get("requestId"),
        balanceCheckResult,
    };
}

function failedResponse(error: GenerationErrorSnapshot): Response {
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
            return new Response("Generation coordination is unavailable", {
                status: 503,
            });
        }

        const name = await hashGenerationCacheIdentity(
            cache.adapter.storage,
            cache.key,
        );
        const stub = c.env.GENERATION_COORDINATOR.getByName(name);
        const job = await createJob(c, cache.adapter, cache.key);
        let outcome: GenerationOutcome;
        try {
            outcome = (await stub.startAndWait(job)) as GenerationOutcome;
        } catch (error) {
            c.get("log").error(
                "Generation coordination failed before completion: {error}",
                { error },
            );
            return new Response("Generation coordination is unavailable", {
                status: 503,
            });
        }
        if (outcome.status === "failed") {
            if (c.var.track) c.var.track.detachedExecutionTracked = true;
            return failedResponse(outcome.error);
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
        c.header("X-Cache", "HIT");
        response.headers.set("X-Cache", "HIT");
        return response;
    },
);
