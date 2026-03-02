/**
 * Proxy routes for gen.pollinations.ai
 *
 * Handles generation requests directly:
 * - Auth via enter's /api/internal/verify (service binding)
 * - Caching via R2 buckets
 * - Rate limiting at the edge
 * - Request deduplication
 * - Direct proxy to image/text backend services
 * - Balance deduction via enter's /api/internal/deduct (in waitUntil)
 * - Tinybird event ingestion (in waitUntil)
 */

import {
    DEFAULT_AUDIO_MODEL,
    ELEVENLABS_VOICES,
} from "@shared/registry/audio.ts";
import { DEFAULT_IMAGE_MODEL } from "@shared/registry/image.ts";
import {
    getAudioModelsInfo,
    getImageModelsInfo,
    getTextModelsInfo,
} from "@shared/registry/model-info.ts";
import {
    calculatePrice,
    getServiceDefinition,
    resolveServiceId,
    type ServiceId,
} from "@shared/registry/registry.ts";
import { DEFAULT_TEXT_MODEL } from "@shared/registry/text.ts";
import { parseUsageHeaders } from "@shared/registry/usage-headers.ts";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Env } from "../env.ts";
import { auth } from "../middleware/auth.ts";
import { imageCache } from "../middleware/image-cache.ts";
import { edgeRateLimit } from "../middleware/rate-limit-edge.ts";
import { requestDeduplication } from "../middleware/requestDeduplication.ts";
import { textCache } from "../middleware/text-cache.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build proxy headers: strip auth, add internal headers */
function proxyHeaders(c: any): Record<string, string> {
    const clientIP = c.req.header("cf-connecting-ip") || "";
    const clientHost = c.req.header("host") || "";
    const headers = { ...c.req.header() };
    delete headers.authorization;
    delete headers.Authorization;

    return {
        ...headers,
        "x-request-id": c.get("requestId"),
        "x-forwarded-host": clientHost,
        "x-forwarded-for": clientIP,
        "x-real-ip": clientIP,
        "x-enter-token": c.env.PLN_ENTER_TOKEN || "",
    };
}

/** Build target URL from incoming request, swapping host to backend */
function proxyUrl(c: any, targetBaseUrl: string, model?: string): URL {
    const incomingUrl = new URL(c.req.url);
    const targetUrl = new URL(targetBaseUrl);
    const searchParams = new URLSearchParams(incomingUrl.search);
    searchParams.delete("key");
    if (model && searchParams.has("model")) {
        searchParams.set("model", model);
    }
    targetUrl.search = searchParams.toString();
    return targetUrl;
}

function joinPaths(...paths: string[]): string {
    return paths.join("/").replace(/\/+/g, "/").replace(/\/$/, "") || "/";
}

/** Resolve model from request (query param or body), applying defaults */
function resolveModelFromRequest(
    c: any,
    defaultModel: string,
): { requested: string; resolved: string } {
    const rawModel = c.req.query("model") || defaultModel;
    const resolved = resolveServiceId(rawModel);
    return { requested: rawModel, resolved };
}

/** Require auth + positive balance, throw if not valid */
function requireAuth(c: any): void {
    const authCtx = c.var.auth;
    if (!authCtx?.valid) {
        throw new HTTPException(401, { message: "Authentication required" });
    }
}

function requireBalance(c: any, isPaidOnly: boolean): void {
    const authCtx = c.var.auth;
    if (!authCtx?.valid) return;
    if (isPaidOnly) {
        if (!authCtx.hasPaidBalance) {
            throw new HTTPException(402, {
                message:
                    "This model requires a paid balance. Tier balance cannot be used.",
            });
        }
    } else {
        if (!authCtx.hasPositiveBalance) {
            throw new HTTPException(402, {
                message: "Insufficient pollen balance.",
            });
        }
    }
}

/** Check API key model permissions */
function requireModelAccess(c: any, resolved: string): void {
    const permissions = c.var.auth?.permissions;
    if (permissions?.models?.length && !permissions.models.includes(resolved)) {
        throw new HTTPException(403, {
            message: `Model '${resolved}' is not allowed for this API key`,
        });
    }
}

/** Check API key budget */
function requireKeyBudget(c: any): void {
    const budget = c.var.auth?.pollenBudget;
    if (typeof budget === "number" && budget <= 0) {
        throw new HTTPException(402, {
            message:
                "API key budget exhausted. Please top up or create a new key.",
        });
    }
}

