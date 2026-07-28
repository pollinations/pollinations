import type { CommunityEndpointRuntime } from "@shared/community-endpoints.ts";
import { DEFAULT_AUDIO_MODEL } from "@shared/registry/audio.ts";
import { DEFAULT_EMBEDDING_MODEL } from "@shared/registry/embeddings.ts";
import { DEFAULT_IMAGE_MODEL } from "@shared/registry/image.ts";
import { DEFAULT_REALTIME_MODEL } from "@shared/registry/realtime.ts";
import type { ModelDefinition } from "@shared/registry/registry.ts";
import { DEFAULT_TEXT_MODEL } from "@shared/registry/text.ts";
import type { EventType } from "@shared/schemas/generation-event.ts";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import {
    type GenerationModelEntry,
    getGenerationModelRegistry,
} from "../model-registry.ts";
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
        /** Entry that serves the request when this model's upstream fails. */
        fallbackEntry?: GenerationModelEntry;
    };
    /**
     * Set by the generation handlers when the fallback target actually served
     * the request. Billing follows it: cost, price multiplier and the community
     * owner reward all come from the model that served, never the one asked for.
     */
    servedModelEntry?: GenerationModelEntry;
    formData?: FormData;
};

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

    return {
        requested: model,
        resolved: entry.id,
        definition: entry.definition,
        ...(entry.communityEndpoint && {
            communityEndpoint: entry.communityEndpoint,
        }),
        ...(entry.fallbackEntry && { fallbackEntry: entry.fallbackEntry }),
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
        const resolved = await resolveModelDefinition(
            model,
            eventType,
            c.env,
            c.var.auth?.user?.id,
            options?.supportedEndpoint,
        );
        // An API key's model allowlist scopes what the key may be served, not
        // just what it may ask for. Drop the fallback when the target is off
        // the list: the request still runs against the primary, but a scoped
        // key can never be served — or billed for — a model it would get a 403
        // for if it called it directly.
        const allowedModels = c.var.auth?.apiKey?.permissions?.models;
        if (
            resolved.fallbackEntry &&
            allowedModels &&
            !allowedModels.includes(resolved.fallbackEntry.id)
        ) {
            resolved.fallbackEntry = undefined;
        }
        c.set("model", resolved);
        await next();
    });
}
