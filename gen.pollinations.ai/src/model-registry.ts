import {
    type CommunityEndpointRuntime,
    isCommunityFallbackPricingAllowed,
    MAX_FALLBACK_TARGETS,
} from "@shared/community-endpoints.ts";
import {
    type ModelInfo,
    modelInfoFromDefinition,
} from "@shared/registry/model-info.ts";
import {
    type Category,
    getModels,
    getRegistryModelDefinition,
    type ModelDefinition,
} from "@shared/registry/registry.ts";
import type { EventType } from "@shared/schemas/generation-event.ts";
import {
    type CommunityModelRegistryEntry,
    communityImageSupportedEndpoints,
    communityTextSupportedEndpoints,
    getCommunityModelRegistryEntries,
} from "./community-models.ts";

const REGISTRY_TTL_MS = 60_000;
const TEXT_MODEL_ENDPOINTS = [
    "/v1/chat/completions",
    "/text",
    "/text/{prompt}",
];
const IMAGE_MODEL_ENDPOINTS = [
    "/v1/images/generations",
    "/v1/images/edits",
    "/image/{prompt}",
];

export type GenerationModelEntry = {
    id: string;
    aliases: string[];
    eventType: EventType;
    supportedEndpoints: string[];
    definition: ModelDefinition;
    info: ModelInfo;
    communityEndpoint?: CommunityEndpointRuntime;
    visible: boolean;
    // Entries that serve this model when its own upstream fails, in the order
    // its owner declared them, resolved once at registry build time so the hot
    // path never does a second lookup. A fallback's own list is not followed:
    // one owner's declaration cannot redirect another owner's traffic, which
    // also makes a routing cycle impossible.
    fallbackEntries?: GenerationModelEntry[];
};

export type GenerationModelRegistry = {
    resolve: (model: string) => GenerationModelEntry | null;
    visibleEntries: (callerUserId?: string) => GenerationModelEntry[];
};

type CachedRegistry = {
    dbBinding: CloudflareBindings["DB"] | undefined;
    expiresAt: number;
    registry: GenerationModelRegistry;
};

type PendingRegistryLoad = {
    dbBinding: CloudflareBindings["DB"] | undefined;
    promise: Promise<GenerationModelRegistry>;
};

let cachedRegistry: CachedRegistry | null = null;
let pendingRegistryLoad: PendingRegistryLoad | null = null;

function eventTypeForCategory(category: Category): EventType {
    if (category === "audio") return "generate.audio";
    if (category === "embedding") return "generate.embedding";
    if (category === "realtime") return "generate.realtime";
    if (category === "text") return "generate.text";
    return "generate.image";
}

function supportedEndpointsForEventType(eventType: EventType): string[] {
    if (eventType === "generate.text") return TEXT_MODEL_ENDPOINTS;
    if (eventType === "generate.audio") {
        return ["/audio/{text}", "/v1/audio/speech"];
    }
    if (eventType === "generate.embedding") return ["/v1/embeddings"];
    if (eventType === "generate.realtime") return ["/v1/realtime"];
    return IMAGE_MODEL_ENDPOINTS;
}

const STATIC_ENTRIES: GenerationModelEntry[] = getModels().map((modelName) => {
    const definition = getRegistryModelDefinition(modelName);
    const eventType = eventTypeForCategory(definition.category);
    return {
        id: modelName,
        aliases: definition.aliases,
        eventType,
        supportedEndpoints:
            definition.supportedEndpoints ??
            supportedEndpointsForEventType(eventType),
        definition,
        info: modelInfoFromDefinition(modelName, definition),
        visible: definition.hidden !== true,
    };
});

function communityEntryToGenerationEntry(
    entry: CommunityModelRegistryEntry,
): GenerationModelEntry {
    const eventType = eventTypeForCategory(entry.definition.category);
    return {
        id: entry.id,
        aliases: entry.aliases,
        eventType,
        supportedEndpoints:
            eventType === "generate.image"
                ? communityImageSupportedEndpoints(
                      entry.communityEndpoint.supportsImageEdits,
                  )
                : communityTextSupportedEndpoints(),
        definition: entry.definition,
        info: entry.info,
        communityEndpoint: entry.communityEndpoint,
        // Public endpoints appear for everyone. Private endpoints are added
        // back for their owner by visibleEntries().
        visible:
            entry.communityEndpoint.disabledAt === null &&
            entry.communityEndpoint.visibility === "public",
    };
}

