import type { CommunityEndpointRuntime } from "@shared/community-endpoints.ts";
import { DEFAULT_AUDIO_MODEL } from "@shared/registry/audio.ts";
import { DEFAULT_EMBEDDING_MODEL } from "@shared/registry/embeddings.ts";
import { DEFAULT_IMAGE_MODEL } from "@shared/registry/image.ts";
import { DEFAULT_REALTIME_MODEL } from "@shared/registry/realtime.ts";
import {
    isModelFallbackCompatible,
    type ModelDefinition,
} from "@shared/registry/registry.ts";
import { DEFAULT_TEXT_MODEL } from "@shared/registry/text.ts";
import type { EventType } from "@shared/schemas/generation-event.ts";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { getGenerationModelRegistry } from "../model-registry.ts";
import type { AuthVariables } from "./auth.ts";

const ENDPOINT_LABEL: Record<EventType, string> = {
    "generate.text": "text",
    "generate.image": "image",
    "generate.audio": "audio",
    "generate.embedding": "embeddings",
    "generate.realtime": "realtime",
};

export type ModelVariables = {
    model: {
        /** The model string from the request (before resolution) */
        requested: string;
        /** The resolved canonical model name */
        resolved: string;
        /** Static registry definition, or a dynamic definition resolved from D1. */
        definition: ModelDefinition;
        communityEndpoint?: CommunityEndpointRuntime;
        fallbackModel?: string;
    };
    fallbackRequest?: Request;
    formData?: FormData;
};

const fallbackSources = new WeakMap<Request, string>();

export function getModelFallbackSource(request: Request): string | undefined {
    return fallbackSources.get(request);
}

type ResolveModelOptions = {
    defaultModel?: string;
    supportedEndpoint?: string;
};

function hasJsonContentType(contentType: string): boolean {
    return /\bjson\b/i.test(contentType);
}

function getValidatedJsonBody<T>(req: {
    valid: (target: never) => unknown;
}): T | undefined {
    try {
        return req.valid("json" as never) as T | undefined;
    } catch {
        return undefined;
    }
}

async function createFallbackRequest(
    request: Request,
    fallbackModel: string,
    fallbackFrom: string,
    validatedJson?: Record<string, unknown>,
    formData?: FormData,
): Promise<Request | undefined> {
    const url = new URL(request.url);
    const headers = new Headers(request.headers);
    headers.delete("content-length");

    if (request.method === "GET" || request.method === "HEAD") {
        url.searchParams.set("model", fallbackModel);
        const fallbackRequest = new Request(url, {
            method: request.method,
            headers,
        });
        fallbackSources.set(fallbackRequest, fallbackFrom);
        return fallbackRequest;
    }

    if (formData) {
        const fallbackForm = new FormData();
        for (const [key, value] of formData.entries()) {
            fallbackForm.append(key, value);
        }
        fallbackForm.set("model", fallbackModel);
        headers.delete("content-type");
        const fallbackRequest = new Request(url, {
            method: request.method,
            headers,
            body: fallbackForm,
        });
        fallbackSources.set(fallbackRequest, fallbackFrom);
        return fallbackRequest;
    }

    if (!hasJsonContentType(request.headers.get("content-type") || "")) {
        return undefined;
    }
    let body = validatedJson;
    if (!body) {
        try {
            body = (await request.clone().json()) as Record<string, unknown>;
        } catch {
            return undefined;
        }
    }
    const fallbackRequest = new Request(url, {
        method: request.method,
        headers,
        body: JSON.stringify({ ...body, model: fallbackModel }),
    });
    fallbackSources.set(fallbackRequest, fallbackFrom);
    return fallbackRequest;
}