/** Fire-and-forget: deduct balance + send Tinybird event */
function trackAndDeduct(
    c: any,
    opts: {
        model: { requested: string; resolved: string };
        startTime: number;
        response: Response;
    },
): void {
    c.executionCtx.waitUntil(
        (async () => {
            try {
                const { model, startTime, response } = opts;
                const authCtx = c.var.auth;
                const endTime = Date.now();

                // Check if this is a billable response
                const cacheHit = response.headers.get("x-cache") === "HIT";
                if (!response.ok || cacheHit) return;

                // Extract usage from response headers
                let usage;
                try {
                    usage = parseUsageHeaders(response.headers);
                } catch {
                    return; // No usage headers = can't bill
                }

                // Calculate price
                const price = calculatePrice(
                    model.resolved as ServiceId,
                    usage,
                );
                const totalPrice = price?.totalPrice || 0;
                if (totalPrice <= 0) return;

                // Deduct balance via enter
                if (authCtx?.userId && c.env.PLN_ENTER_TOKEN) {
                    await c.env.ENTER.fetch(
                        new URL("/api/internal/deduct", c.req.url),
                        {
                            method: "POST",
                            headers: {
                                "Content-Type": "application/json",
                                "x-enter-token": c.env.PLN_ENTER_TOKEN,
                            },
                            body: JSON.stringify({
                                userId: authCtx.userId,
                                apiKeyId: authCtx.apiKeyId,
                                apiKeyPollenBalance: authCtx.pollenBudget,
                                amount: totalPrice,
                                model: model.resolved,
                            }),
                        },
                    );
                }

                // Send to Tinybird
                if (c.env.TINYBIRD_INGEST_TOKEN) {
                    const event = {
                        id: crypto.randomUUID(),
                        requestId: c.get("requestId"),
                        startTime: new Date(startTime).toISOString(),
                        endTime: new Date(endTime).toISOString(),
                        responseTime: endTime - startTime,
                        responseStatus: response.status,
                        eventType: "generate.image", // TODO: pass event type
                        userId: authCtx?.userId,
                        userTier: authCtx?.tier,
                        apiKeyId: authCtx?.apiKeyId,
                        apiKeyType: authCtx?.keyType,
                        modelRequested: model.requested,
                        resolvedModelRequested: model.resolved,
                        isBilledUsage: true,
                        totalPrice,
                        cacheHit: false,
                    };

                    await fetch(c.env.TINYBIRD_INGEST_URL, {
                        method: "POST",
                        headers: {
                            Authorization: `Bearer ${c.env.TINYBIRD_INGEST_TOKEN}`,
                            "Content-Type": "application/x-ndjson",
                        },
                        body: JSON.stringify(event),
                    });
                }
            } catch {
                // Tracking failure is non-fatal
            }
        })(),
    );
}

