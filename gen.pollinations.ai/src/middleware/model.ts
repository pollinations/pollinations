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
import { getGenerationModelRegistry } from "../model-registry.ts";

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
        definition: ModelDefinition<string>;
        communityEndpoint?: CommunityEndpointRuntime;
    };
    formData?: FormData;
};

type ResolveModelOptions = {
    defaultModel?: string;
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
): Promise<ModelVariables["model"]> {
    const registry = await getGenerationModelRegistry(env);
    const entry = registry.resolve(model);
    if (!entry) {
        const disabledEntry = registry.resolveIncludingDisabled(model);
        if (disabledEntry?.communityEndpoint?.disabledAt) {
            throw new HTTPException(400, {
                message: `Community model "${model}" has been deactivated: ${
                    disabledEntry.communityEndpoint.disabledReason ??
                    "repeated upstream failures"
                }. Contact the model owner or see your dashboard to reactivate.`,
            });
        }
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

    return {
        requested: model,
        resolved: entry.id,
        definition: entry.definition,
        ...(entry.communityEndpoint && {
            communityEndpoint: entry.communityEndpoint,
        }),
    };
}

/**
 * Middleware that extracts, defaults, and resolves the model from the request.
 * Must run before auth and track middlewares.
 */
export function resolveModel(
    eventType: EventType,
    options?: ResolveModelOptions,
) {
    return createMiddleware<{
        Bindings: CloudflareBindings;
        Variables: ModelVariables;
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
        c.set("model", await resolveModelDefinition(model, eventType, c.env));
        await next();
    });
}