export async function resolveModelDefinition(
    model: string,
    eventType: EventType,
    env: CloudflareBindings,
    callerUserId?: string,
    supportedEndpoint?: string,
): Promise<ModelVariables["model"]> {
    const registry = await getGenerationModelRegistry(env);
    const entry = registry.resolve(model);
    if (!entry) {
        throw new HTTPException(400, {
            message: `Invalid model or alias: "${model}". Must be a valid model name or alias.`,
        });
    }

    // A private community endpoint is owner-only: to everyone else it doesn't
    // exist. Reuse the same "invalid model" response as an unknown name so
    // private models aren't discoverable by probing.
    const community = entry.communityEndpoint;
    if (
        community &&
        community.visibility !== "public" &&
        community.ownerUserId !== callerUserId
    ) {
        throw new HTTPException(400, {
            message: `Invalid model or alias: "${model}". Must be a valid model name or alias.`,
        });
    }

    if (entry.eventType !== eventType) {
        const actualLabel = ENDPOINT_LABEL[entry.eventType];
        throw new HTTPException(400, {
            message: `Model "${model}" is a ${actualLabel} model and cannot be used on the ${ENDPOINT_LABEL[eventType]} endpoint. Use the ${actualLabel} endpoint instead.`,
        });
    }
    if (entry.definition.supportedEndpoints && !supportedEndpoint) {
        throw new HTTPException(400, {
            message: `Model "${model}" is available only on: ${entry.supportedEndpoints.join(", ")}.`,
        });
    }
    if (
        supportedEndpoint &&
        !entry.supportedEndpoints.includes(supportedEndpoint)
    ) {
        throw new HTTPException(400, {
            message: `Model "${model}" cannot be used on ${supportedEndpoint}. Supported endpoints: ${entry.supportedEndpoints.join(", ")}.`,
        });
    }

    const configuredFallback = entry.definition.fallbackModel;
    const fallback = configuredFallback
        ? registry.resolve(configuredFallback)
        : null;
    const fallbackCommunity = fallback?.communityEndpoint;
    const fallbackAllowed =
        fallback &&
        fallback.id !== entry.id &&
        fallback.eventType === entry.eventType &&
        (!supportedEndpoint ||
            fallback.supportedEndpoints.includes(supportedEndpoint)) &&
        (!fallbackCommunity ||
            fallbackCommunity.visibility === "public" ||
            fallbackCommunity.ownerUserId === callerUserId) &&
        isModelFallbackCompatible(entry.definition, fallback.definition);

    return {
        requested: model,
        resolved: entry.id,
        definition: entry.definition,
        ...(entry.communityEndpoint && {
            communityEndpoint: entry.communityEndpoint,
        }),
        ...(fallbackAllowed && { fallbackModel: fallback.id }),
    };
}

/**
 * Middleware that extracts, defaults, and resolves the model from the request.
 * Must run after auth and before track so private endpoints can be owner-gated.
 */
export function resolveModel(
    eventType: EventType,
    options?: ResolveModelOptions,
) {
    return createMiddleware<{
        Bindings: CloudflareBindings;
        Variables: ModelVariables & Partial<AuthVariables>;
    }>(async (c, next) => {
        // Extract model from request
        let rawModel: string | null = null;

        if (c.req.method === "GET") {
            rawModel = c.req.query("model") || null;
        } else if (c.req.method === "POST") {
            const contentType = c.req.header("content-type") || "";
            if (contentType.includes("multipart/form-data")) {
                try {
                    const formData = await c.req.formData();
                    rawModel = (formData.get("model") as string) || null;
                    // Store formData to avoid re-parsing in route handlers
                    c.set("formData", formData);
                } catch {
                    // Form parsing failed, use default
                }
            } else if (hasJsonContentType(contentType)) {
                try {
                    const body =
                        getValidatedJsonBody<{ model?: string }>(c.req) ||
                        ((await c.req.raw.clone().json()) as
                            | { model?: string }
                            | undefined);
                    rawModel = body?.model || null;
                } catch {
                    throw new HTTPException(400, {
                        message: "Invalid JSON body",
                    });
                }
            }
        }

        // Apply default based on event type
        const defaultModel =
            options?.defaultModel ||
            (eventType === "generate.text"
                ? DEFAULT_TEXT_MODEL
                : eventType === "generate.audio"
                  ? DEFAULT_AUDIO_MODEL
                  : eventType === "generate.embedding"
                    ? DEFAULT_EMBEDDING_MODEL
                    : eventType === "generate.realtime"
                      ? DEFAULT_REALTIME_MODEL
                      : DEFAULT_IMAGE_MODEL);
        const model = rawModel || defaultModel;
        // auth() runs before resolveModel on the authenticated generation
        // routes, so the caller identity is available to gate private
        // endpoints. If it isn't (unauthenticated path), callerUserId is
        // undefined and a private endpoint fails closed — never exposed.
        const resolvedModel = await resolveModelDefinition(
            model,
            eventType,
            c.env,
            c.var.auth?.user?.id,
            options?.supportedEndpoint,
        );
        c.set("model", resolvedModel);
        if (resolvedModel.fallbackModel && !getModelFallbackSource(c.req.raw)) {
            const validatedJson = getValidatedJsonBody<Record<string, unknown>>(
                c.req,
            );
            const fallbackRequest = await createFallbackRequest(
                c.req.raw,
                resolvedModel.fallbackModel,
                resolvedModel.resolved,
                validatedJson,
                c.var.formData,
            );
            if (fallbackRequest) c.set("fallbackRequest", fallbackRequest);
        }
        await next();
    });
}
