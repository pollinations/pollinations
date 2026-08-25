import { bytesToHex } from "@shared/client-ip.ts";
import stableStringify from "fast-json-stable-stringify";
import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import type { RequestIdVariables } from "hono/request-id";
import type { LoggerVariables } from "@/middleware/logger.ts";

export type GenerationCacheStorage = "media" | "text";

/** Opaque identity shared by coordination and low-volume cache telemetry. */
export async function hashGenerationCacheIdentity(
    storage: GenerationCacheStorage,
    key: string,
): Promise<string> {
    const bytes = new TextEncoder().encode(`${storage}:${key}`);
    return bytesToHex(await crypto.subtle.digest("SHA-256", bytes));
}

export type GenerationCacheVariables = {
    generationCache?: {
        adapter: GenerationCacheAdapter;
        key: string;
    };
    /** Alternate request identity for routes which wrap a media response. */
    generationCacheUrl?: URL;
    /** Normalized POST body passed to the generation executor. */
    generationRequestBody?: string | Uint8Array;
    /** Multipart body parsed during model resolution and reused downstream. */
    formData?: FormData;
    /** Content type for a normalized multipart body. */
    generationRequestContentType?: string;
    /** Canonical body identity used by body-aware cache adapters. */
    generationCacheBody?: string;
    /** Executor callback used to await durable cache materialization. */
    registerGenerationCacheWrite?: (write: GenerationCacheWrite) => void;
    /** The in-flight durable write of this request's response, if any. */
    generationCacheWrite?: GenerationCacheWrite;
    /**
     * Set by track before the handler runs: resolves true once Enter has
     * durably accepted the settlement (publish), false when nothing may be
     * served (drop). Adapters hold the R2 put until it resolves.
     */
    generationCachePublish?: Promise<boolean>;
};

/**
 * A response on its way to the cache. `prepared` settles once the whole
 * body is buffered and validated — before any money moves; `write` once the
 * object is in R2 (or was dropped because publication was refused).
 */
export type GenerationCacheWrite = {
    prepared: Promise<void>;
    write: Promise<void>;
};

export function generationCacheBucket(
    env: CloudflareBindings,
    storage: GenerationCacheStorage,
): R2Bucket {
    return storage === "media" ? env.IMAGE_BUCKET : env.TEXT_BUCKET;
}

export type GenerationCacheEnv = {
    Bindings: CloudflareBindings;
    Variables: LoggerVariables & RequestIdVariables & GenerationCacheVariables;
};

export type GenerationCacheAdapter = {
    storage: GenerationCacheStorage;
    label: string;
    getKey: (c: Context<GenerationCacheEnv>) => Promise<string> | string;
    get: (
        c: Context<GenerationCacheEnv>,
        key: string,
    ) => Promise<Response | null>;
    shouldCache: (response: Response) => boolean;
    capture: (
        c: Context<GenerationCacheEnv>,
        key: string,
        response: Response,
        publish: Promise<boolean>,
    ) => { response: Response } & GenerationCacheWrite;
};

function normalizedJsonBody(body: string): string {
    try {
        const parsed = JSON.parse(body);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            for (const key of Object.keys(parsed)) {
                if (key.toLowerCase() === "key") delete parsed[key];
            }
        }
        return stableStringify(parsed);
    } catch {
        return body;
    }
}

async function normalizedFormData(formData: FormData): Promise<{
    body: Uint8Array;
    contentType: string;
    identity: string;
}> {
    const sanitized = new FormData();
    const identity = new Map<string, unknown[]>();

    for (const [name, value] of formData.entries()) {
        if (name.toLowerCase() === "key") continue;
        const values = identity.get(name) ?? [];
        if (value instanceof File) {
            const bytes = new Uint8Array(await value.arrayBuffer());
            values.push({
                file: value.name,
                type: value.type,
                hash: bytesToHex(await crypto.subtle.digest("SHA-256", bytes)),
            });
            sanitized.append(name, value, value.name);
        } else {
            values.push(value);
            sanitized.append(name, value);
        }
        identity.set(name, values);
    }

    const encoded = new Response(sanitized);
    return {
        body: new Uint8Array(await encoded.arrayBuffer()),
        contentType: encoded.headers.get("content-type") ?? "",
        identity: stableStringify(Object.fromEntries(identity)),
    };
}

