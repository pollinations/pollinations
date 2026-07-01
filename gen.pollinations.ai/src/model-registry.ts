import type { CommunityEndpointRuntime } from "@shared/community-endpoints.ts";
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
    definition: ModelDefinition<string>;
    info: ModelInfo;
    communityEndpoint?: CommunityEndpointRuntime;
    visible: boolean;
};

export type GenerationModelRegistry = {
    resolve: (model: string) => GenerationModelEntry | null;
    /** Like `resolve`, but also returns deactivated community entries — used
     * only to produce a specific "deactivated: <reason>" error message. */
    resolveIncludingDisabled: (model: string) => GenerationModelEntry | null;
    visibleEntries: () => GenerationModelEntry[];
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
    if (eventType === "generate.audio") return ["/audio/{text}"];
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
        supportedEndpoints: supportedEndpointsForEventType(eventType),
        definition,
        info: modelInfoFromDefinition(modelName, definition),
        visible: definition.hidden !== true,
    };
});

function communityEntryToGenerationEntry(
    entry: CommunityModelRegistryEntry,
): GenerationModelEntry {
    return {
        id: entry.id,
        aliases: entry.aliases,
        eventType: "generate.text",
        supportedEndpoints: communityTextSupportedEndpoints(),
        definition: entry.definition,
        info: entry.info,
        communityEndpoint: entry.communityEndpoint,
        visible: entry.communityEndpoint.disabledAt === null,
    };
}

function buildRegistry(
    entries: GenerationModelEntry[],
): GenerationModelRegistry {
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

    const resolveIncludingDisabled = (model: string) =>
        byIdOrAlias.get(model) ?? null;

    return {
        resolve: (model) => {
            const entry = resolveIncludingDisabled(model);
            // Deactivated community models don't exist as far as callers are
            // concerned — unlike static `hidden` models (intentionally
            // unlisted but still callable), a disabled community endpoint is
            // broken and must be unreachable everywhere, not just unlisted.
            if (entry?.communityEndpoint?.disabledAt) return null;
            return entry;
        },
        resolveIncludingDisabled,
        visibleEntries: () => entries.filter((entry) => entry.visible),
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
