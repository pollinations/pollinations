import { AUDIO_SERVICES, DEFAULT_AUDIO_MODEL } from "@shared/registry/audio.ts";
import {
    DEFAULT_EMBEDDING_MODEL,
    EMBEDDING_SERVICES,
} from "@shared/registry/embeddings.ts";
import { DEFAULT_IMAGE_MODEL, IMAGE_SERVICES } from "@shared/registry/image.ts";
import { type ModelName, resolveModelName } from "@shared/registry/registry.ts";
import { DEFAULT_TEXT_MODEL, TEXT_SERVICES } from "@shared/registry/text.ts";
import type { EventType } from "@shared/registry/types.ts";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import type { LoggerVariables } from "./logger.ts";

const SERVICES_BY_EVENT_TYPE = {
    "generate.text": TEXT_SERVICES,
    "generate.image": IMAGE_SERVICES,
    "generate.audio": AUDIO_SERVICES,
    "generate.embedding": EMBEDDING_SERVICES,
} as const satisfies Record<EventType, Record<string, unknown>>;

const ENDPOINT_LABEL: Record<EventType, string> = {
    "generate.text": "text",
    "generate.image": "image",
    "generate.audio": "audio",
    "generate.embedding": "embeddings",
};

export type ModelVariables = {
    model: {
        /** The model string from the request (before resolution) */
        requested: string;
        /** The resolved canonical model name */
        resolved: ModelName;
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

/**
 * Middleware that extracts, defaults, and resolves the model from the request.
 * Must run before auth and track middlewares.
 */
export function resolveModel(
    eventType: EventType,
    options?: ResolveModelOptions,
) {
    return createMiddleware<{ Variables: ModelVariables & LoggerVariables }>(
        async (c, next) => {
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
                    } catch (error) {
                        // Route handlers parse again so multipart failures are tracked and logged there.
                        // Log here too in case a route doesn't reparse.
                        c.get("log")?.debug(
                            "Multipart parse failed in model middleware: {message}",
                            {
                                message:
                                    error instanceof Error
                                        ? error.message
                                        : String(error),
                            },
                        );
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
                        : DEFAULT_IMAGE_MODEL);
            const model = rawModel || defaultModel;

            // Resolve alias to canonical model name
            // If resolution fails, throw a 400 error with the original error message
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

            // Reject models whose category doesn't match this endpoint
            // (e.g. an audio model sent to /v1/chat/completions). Without this,
            // the request would be proxied to the wrong backend and surface
            // as a 5xx upstream error.
            if (!(resolved in SERVICES_BY_EVENT_TYPE[eventType])) {
                const actualCategory = (
                    [
                        "generate.text",
                        "generate.image",
                        "generate.audio",
                        "generate.embedding",
                    ] as const
                ).find((et) => resolved in SERVICES_BY_EVENT_TYPE[et]);
                const actualLabel = actualCategory
                    ? ENDPOINT_LABEL[actualCategory]
                    : "unknown";
                throw new HTTPException(400, {
                    message: `Model "${model}" is a ${actualLabel} model and cannot be used on the ${ENDPOINT_LABEL[eventType]} endpoint. Use the ${actualLabel} endpoint instead.`,
                });
            }

            c.set("model", {
                requested: model,
                resolved,
            });

            await next();
        },
    );
}
