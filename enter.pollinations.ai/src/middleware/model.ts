import { DEFAULT_AUDIO_MODEL } from "@shared/registry/audio.ts";
import { DEFAULT_IMAGE_MODEL } from "@shared/registry/image.ts";
import { resolveServiceId, type ServiceId } from "@shared/registry/registry.ts";
import { DEFAULT_TEXT_MODEL } from "@shared/registry/text.ts";
import type { EventType } from "@shared/registry/types.ts";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";

export type ModelVariables = {
    model: {
        /** The model string from the request (before resolution) */
        requested: string;
        /** The resolved canonical service ID */
        resolved: ServiceId;
    };
};

/**
 * Middleware that extracts, defaults, and resolves the model from the request.
 * Must run before auth and track middlewares.
 */
export function resolveModel(eventType: EventType, defaultOverride?: string) {
    return createMiddleware<{ Variables: ModelVariables }>(async (c, next) => {
        // Extract model from request
        let rawModel: string | null = null;

        if (c.req.method === "GET") {
            rawModel = c.req.query("model") || null;
        } else if (c.req.method === "POST") {
            const contentType = c.req.header("Content-Type") || "";
            if (contentType.includes("multipart/form-data")) {
                try {
                    const formData = await c.req.formData();
                    rawModel = formData.get("model") as string | null;
                } catch {
                    // FormData parsing failed, use default
                }
            } else {
                try {
                    const body = await c.req.json();
                    rawModel = body.model || null;
                } catch {
                    // Body parsing failed, use default
                }
            }
        }

        // Apply default: explicit override > event-type default
        const defaultModel =
            defaultOverride ||
            (eventType === "generate.text"
                ? DEFAULT_TEXT_MODEL
                : eventType === "generate.audio"
                  ? DEFAULT_AUDIO_MODEL
                  : DEFAULT_IMAGE_MODEL);
        const model = rawModel || defaultModel;

        // Resolve alias to canonical service ID
        // If resolution fails, throw a 400 error with the original error message
        let resolved: ServiceId;
        try {
            resolved = resolveServiceId(model);
        } catch (error) {
            throw new HTTPException(400, {
                message:
                    error instanceof Error
                        ? error.message
                        : `Invalid model: ${model}`,
            });
        }

        c.set("model", {
            requested: model,
            resolved,
        });

        await next();
    });
}
