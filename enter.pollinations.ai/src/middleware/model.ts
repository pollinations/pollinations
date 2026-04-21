import { AUDIO_SERVICES, DEFAULT_AUDIO_MODEL } from "@shared/registry/audio.ts";
import { DEFAULT_IMAGE_MODEL, IMAGE_SERVICES } from "@shared/registry/image.ts";
import { type ModelName, resolveModelName } from "@shared/registry/registry.ts";
import { DEFAULT_TEXT_MODEL, TEXT_SERVICES } from "@shared/registry/text.ts";
import type { EventType } from "@shared/registry/types.ts";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";

export type ModelVariables = {
    model: {
        /** The model string from the request (before resolution) */
        requested: string;
        /** The resolved canonical model name, or null if the request could
         * not be resolved to a model in this endpoint's family. */
        resolved: ModelName | null;
        /** Present when resolved is null — the reason resolution failed. */
        error?: string;
    };
    formData?: FormData;
};

type ResolveModelOptions = {
    defaultModel?: string;
};

const MODEL_REGISTRIES_BY_EVENT_TYPE = {
    "generate.text": TEXT_SERVICES,
    "generate.image": IMAGE_SERVICES,
    "generate.audio": AUDIO_SERVICES,
} as const;

/**
 * Extracts the model from the request and tries to resolve it to a canonical
 * name belonging to the endpoint's family. On failure (unknown alias or
 * family mismatch) it records the error on c.var.model and continues so that
 * `track` can still log the malformed request. The `enforceModel` middleware,
 * which must run after `track`, is what turns the failure into a 400.
 */
export function resolveModel(
    eventType: EventType,
    options?: ResolveModelOptions,
) {
    return createMiddleware<{ Variables: ModelVariables }>(async (c, next) => {
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
            } else {
                try {
                    const body = await c.req.json();
                    rawModel = body.model || null;
                } catch {
                    // Body parsing failed, use default
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
                  : DEFAULT_IMAGE_MODEL);
        const model = rawModel || defaultModel;

        let resolved: ModelName | null = null;
        let error: string | undefined;

        try {
            const candidate = resolveModelName(model);
            if (
                Object.hasOwn(
                    MODEL_REGISTRIES_BY_EVENT_TYPE[eventType],
                    candidate,
                )
            ) {
                resolved = candidate;
            } else {
                error = `Model "${candidate}" is not valid for this endpoint.`;
            }
        } catch (err) {
            error =
                err instanceof Error ? err.message : `Invalid model: ${model}`;
        }

        c.set("model", { requested: model, resolved, error });

        await next();
    });
}

/**
 * Rejects requests whose model could not be resolved for the endpoint's
 * family. Registered AFTER `track` so the rejected request is logged to
 * Tinybird before the 400 propagates. The Tinybird row carries
 * `resolvedModelRequested: null`, which the datasource schema coerces to the
 * literal string 'undefined' — the existing "gateway-health" bucket.
 */
export const enforceModel = () =>
    createMiddleware<{ Variables: ModelVariables }>(async (c, next) => {
        const model = c.var.model;
        if (model.resolved === null) {
            throw new HTTPException(400, {
                message: model.error ?? `Invalid model: ${model.requested}`,
            });
        }
        await next();
    });
