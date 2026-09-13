import {
    type CommunityEndpointRuntime,
    usesAgentRunToken,
} from "@shared/community-endpoints.ts";
import { DEFAULT_AUDIO_MODEL } from "@shared/registry/audio.ts";
import { DEFAULT_EMBEDDING_MODEL } from "@shared/registry/embeddings.ts";
import { DEFAULT_IMAGE_MODEL } from "@shared/registry/image.ts";
import { DEFAULT_REALTIME_MODEL } from "@shared/registry/realtime.ts";
import type { ModelDefinition } from "@shared/registry/registry.ts";
import { DEFAULT_TEXT_MODEL } from "@shared/registry/text.ts";
import { MODEL_REQUESTED_HEADER } from "@shared/registry/usage-headers.ts";
import type { EventType } from "@shared/schemas/generation-event.ts";
import type { SafetyFeature } from "@shared/schemas/safety.ts";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import {
    type GenerationModelEntry,
    type GenerationModelRegistry,
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
    formData?: FormData;
};

/** Required checks for every provider this request may reach. */
export function getRequiredSafetyFeatures(
    model: ModelVariables["model"] | undefined,
): SafetyFeature[] {
    const features = new Set(model?.definition.requiredSafetyFeatures ?? []);
    for (const fallback of model?.fallbackEntries ?? []) {
        for (const feature of fallback.definition.requiredSafetyFeatures ??
            []) {
            features.add(feature);
        }
    }
    return [...features].sort();
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

/**
 * A caller names their own fallback chain by listing models: "a,b,c" serves
 * with a and tries b, then c, if it fails. Capped because every extra entry is
 * one more upstream attempt the caller's own request waits on.
 */
const MAX_REQUESTED_MODELS = 4;

/** The models a caller asked for, in the order they want them tried. */
export function requestedModelIds(model: string): string[] {
    if (!model.includes(",")) return [model];
    const ids = [
        ...new Set(
            model
                .split(",")
                .map((id) => id.trim())
                .filter(Boolean),
        ),
    ];
    if (ids.length === 0) {
        throw new HTTPException(400, {
            message: `Invalid model or alias: "${model}". Must be a valid model name or alias.`,
        });
    }
    if (ids.length > MAX_REQUESTED_MODELS) {
        throw new HTTPException(400, {
            message: `Too many models: "${model}" lists ${ids.length}, at most ${MAX_REQUESTED_MODELS} are tried.`,
        });
    }
    return ids;
}

function resolveModelEntry(
    registry: GenerationModelRegistry,
    model: string,
    eventType: EventType,
    callerUserId?: string,
    supportedEndpoint?: string,
): GenerationModelEntry {
    const entry = registry.resolve(model);
    if (!entry) {
        throw new HTTPException(400, {
            message: `Invalid model or alias: "${model}". Must be a valid model name or alias.`,
        });
    }

    // Provider routes are registry entries so fallback linking and billing can
    // use them, but callers must select the public model they belong to.
    if (entry.definition.fallbackOnly === true) {
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

    return entry;
}

export async function resolveModelDefinition(
    model: string,
    eventType: EventType,
    env: CloudflareBindings,
    callerUserId?: string,
    supportedEndpoint?: string,
): Promise<ModelVariables["model"]> {
    const registry = await getGenerationModelRegistry(env);
    const [entry, ...alternates] = requestedModelIds(model).map((id) =>
        resolveModelEntry(
            registry,
            id,
            eventType,
            callerUserId,
            supportedEndpoint,
        ),
    );
    // A declared route is still the model the caller named, so it is tried
    // before their next choice. An alternate contributes only itself, so the
    // chain stays as short as the list the caller can see.
    const fallbackEntries = uniqueById(entry.id, [
        ...(entry.fallbackEntries ?? []),
        ...alternates.map((alternate) => ({
            ...alternate,
            fallbackEntries: undefined,
        })),
    ]);
    // An agent run executes tools and spends the caller's balance, so its
    // answer belongs to that caller and must never be replayed to another —
    // whether it serves as the primary or as someone's listed alternate.
    const agent = [entry, ...alternates].find(
        (candidate) =>
            candidate.communityEndpoint &&
            usesAgentRunToken(candidate.communityEndpoint),
    );
    return {
        requested: model,
        resolved: entry.id,
        definition: entry.definition,
        ...(entry.communityEndpoint && {
            communityEndpoint: entry.communityEndpoint,
        }),
        ...(agent && { cacheScope: `agent:${agent.id}` }),
        ...(fallbackEntries.length > 0 && { fallbackEntries }),
    };
}

function uniqueById(
    primaryId: string,
    entries: GenerationModelEntry[],
): GenerationModelEntry[] {
    const seen = new Set([primaryId]);
    const unique: GenerationModelEntry[] = [];
    for (const entry of entries) {
        if (seen.has(entry.id)) continue;
        seen.add(entry.id);
        unique.push(entry);
    }
    return unique;
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
        // Fallback-only entries are provider implementations of the public
        // model the caller selected, so they inherit that model's permission.
        // Visible and community targets remain independently scoped: a key can
        // never be served — or billed for — a model it could not call directly.
        const allowedModels = c.var.auth?.apiKey?.permissions?.models;
        if (allowedModels && resolved.fallbackEntries) {
            resolved.fallbackEntries = resolved.fallbackEntries.filter(
                (entry) =>
                    (entry.definition.fallbackOnly === true &&
                        !entry.communityEndpoint) ||
                    allowedModels.includes(entry.id),
            );
        }
        c.set("model", resolved);
        c.header(MODEL_REQUESTED_HEADER, resolved.resolved);
        await next();
    });
}