// True when `target` is still a legal fallback for `from`.
function isUsableFallbackTarget(
    from: GenerationModelEntry,
    target: GenerationModelEntry | undefined,
): target is GenerationModelEntry {
    // Write-time validation is only a UX guard — a target can since have been
    // deleted, deactivated, made private or repriced above the primary, so
    // re-check everything here before linking.
    if (!target || target === from) return false;
    if (!target.visible || target.eventType !== from.eventType) return false;
    const fromEndpoint = from.communityEndpoint;
    const targetEndpoint = target.communityEndpoint;
    if (fromEndpoint && targetEndpoint) {
        // The shared price columns mean Pollen per generated image in "request"
        // mode and Pollen per token in "tokens" mode, so a cross-mode
        // comparison is meaningless — and either side can switch mode long
        // after the link was configured, without touching the other's row.
        // Same rule the write path applies.
        if (fromEndpoint.imagePricing !== targetEndpoint.imagePricing) {
            return false;
        }
        if (!isCommunityFallbackPricingAllowed(fromEndpoint, targetEndpoint)) {
            return false;
        }
    }
    return true;
}

/**
 * Resolves each entry's declared fallbacks against the registry it was built
 * with. A community entry declares them through its endpoint row, a static one
 * through `definition.fallbacks`.
 *
 * Every target is validated against the entry that declared it, so each one is
 * priced at or below the model the caller actually asked for.
 */
function linkFallbackEntries(
    entries: GenerationModelEntry[],
    byIdOrAlias: Map<string, GenerationModelEntry>,
): void {
    for (const entry of entries) {
        const declared =
            entry.communityEndpoint?.fallbackModelIds ??
            entry.definition.fallbacks ??
            [];
        const seen = new Set<string>();
        const targets: GenerationModelEntry[] = [];
        for (const targetId of declared) {
            if (targets.length >= MAX_FALLBACK_TARGETS) break;
            const target = byIdOrAlias.get(targetId);
            if (!isUsableFallbackTarget(entry, target)) continue;
            // Two declared ids can resolve to one entry through an alias.
            if (seen.has(target.id)) continue;
            seen.add(target.id);
            // Link a copy with an empty list of its own: routing follows only
            // what this entry's owner declared.
            targets.push({ ...target, fallbackEntries: undefined });
        }
        entry.fallbackEntries = targets.length > 0 ? targets : undefined;
    }
}

function buildRegistry(
    sourceEntries: GenerationModelEntry[],
): GenerationModelRegistry {
    // Link on copies: STATIC_ENTRIES is module-level and shared across registry
    // rebuilds, so resolution must never mutate the originals.
    const entries = sourceEntries.map((entry) => ({ ...entry }));
    const byIdOrAlias = new Map<string, GenerationModelEntry>();
    for (const entry of entries) {
        if (!byIdOrAlias.has(entry.id)) {
            byIdOrAlias.set(entry.id, entry);
        }
    }
    for (const entry of entries) {
        for (const alias of entry.aliases) {
            if (!byIdOrAlias.has(alias)) {
                byIdOrAlias.set(alias, entry);
            }
        }
    }
    linkFallbackEntries(entries, byIdOrAlias);

    return {
        resolve: (model) => {
            const entry = byIdOrAlias.get(model) ?? null;
            // Deactivated community models don't exist as far as callers are
            // concerned — unlike static `hidden` models (intentionally
            // unlisted but still callable), a disabled community endpoint is
            // broken and must be unreachable everywhere, not just unlisted.
            if (entry?.communityEndpoint?.disabledAt) return null;
            return entry;
        },
        visibleEntries: (callerUserId) =>
            entries.filter((entry) => {
                if (entry.visible) return true;
                const endpoint = entry.communityEndpoint;
                return (
                    endpoint?.disabledAt === null &&
                    endpoint.visibility === "private" &&
                    endpoint.ownerUserId === callerUserId
                );
            }),
    };
}

async function loadGenerationModelRegistry(
    dbBinding: CloudflareBindings["DB"] | undefined,
): Promise<GenerationModelRegistry> {
    const communityEntries = (
        await getCommunityModelRegistryEntries(dbBinding)
    ).map(communityEntryToGenerationEntry);
    return buildRegistry([...STATIC_ENTRIES, ...communityEntries]);
}

export async function getGenerationModelRegistry(
    env: Pick<CloudflareBindings, "DB">,
): Promise<GenerationModelRegistry> {
    const now = Date.now();
    if (
        cachedRegistry &&
        cachedRegistry.dbBinding === env.DB &&
        cachedRegistry.expiresAt > now
    ) {
        return cachedRegistry.registry;
    }

    if (!pendingRegistryLoad || pendingRegistryLoad.dbBinding !== env.DB) {
        const dbBinding = env.DB;
        pendingRegistryLoad = {
            dbBinding,
            promise: loadGenerationModelRegistry(dbBinding)
                .then((registry) => {
                    cachedRegistry = {
                        dbBinding,
                        expiresAt: Date.now() + REGISTRY_TTL_MS,
                        registry,
                    };
                    return registry;
                })
                .finally(() => {
                    if (pendingRegistryLoad?.dbBinding === dbBinding) {
                        pendingRegistryLoad = null;
                    }
                }),
        };
    }

    return pendingRegistryLoad.promise;
}

export function resetGenerationModelRegistryCache(): void {
    cachedRegistry = null;
    pendingRegistryLoad = null;
}