/** Captures one replayable body and one stable identity for every POST route. */
export const prepareGenerationRequest = createMiddleware<GenerationCacheEnv>(
    async (c, next) => {
        if (c.req.method === "GET" || c.req.method === "HEAD") {
            return next();
        }

        if (c.var.generationRequestBody !== undefined) {
            const body = c.var.generationRequestBody;
            const identity =
                typeof body === "string"
                    ? normalizedJsonBody(body)
                    : bytesToHex(
                          await crypto.subtle.digest(
                              "SHA-256",
                              body.slice().buffer,
                          ),
                      );
            if (typeof body === "string") {
                c.set("generationRequestBody", identity);
            }
            c.set("generationCacheBody", identity);
            return next();
        }

        const contentType = c.req.header("content-type") ?? "";
        if (
            c.var.formData ||
            contentType.toLowerCase().includes("multipart/form-data")
        ) {
            let formData = c.var.formData;
            if (!formData) {
                try {
                    formData = await c.req.formData();
                } catch {
                    throw new HTTPException(400, {
                        message: "Invalid multipart form data",
                    });
                }
            }
            const normalized = await normalizedFormData(formData);
            c.set("generationRequestBody", normalized.body);
            c.set("generationRequestContentType", normalized.contentType);
            c.set("generationCacheBody", normalized.identity);
            return next();
        }

        const body = normalizedJsonBody(await c.req.text());
        c.set("generationRequestBody", body);
        c.set("generationCacheBody", body);
        return next();
    },
);

function replaceCapturedResponse(
    c: Context<GenerationCacheEnv>,
    captured: Response,
): void {
    if (captured === c.res) return;
    // Hono's response setter gives the previous response headers precedence.
    // Copy adapter-owned headers first so they survive the body replacement.
    for (const [name, value] of captured.headers) {
        c.res.headers.set(name, value);
    }
    c.res = captured;
}

async function lookup(
    c: Context<GenerationCacheEnv>,
    adapter: GenerationCacheAdapter,
    cacheKey: string,
): Promise<Response | null> {
    const log = c.get("log").getChild(adapter.label);
    log.debug("Cache key: {key}", { key: cacheKey });
    const cached = await adapter.get(c, cacheKey);
    if (cached) {
        log.info("Cache HIT");
    } else {
        log.debug("Cache MISS");
        c.header("X-Cache", "MISS");
    }
    return cached;
}

function capture(
    c: Context<GenerationCacheEnv>,
    adapter: GenerationCacheAdapter,
    cacheKey: string,
): GenerationCacheWrite | undefined {
    if (
        !c.res ||
        c.res.headers.get("X-Cache") === "HIT" ||
        !adapter.shouldCache(c.res)
    ) {
        return;
    }

    c.get("log").getChild(adapter.label).debug("Caching response");
    // Without track in the chain nothing settles, so publish unconditionally.
    const publish = c.var.generationCachePublish ?? Promise.resolve(true);
    const { response, prepared, write } = adapter.capture(
        c,
        cacheKey,
        c.res,
        publish,
    );
    replaceCapturedResponse(c, response);
    // Track observes the failure once settlement comes around; until then
    // the rejection must not surface as unhandled.
    prepared.catch(() => undefined);
    return { prepared, write };
}

/** Shared cache lifecycle; storage and serialization stay adapter-owned. */
export function createGenerationCache(adapter: GenerationCacheAdapter) {
    return createMiddleware<GenerationCacheEnv>(async (c, next) => {
        const log = c.get("log").getChild(adapter.label);
        const cacheKey = await adapter.getKey(c);
        const streamRequested = (
            c.var as GenerationCacheEnv["Variables"] & {
                track?: { streamRequested?: boolean };
            }
        ).track?.streamRequested;
        const coordinate = streamRequested !== true;

        try {
            const cached = await lookup(c, adapter, cacheKey);
            if (cached) return cached;
        } catch (error) {
            log.error("Error retrieving cached response: {error}", { error });
            if (coordinate) {
                return new Response(
                    "Generation cache is temporarily unavailable",
                    { status: 503 },
                );
            }
        }

        c.set("generationCache", { adapter, key: cacheKey });

        await next();

        const cacheWrite = capture(c, adapter, cacheKey);
        if (cacheWrite) {
            c.set("generationCacheWrite", cacheWrite);
            c.executionCtx.waitUntil(
                cacheWrite.write.catch((error) => {
                    log.error("Error caching response: {error}", { error });
                }),
            );
        }
    });
}

/** Cache lifecycle used only by the detached generation executor. */
export function createGenerationExecutionCache(
    adapter: GenerationCacheAdapter,
) {
    return createMiddleware<GenerationCacheEnv>(async (c, next) => {
        const log = c.get("log").getChild(adapter.label);
        const cacheKey = await adapter.getKey(c);

        try {
            const cached = await lookup(c, adapter, cacheKey);
            if (cached) return cached;
        } catch (error) {
            log.error("Error retrieving cached response: {error}", { error });
            return new Response("Generation cache is temporarily unavailable", {
                status: 503,
            });
        }

        c.set("generationCache", { adapter, key: cacheKey });
        await next();

        const cacheWrite = capture(c, adapter, cacheKey);
        if (!cacheWrite) return;

        const register = c.var.registerGenerationCacheWrite;
        if (!register) throw new Error("Generation cache registrar is missing");
        c.set("generationCacheWrite", cacheWrite);
        register(cacheWrite);
    });
}
