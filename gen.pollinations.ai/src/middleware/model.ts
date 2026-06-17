import {
    type CommunityEndpointRuntime,
    communityModelDefinition,
    parseCommunityModelId,
} from "@shared/community-endpoints.ts";
import { AUDIO_SERVICES, DEFAULT_AUDIO_MODEL } from "@shared/registry/audio.ts";
import {
    DEFAULT_EMBEDDING_MODEL,
    EMBEDDING_SERVICES,
} from "@shared/registry/embeddings.ts";
import { DEFAULT_IMAGE_MODEL, IMAGE_SERVICES } from "@shared/registry/image.ts";
import {
    DEFAULT_REALTIME_MODEL,
    REALTIME_SERVICES,
} from "@shared/registry/realtime.ts";
import {
    getRegistryModelDefinition,
    type ModelDefinition,
    type ModelName,
    resolveModelName,
} from "@shared/registry/registry.ts";
import { DEFAULT_TEXT_MODEL, TEXT_SERVICES } from "@shared/registry/text.ts";
import type { EventType } from "@shared/schemas/generation-event.ts";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { getCommunityEndpointRuntime } from "../community-models.ts";

const SERVICES_BY_EVENT_TYPE = {
    "generate.text": TEXT_SERVICES,
    "generate.image": IMAGE_SERVICES,
    "generate.audio": AUDIO_SERVICES,
    "generate.embedding": EMBEDDING_SERVICES,
    "generate.realtime": REALTIME_SERVICES,
} as const satisfies Record<EventType, Record<string, unknown>>;

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
    const communityModel = parseCommunityModelId(model);
    if (communityModel) {
        if (eventType !== "generate.text") {
            throw new HTTPException(400, {
                message: "Community endpoints only support text requests",
            });
        }
        const endpoint = await getCommunityEndpointRuntime(env.DB, model);
        if (!endpoint) {
            throw new HTTPException(400, {
                message: `Invalid community endpoint: "${model}"`,
            });
        }
        return {
            requested: model,
            resolved: model,
            definition: communityModelDefinition(endpoint),
            communityEndpoint: endpoint,
        };
    }

    let resolved: ModelName;
    try {
        resolved = resolveModelName(model);
    } catch (error) {
        throw new HTTPException(400, {
            message:
                error instanceof Error
                    ? error.message
                    : `Invalid model: ${model}`,
        });
    }

    if (!(resolved in SERVICES_BY_EVENT_TYPE[eventType])) {
        const actualCategory = (
            [
                "generate.text",
                "generate.image",
                "generate.audio",
                "generate.embedding",
                "generate.realtime",
            ] as const
        ).find((et) => resolved in SERVICES_BY_EVENT_TYPE[et]);
        const actualLabel = actualCategory
            ? ENDPOINT_LABEL[actualCategory]
            : "unknown";
        throw new HTTPException(400, {
            message: `Model "${model}" is a ${actualLabel} model and cannot be used on the ${ENDPOINT_LABEL[eventType]} endpoint. Use the ${actualLabel} endpoint instead.`,
        });
    }

    return {
        requested: model,
        resolved,
        definition: getRegistryModelDefinition(resolved),
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
