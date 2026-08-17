import {
    type CommunityEndpointRuntime,
    type CommunityModelAccess,
    canAccessCommunityModel,
} from "@shared/community-endpoints.ts";
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
        /**
         * Extra cache-key scope for models whose output is not shareable
         * between callers. Unset means the response is cacheable platform-wide,
         * which is the default for every static and external community model.
         */
        cacheScope?: string;
        /** Entry that serves the request when this model's upstream fails. */
        fallbackEntries?: GenerationModelEntry[];
    };
    /**
     * Set by the generation handlers when the fallback target actually served
     * the request. Cost and the community owner reward follow it; the price the
     * caller pays does not — that stays the listing they asked for.
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
    access: CommunityModelAccess,
    supportedEndpoint?: string,
): Promise<ModelVariables["model"]> {
    const registry = await getGenerationModelRegistry(env);
    const entry = registry.resolve(model);
    if (!entry) {
        throw new HTTPException(400, {
            message: `Invalid model or alias: "${model}". Must be a valid model name or alias.`,
        });
    }

    // Private endpoints exist only for their owner; app endpoints also exist
    // for keys issued through that owner's apps. Reuse the same "invalid model"
    // response as an unknown name so neither is discoverable by probing.
    const community = entry.communityEndpoint;
    if (community && !canAccessCommunityModel(community, access)) {
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
        // An agent run executes tools and spends the caller's balance, so its
        // answer belongs to that caller and must never be replayed to another.
        ...(entry.communityEndpoint?.kind === "agent" && {
            cacheScope: `agent:${entry.communityEndpoint.agentId}`,
        }),
        ...(entry.fallbackEntries && {
            fallbackEntries: entry.fallbackEntries,
        }),
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
        // routes, so caller and app-issuer identity are both available to gate
        // non-public endpoints. On an unauthenticated path both are undefined
        // and access fails closed — never exposed.
        const resolved = await resolveModelDefinition(
            model,
            eventType,
            c.env,
            {
                callerUserId: c.var.auth?.user?.id,
                appOwnerUserId: c.var.auth?.apiKey?.byopClientUserId,
            },
            options?.supportedEndpoint,
        );
        // Hidden registry fallbacks are provider implementations of the public
        // model the caller selected, so they inherit that model's permission.
        // Visible and community targets remain independently scoped: a key can
        // never be served — or billed for — a model it could not call directly.
        const allowedModels = c.var.auth?.apiKey?.permissions?.models;
        if (allowedModels && resolved.fallbackEntries) {
            resolved.fallbackEntries = resolved.fallbackEntries.filter(
                (entry) =>
                    (entry.definition.hidden === true &&
                        !entry.communityEndpoint) ||
                    allowedModels.includes(entry.id),
            );
        }
        c.set("model", resolved);
        await next();
    });
}
