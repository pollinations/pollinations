/**
 * Temporary read-through for the retired binary cache (base c8994770aa).
 * Remove this file, its test, withLegacyMediaCache's call/import, and the
 * LEGACY_MEDIA_BUCKET binding when migration is no longer useful. No cutoff.
 * Keep the old identity algorithm here rather than in the normal cache path.
 */
import {
    parseSafeFeatures,
    SAFETY_HEADER_NAME,
    type SafetyFeature,
} from "@shared/schemas/safety.ts";
import type { Context } from "hono";
import {
    type GenerationCacheAdapter,
    type GenerationCacheEnv,
    hashGenerationCacheIdentity,
} from "./generation-cache.ts";
import { getRequiredSafetyFeatures, type ModelVariables } from "./model.ts";

/** Frozen pre-migration key format, including query and safety normalization. */
export function legacyMediaCacheKey(
    url: URL,
    safeHeader?: string | null,
    requiredSafetyFeatures: readonly SafetyFeature[] = [],
): string {
    const normalized = new URL(url);
    const hasQuerySafe = normalized.searchParams.has("safe");
    const usesSafety =
        parseSafeFeatures(normalized.searchParams.get("safe")).size > 0;
    const usesHeaderSafety =
        !hasQuerySafe && parseSafeFeatures(safeHeader).size > 0;
    const params = [...normalized.searchParams.entries()].sort(([a], [b]) =>
        a.localeCompare(b),
    );
    normalized.search = "";
    for (const [name, value] of params) {
        if (!["nofeed", "no-cache", "key"].includes(name.toLowerCase())) {
            normalized.searchParams.append(name, value);
        }
    }
    if (safeHeader !== undefined && safeHeader !== null && !hasQuerySafe) {
        normalized.searchParams.append("__safe_header", safeHeader);
    }
    if (requiredSafetyFeatures.length) {
        normalized.searchParams.append(
            "__required_safety",
            [...new Set(requiredSafetyFeatures)].sort().join(","),
        );
    }
    if (usesSafety || usesHeaderSafety || requiredSafetyFeatures.length) {
        normalized.searchParams.append("__safety", "bedrock-input-v1");
    }
    const fullPath = normalized.pathname + normalized.search;
    let hash = 0;
    for (let i = 0; i < fullPath.length; i++) {
        hash = ((hash << 5) - hash + fullPath.charCodeAt(i)) | 0;
    }
    const prefix = fullPath.replace(/[/\s?=&]/g, "_").substring(0, 990);
    return `${prefix}-${Math.abs(hash).toString(16).substring(0, 8)}`;
}

async function requestLegacyKey(
    c: Context<GenerationCacheEnv>,
): Promise<string> {
    const url = new URL(c.var.generationRequestUrl ?? c.req.url);
    if (c.var.generationCacheBody) {
        url.searchParams.set(
            "__request_body",
            await hashGenerationCacheIdentity(
                "media",
                c.var.generationCacheBody,
            ),
        );
    }
    const variables = c.var as typeof c.var & Partial<ModelVariables>;
    return legacyMediaCacheKey(
        url,
        c.req.header(SAFETY_HEADER_NAME),
        getRequiredSafetyFeatures(variables.model),
    );
}

export function withLegacyMediaCache(
    adapter: GenerationCacheAdapter,
): GenerationCacheAdapter {
    return {
        ...adapter,
        async get(c, key) {
            const cached = await adapter.get(c, key);
            if (cached) return cached;

            const legacy = await c.env.LEGACY_MEDIA_BUCKET.get(
                await requestLegacyKey(c),
            );
            if (!legacy) return null;
            const headers = new Headers({
                "content-type":
                    legacy.httpMetadata?.contentType ||
                    "application/octet-stream",
            });
            for (const [name, value] of Object.entries(
                legacy.customMetadata ?? {},
            )) {
                if (name.startsWith("header_"))
                    headers.set(name.slice(7), value);
            }
            const response = new Response(legacy.body, { headers });
            if (!legacy.size || !adapter.shouldCache(response)) {
                await response.body?.cancel();
                return null;
            }

            // Reuse Gen's header policy and Media's storage. Do not refresh or
            // delete the legacy object. Errors propagate like normal cache errors.
            const { write } = adapter.capture(c, key, response);
            await Promise.all([write, response.body?.cancel()]);
            return adapter.get(c, key);
        },
    };
}