/** Filter models by API key permissions and paid balance */
function filterModels<T extends { name: string; paid_only?: boolean }>(
    models: T[],
    allowedModels: string[] | undefined,
    hasPaidBalance?: boolean,
): T[] {
    return models.filter((m) => {
        if (allowedModels?.length && !allowedModels.includes(m.name))
            return false;
        if (m.paid_only && hasPaidBalance === false) return false;
        return true;
    });
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export const proxyRoutes = new Hono<Env>()
    // Edge rate limiter: first line of defense
    .use("*", edgeRateLimit)

    // Model listing endpoints: optional auth (for filtering)
    .use("/v1/models", auth())
    .use("/image/models", auth())
    .use("/text/models", auth())
    .use("/audio/models", auth())

    .get("/v1/models", async (c) => {
        const allowedModels = c.var.auth?.permissions?.models;
        const paid = c.var.auth?.hasPaidBalance;
        const models = filterModels(getTextModelsInfo(), allowedModels, paid);
        return c.json({
            object: "list" as const,
            data: models.map((m) => ({
                id: m.name,
                object: "model" as const,
                created: Date.now(),
            })),
        });
    })

    .get("/image/models", async (c) => {
        const allowedModels = c.var.auth?.permissions?.models;
        const paid = c.var.auth?.hasPaidBalance;
        return c.json(filterModels(getImageModelsInfo(), allowedModels, paid));
    })

    .get("/text/models", async (c) => {
        const allowedModels = c.var.auth?.permissions?.models;
        const paid = c.var.auth?.hasPaidBalance;
        return c.json(filterModels(getTextModelsInfo(), allowedModels, paid));
    })

    .get("/audio/models", async (c) => {
        const allowedModels = c.var.auth?.permissions?.models;
        const paid = c.var.auth?.hasPaidBalance;
        return c.json(filterModels(getAudioModelsInfo(), allowedModels, paid));
    })

    // Cache runs BEFORE auth (cache-first pattern)
    .use("/image/*", imageCache)
    .use("/video/*", imageCache)
    .use("/v1/chat/completions", textCache)
    .use("/text/*", textCache)

    // Auth required for all generation endpoints below
    .use(auth({ required: true }))
    .use(requestDeduplication)

    // --- Chat Completions ---
    .post("/v1/chat/completions", async (c) => {
        requireAuth(c);

        // Parse body to get model
        const requestBody = await c.req.json();
        const rawModel = requestBody.model || DEFAULT_TEXT_MODEL;
        let resolved: string;
        try {
            resolved = resolveServiceId(rawModel);
        } catch (e) {
            throw new HTTPException(400, {
                message:
                    e instanceof Error
                        ? e.message
                        : `Invalid model: ${rawModel}`,
            });
        }

        requireModelAccess(c, resolved);
        requireKeyBudget(c);
        const isPaidOnly =
            getServiceDefinition(resolved as ServiceId).paidOnly ?? false;
        requireBalance(c, isPaidOnly);

        // Substitute resolved model
        requestBody.model = resolved;

        const startTime = Date.now();
        const targetUrl = proxyUrl(
            c,
            `${c.env.TEXT_SERVICE_URL}/openai`,
            resolved,
        );
        const response = await fetch(targetUrl, {
            method: "POST",
            headers: proxyHeaders(c),
            body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
            const text = await response.text();
            const status = (response.status === 429 ? 502 : response.status) as
                | 400
                | 500
                | 502
                | 503;
            throw new HTTPException(status, {
                message: text || "Upstream error",
            });
        }

        trackAndDeduct(c, {
            model: { requested: rawModel, resolved },
            startTime,
            response: response.clone(),
        });

        return response;
    })

    // --- Simple Text ---
    .get("/text/:prompt", async (c) => {
        requireAuth(c);
        const model = resolveModelFromRequest(c, DEFAULT_TEXT_MODEL);
        requireModelAccess(c, model.resolved);
        requireKeyBudget(c);
        const isPaidOnly =
            getServiceDefinition(model.resolved as ServiceId).paidOnly ?? false;
        requireBalance(c, isPaidOnly);

        const prompt = c.req.param("prompt");
        const startTime = Date.now();
        const targetUrl = proxyUrl(
            c,
            `${c.env.TEXT_SERVICE_URL}/${encodeURIComponent(prompt)}`,
            model.resolved,
        );
        targetUrl.searchParams.set("model", model.resolved);

        const response = await fetch(targetUrl, {
            method: "GET",
            headers: proxyHeaders(c),
        });

        if (!response.ok) {
            const text = await response.text();
            const status = (response.status === 429 ? 502 : response.status) as
                | 400
                | 500
                | 502
                | 503;
            throw new HTTPException(status, {
                message: text || "Upstream error",
            });
        }

        trackAndDeduct(c, { model, startTime, response: response.clone() });
        return response;
    })

    // --- Image Generation ---
    .get("/image/:prompt{[\\s\\S]+}", async (c) => {
        requireAuth(c);
        const model = resolveModelFromRequest(c, DEFAULT_IMAGE_MODEL);
        requireModelAccess(c, model.resolved);
        requireKeyBudget(c);
        const isPaidOnly =
            getServiceDefinition(model.resolved as ServiceId).paidOnly ?? false;
        requireBalance(c, isPaidOnly);

        const promptParam = c.req.param("prompt") || "";
        const startTime = Date.now();
        const targetUrl = proxyUrl(
            c,
            `${c.env.IMAGE_SERVICE_URL}/prompt`,
            model.resolved,
        );
        targetUrl.pathname = joinPaths(targetUrl.pathname, promptParam);

        const response = await fetch(targetUrl, {
            method: "GET",
            headers: proxyHeaders(c),
        });

        if (!response.ok) {
            const text = await response.text();
            const status = (response.status === 429 ? 502 : response.status) as
                | 400
                | 500
                | 502
                | 503;
            throw new HTTPException(status, {
                message: text || "Upstream error",
            });
        }

        trackAndDeduct(c, { model, startTime, response: response.clone() });
        return response;
    })

    // --- Video Generation ---
    .get("/video/:prompt{[\\s\\S]+}", async (c) => {
        requireAuth(c);
        const model = resolveModelFromRequest(c, DEFAULT_IMAGE_MODEL);
        requireModelAccess(c, model.resolved);
        requireKeyBudget(c);
        const isPaidOnly =
            getServiceDefinition(model.resolved as ServiceId).paidOnly ?? false;
        requireBalance(c, isPaidOnly);

        const promptParam = c.req.param("prompt") || "";
        const startTime = Date.now();
        const targetUrl = proxyUrl(
            c,
            `${c.env.IMAGE_SERVICE_URL}/prompt`,
            model.resolved,
        );
        targetUrl.pathname = joinPaths(targetUrl.pathname, promptParam);

        const response = await fetch(targetUrl, {
            method: "GET",
            headers: proxyHeaders(c),
        });

        if (!response.ok) {
            const text = await response.text();
            const status = (response.status === 429 ? 502 : response.status) as
                | 400
                | 500
                | 502
                | 503;
            throw new HTTPException(status, {
                message: text || "Upstream error",
            });
        }

        trackAndDeduct(c, { model, startTime, response: response.clone() });
        return response;
    })

    // --- Simple Audio ---
    .get("/audio/:text", async (c) => {
        requireAuth(c);
        const model = resolveModelFromRequest(c, DEFAULT_AUDIO_MODEL);
        requireModelAccess(c, model.resolved);
        requireKeyBudget(c);
        const isPaidOnly =
            getServiceDefinition(model.resolved as ServiceId).paidOnly ?? false;
        requireBalance(c, isPaidOnly);

        // Audio routes forward to enter for now (ElevenLabs keys live there)
        const url = new URL(c.req.url);
        url.pathname =
            "/api/generate" + url.pathname.replace(/^\/api\/generate/, "");
        return c.env.ENTER.fetch(url, c.req.raw);
    });
