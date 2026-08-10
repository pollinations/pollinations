import type { AgentRunClaims } from "@shared/auth/agent-run-token.ts";
import type { AuthenticatedApiKey, AuthUser } from "@shared/auth/api-key.ts";
import { SAFETY_HEADER_NAME } from "@shared/schemas/safety.ts";
import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import type { AuthVariables } from "@/middleware/auth.ts";
import type {
    GenerationCacheAdapter,
    GenerationCacheEnv,
} from "@/middleware/generation-cache.ts";

const MAX_REPLAY_BODY_BYTES = 1_500_000;
const STATUS_POLL_INTERVAL_MS = 500;
export const INTERNAL_CACHE_WRITE_HEADER = "x-internal-generation-cache-write";
const REPLAYED_HEADERS = new Set([
    "accept",
    "content-type",
    "referer",
    SAFETY_HEADER_NAME.toLowerCase(),
]);

export type GenerationAuthSnapshot = {
    user: Pick<AuthUser, "id" | "tier">;
    apiKey?: Omit<AuthenticatedApiKey, "rawKey">;
    agentRun?: AgentRunClaims;
};

export type GenerationRequestSnapshot = {
    url: string;
    method: string;
    headers: [string, string][];
    body?: string;
};

export type GenerationJob = {
    request: GenerationRequestSnapshot;
    auth: GenerationAuthSnapshot;
};

export type GenerationExecutionProps = {
    type: "generation-execution";
    auth: GenerationAuthSnapshot;
};

export type GenerationExecutionResult = {
    cached: boolean;
    retryable?: boolean;
    status: number;
    statusText: string;
    contentType?: string;
    body?: string;
};

export type GenerationCoordinatorStatus =
    | { status: "idle" | "queued" | "running" }
    | { status: "failed"; response: GenerationExecutionResult };

type GenerationCoordinatorStub = {
    start(job: GenerationJob): Promise<{ role: "owner" | "joiner" }>;
    getStatus(): Promise<GenerationCoordinatorStatus>;
};

type ContextWithProps = ExecutionContext & {
    props?: unknown;
};

export function getGenerationExecutionProps(
    executionCtx: ExecutionContext,
): GenerationExecutionProps | null {
    const props = (executionCtx as ContextWithProps).props;
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

function createAuthSnapshot(
    auth: AuthVariables["auth"] | undefined,
): GenerationAuthSnapshot | null {
    if (!auth?.user?.id) return null;
    let apiKey: Omit<AuthenticatedApiKey, "rawKey"> | undefined;
    if (auth.apiKey) {
        const { rawKey: _rawKey, ...persistedApiKey } = auth.apiKey;
        apiKey = persistedApiKey;
    }
    return {
        user: { id: auth.user.id, tier: auth.user.tier },
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
    c: Context<GenerationCacheEnv>,
): Promise<GenerationJob | null> {
    const auth = createAuthSnapshot(
        (c.var as GenerationCacheEnv["Variables"] & Partial<AuthVariables>)
            .auth,
    );
    if (!auth) return null;

    let body: string | undefined;
    if (c.req.method !== "GET" && c.req.method !== "HEAD") {
        body = sanitizeJsonBody(await c.req.text());
        if (new TextEncoder().encode(body).byteLength > MAX_REPLAY_BODY_BYTES) {
            throw new HTTPException(413, {
                message: "Request body is too large for idempotent generation",
            });
        }
    }

    const headers = [...c.req.raw.headers.entries()].filter(([name]) =>
        REPLAYED_HEADERS.has(name.toLowerCase()),
    );
    return {
        request: {
            url: sanitizeUrl(c.req.url),
            method: c.req.method,
            headers,
            ...(body !== undefined && { body }),
        },
        auth,
    };
}

function isStreamRequested(c: Context<GenerationCacheEnv>): boolean {
    const vars = c.var as GenerationCacheEnv["Variables"] & {
        track?: { streamRequested?: boolean };
    };
    return vars.track?.streamRequested === true;
}

export function canCoordinateGeneration(
    c: Context<GenerationCacheEnv>,
): boolean {
    return Boolean(
        c.env.GENERATION_COORDINATOR &&
            !isGenerationExecution(c.executionCtx) &&
            !isStreamRequested(c),
    );
}

function delay(milliseconds: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function failedResponse(result: GenerationExecutionResult): Response {
    const headers = new Headers({
        "Content-Type": result.contentType || "text/plain; charset=utf-8",
        "X-Cache": "HIT",
        "X-Cache-Type": "COALESCED-ERROR",
    });
    return new Response(result.body || result.statusText, {
        status: result.status,
        statusText: result.statusText,
        headers,
    });
}

export async function coordinateGeneration(
    c: Context<GenerationCacheEnv>,
    adapter: GenerationCacheAdapter,
    cacheKey: string,
): Promise<Response | null> {
    if (!canCoordinateGeneration(c) || !c.env.GENERATION_COORDINATOR) {
        return null;
    }

    const job = await createJob(c);
    if (!job) return null;

    const stub = c.env.GENERATION_COORDINATOR.getByName(
        `${adapter.namespace}:${cacheKey}`,
    ) as unknown as GenerationCoordinatorStub;
    const { role } = await stub.start(job);

    while (true) {
        const status = await stub.getStatus();
        if (status.status === "failed") {
            return failedResponse(status.response);
        }
        if (status.status === "idle") {
            const cached = await adapter.get(c, cacheKey);
            if (!cached) {
                throw new Error(
                    "Generation completed without a durable cache entry",
                );
            }
            cached.headers.set(
                "X-Cache-Type",
                role === "owner" ? "GENERATED" : "COALESCED",
            );
            return cached;
        }
        await delay(STATUS_POLL_INTERVAL_MS);
    }
}
