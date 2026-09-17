import {
    type CommunityEndpointRuntime,
    communityEndpointSupportedEndpoints,
} from "@shared/community-endpoints.ts";
import {
    isSequenceFallbackBalanceAllowed,
    isSequenceFallbackPricingAllowed,
    modelSequenceModelId,
} from "@shared/model-sequences.ts";
import { DEFAULT_AUDIO_MODEL } from "@shared/registry/audio.ts";
import { DEFAULT_EMBEDDING_MODEL } from "@shared/registry/embeddings.ts";
import { DEFAULT_IMAGE_MODEL } from "@shared/registry/image.ts";
import {
    type ModelInfo,
    modelInfoFromDefinition,
} from "@shared/registry/model-info.ts";
import { DEFAULT_3D_MODEL } from "@shared/registry/model3d.ts";
import { DEFAULT_REALTIME_MODEL } from "@shared/registry/realtime.ts";
import {
    type Category,
    getModels,
    getRegistryModelDefinition,
    isVisibleModelDefinition,
    type ModelDefinition,
} from "@shared/registry/registry.ts";
import { DEFAULT_TEXT_MODEL } from "@shared/registry/text.ts";
import type { EventType } from "@shared/schemas/generation-event.ts";
import {
    type AgentCatalogConfig,
    applyAgentMetadata,
} from "./agent-catalog.ts";
import {
    type CommunityModelEnv,
    type CommunityModelRegistryEntry,
    getCommunityModelRegistryEntries,
    resetCommunityModelRegistryCache,
} from "./community-models.ts";
import { linkFallbackEntries } from "./fallback.ts";
import { mediaPromptRoute } from "./media/prompt-route.ts";
import {
    getModelSequenceRegistryRows,
    type ModelSequenceRegistryRow,
} from "./model-sequences.ts";
import { supportsDirectResponses } from "./text/availableModels.ts";

const REGISTRY_TTL_MS = 60_000;
// A static-only registry is cached briefly so the community models come back
// seconds after D1 recovers, instead of being missing for a full TTL.
const DEGRADED_REGISTRY_TTL_MS = 5_000;
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
const CATEGORY_ORDER: Record<Category, number> = {
    text: 0,
    image: 1,
    video: 2,
    "3d": 3,
    audio: 4,
    realtime: 5,
    embedding: 6,
};
const DEFAULT_MODEL_BY_CATEGORY: Partial<Record<Category, string>> = {
    text: DEFAULT_TEXT_MODEL,
    image: DEFAULT_IMAGE_MODEL,
    "3d": DEFAULT_3D_MODEL,
    audio: DEFAULT_AUDIO_MODEL,
    realtime: DEFAULT_REALTIME_MODEL,
    embedding: DEFAULT_EMBEDDING_MODEL,
};

export type GenerationModelEntry = {
    id: string;
    aliases: string[];
    eventType: EventType;
    supportedEndpoints: string[];
    definition: ModelDefinition;
    info: ModelInfo;
    communityEndpoint?: CommunityEndpointRuntime;
    agentConfig?: AgentCatalogConfig;
    // A virtual My Model: present when this entry is an owner-private fallback
    // sequence projected from the model_sequence table.
    modelSequence?: { ownerUserId: string };
    // True on fallback copies linked from a sequence: the owner curated the
    // target list, so key permissions on the sequence cover its targets.
    sequenceTarget?: boolean;
    visible: boolean;
    // Entries that serve this model when its own upstream fails, in declared
    // order. A fallback's own list is not followed, so routing stays depth one.
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

let cachedRegistry: CachedRegistry | null = null;

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
    if (eventType === "generate.realtime") {
        return ["/realtime", "/v1/realtime"];
    }
    return IMAGE_MODEL_ENDPOINTS;
}

const STATIC_ENTRIES: GenerationModelEntry[] = getModels().map((modelName) => {
    const definition = getRegistryModelDefinition(modelName);
    const eventType = eventTypeForCategory(definition.category);
    const baseEndpoints =
        definition.supportedEndpoints ??
        supportedEndpointsForEventType(eventType);
    const supportedEndpoints =
        eventType === "generate.text" && supportsDirectResponses(modelName)
            ? [...baseEndpoints, "/v1/responses"]
            : baseEndpoints;
    const info = modelInfoFromDefinition(modelName, definition);
    return {
        id: modelName,
        aliases: definition.aliases,
        eventType,
        supportedEndpoints,
        definition,
        info: { ...info, supported_endpoints: supportedEndpoints },
        visible: isVisibleModelDefinition(definition),
    };
});

function communityEntryToGenerationEntry(
    entry: CommunityModelRegistryEntry,
): GenerationModelEntry {
    const eventType = eventTypeForCategory(entry.definition.category);
    const supportedEndpoints = communityEndpointSupportedEndpoints(
        entry.communityEndpoint.modality,
        entry.definition.inputModalities ?? [],
    );
    if (
        entry.communityEndpoint.modality === "text" &&
        entry.communityEndpoint.api === "responses"
    ) {
        supportedEndpoints.push("/v1/responses");
    }
    return {
        id: entry.id,
        aliases: entry.aliases,
        eventType,
        supportedEndpoints,
        definition: entry.definition,
        info: { ...entry.info, supported_endpoints: supportedEndpoints },
        communityEndpoint: entry.communityEndpoint,
        agentConfig: entry.agentConfig,
        // Public endpoints appear for everyone. Private endpoints are added
        // back for their owner by visibleEntries().
        visible:
            isVisibleModelDefinition(entry.definition) &&
            entry.communityEndpoint.visibility === "public",
    };
}

function compareModelEntries(
    left: GenerationModelEntry,
    right: GenerationModelEntry,
): number {
    const leftCommunity = left.communityEndpoint !== undefined;
    const rightCommunity = right.communityEndpoint !== undefined;
    if (leftCommunity !== rightCommunity) return leftCommunity ? 1 : -1;

    if (!leftCommunity) {
        const categoryDifference =
            CATEGORY_ORDER[left.definition.category] -
            CATEGORY_ORDER[right.definition.category];
        if (categoryDifference !== 0) return categoryDifference;

        const defaultModel =
            DEFAULT_MODEL_BY_CATEGORY[left.definition.category];
        const defaultDifference =
            Number(right.id === defaultModel) -
            Number(left.id === defaultModel);
        if (defaultDifference !== 0) return defaultDifference;

        const alphaDifference =
            Number(left.definition.alpha === true) -
            Number(right.definition.alpha === true);
        if (alphaDifference !== 0) return alphaDifference;
    }

    const addedDateDifference =
        right.definition.addedDate - left.definition.addedDate;
    if (addedDateDifference !== 0) return addedDateDifference;
    return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

/**
 * A sequence target is revalidated at registry load: it must be a concrete
 * model (never another sequence), share the primary's event type and request
 * surface, stay at or below the primary's price, and not require Paid Pollen
 * the primary does not. Community targets must be listed and either public or
 * owned by the sequence owner; static targets must be visible.
 */
function isUsableSequenceTarget(
    sequence: GenerationModelEntry,
    ownerUserId: string,
    target: GenerationModelEntry,
): boolean {
    if (target.modelSequence) return false;
    if (target.eventType !== sequence.eventType) return false;
    const targetEndpoint = target.communityEndpoint;
    if (targetEndpoint) {
        if (targetEndpoint.hiddenAt != null) return false;
        if (
            targetEndpoint.visibility === "private" &&
            targetEndpoint.ownerUserId !== ownerUserId
        ) {
            return false;
        }
    } else if (!isVisibleModelDefinition(target.definition)) {
        return false;
    }
    if (
        !sequence.supportedEndpoints.every((endpoint) =>
            target.supportedEndpoints.includes(endpoint),
        )
    ) {
        return false;
    }
    if (
        !isSequenceFallbackBalanceAllowed(
            sequence.definition,
            target.definition,
        )
    ) {
        return false;
    }
    return isSequenceFallbackPricingAllowed(
        sequence.definition,
        target.definition,
    );
}

/**
 * Projects a model_sequence row into a registry entry cloned from its primary
 * model: the primary supplies the quoted price, balance class, event type,
 * endpoints, and capabilities, while the sequence overrides identity and
 * declares the remaining ids as fallbacks. Returns null when the primary is
 * gone or no longer callable by the owner - the sequence is disabled, not
 * partially served.
 */
function sequenceRowToGenerationEntry(
    row: ModelSequenceRegistryRow,
    byIdOrAlias: Map<string, GenerationModelEntry>,
): GenerationModelEntry | null {
    const primary = byIdOrAlias.get(row.modelIds[0]);
    if (!primary || primary.modelSequence) return null;
    const primaryEndpoint = primary.communityEndpoint;
    if (primaryEndpoint) {
        if (primaryEndpoint.hiddenAt != null) return null;
        if (
            primaryEndpoint.visibility === "private" &&
            primaryEndpoint.ownerUserId !== row.ownerUserId
        ) {
            return null;
        }
    } else if (!isVisibleModelDefinition(primary.definition)) {
        return null;
    }

    const id = modelSequenceModelId(row.ownerGithubUsername, row.name);
    const description = row.description?.trim();
    const definition: ModelDefinition = {
        ...primary.definition,
        aliases: [],
        fallbacks: row.modelIds.slice(1),
        hidden: false,
        fallbackOnly: undefined,
        title: row.title,
        description: description || primary.definition.description,
        addedDate: row.createdAt.getTime(),
    };
    const entry: GenerationModelEntry = {
        id,
        aliases: [],
        eventType: primary.eventType,
        supportedEndpoints: primary.supportedEndpoints,
        definition,
        info: {
            ...modelInfoFromDefinition(id, definition),
            supported_endpoints: primary.supportedEndpoints,
        },
        modelSequence: { ownerUserId: row.ownerUserId },
        // Owner-private: added back for the owner by visibleEntries().
        visible: false,
    };

    const targets: GenerationModelEntry[] = [];
    for (const targetId of definition.fallbacks ?? []) {
        const target = byIdOrAlias.get(targetId);
        if (!target || target.id === primary.id) continue;
        if (!isUsableSequenceTarget(entry, row.ownerUserId, target)) continue;
        if (targets.some((linked) => linked.id === target.id)) continue;
        targets.push({
            ...target,
            fallbackEntries: undefined,
            sequenceTarget: true,
        });
    }
    entry.fallbackEntries = targets.length > 0 ? targets : undefined;
    return entry;
}

function buildRegistry(
    sourceEntries: GenerationModelEntry[],
    sequenceRows: ModelSequenceRegistryRow[] = [],
): GenerationModelRegistry {
    // Link on copies: STATIC_ENTRIES is module-level and shared across registry
    // rebuilds, so resolution must never mutate the originals.
    const entries: GenerationModelEntry[] = sourceEntries.map((entry) => {
        const supportedEndpoints = mediaPromptRoute(entry)
            ? [
                  ...new Set([
                      ...entry.supportedEndpoints,
                      "/v1/responses",
                      "/v1/chat/completions",
                  ]),
              ]
            : entry.supportedEndpoints;
        return {
            ...entry,
            supportedEndpoints,
            info: { ...entry.info, supported_endpoints: supportedEndpoints },
        };
    });
    // Build lookup keys before presentation sorting so duplicate aliases keep
    // their declaration-order, first-wins resolution behavior.
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
    applyAgentMetadata(entries, byIdOrAlias);
    linkFallbackEntries(entries, byIdOrAlias);

    // Sequences link after every concrete model is registered so their ids
    // resolve against the full catalog. They join the lookup before sorting:
    // first-wins keeps a sequence from shadowing an existing id.
    for (const row of sequenceRows) {
        const entry = sequenceRowToGenerationEntry(row, byIdOrAlias);
        if (!entry) continue;
        if (byIdOrAlias.has(entry.id)) continue;
        byIdOrAlias.set(entry.id, entry);
        entries.push(entry);
    }

    entries.sort(compareModelEntries);

    return {
        resolve: (model) => byIdOrAlias.get(model) ?? null,
        visibleEntries: (callerUserId) =>
            entries.filter((entry) => {
                if (entry.visible) return true;
                if (entry.modelSequence) {
                    return entry.modelSequence.ownerUserId === callerUserId;
                }
                const endpoint = entry.communityEndpoint;
                return (
                    isVisibleModelDefinition(entry.definition) &&
                    endpoint !== undefined &&
                    endpoint.visibility === "private" &&
                    endpoint.ownerUserId === callerUserId
                );
            }),
    };
}

async function loadGenerationModelRegistry(
    env: CommunityModelEnv,
): Promise<{ registry: GenerationModelRegistry; degraded: boolean }> {
    let communityEntries: GenerationModelEntry[] = [];
    let sequenceRows: ModelSequenceRegistryRow[] = [];
    let degraded = false;
    try {
        communityEntries = (await getCommunityModelRegistryEntries(env)).map(
            communityEntryToGenerationEntry,
        );
        sequenceRows = await getModelSequenceRegistryRows(env);
    } catch (error) {
        // Community models are additive: every request that resolves a model
        // goes through this registry, so letting a D1 failure escape turns a
        // community-catalog problem into a total gen outage. The realistic
        // trigger is schema skew — a migration lands before the Worker that
        // understands it — which is exactly when the static models are still
        // perfectly servable.
        degraded = true;
        console.error("Community model registry unavailable", error);
    }
    return {
        registry: buildRegistry(
            [...STATIC_ENTRIES, ...communityEntries],
            sequenceRows,
        ),
        degraded,
    };
}

export async function getGenerationModelRegistry(
    env: CommunityModelEnv,
): Promise<GenerationModelRegistry> {
    if (
        cachedRegistry &&
        cachedRegistry.dbBinding === env.DB &&
        cachedRegistry.expiresAt > Date.now()
    ) {
        return cachedRegistry.registry;
    }

    // Deliberately no in-flight promise cache: sharing one pending promise
    // across requests hands request A's D1 I/O to requests B..N, and if A is
    // cancelled the promise can never settle, wedging the isolate for good.
    // Racing a few cheap SELECTs on cache expiry is the better trade.
    const dbBinding = env.DB;
    const { registry, degraded } = await loadGenerationModelRegistry(env);
    cachedRegistry = {
        dbBinding,
        expiresAt:
            Date.now() +
            (degraded ? DEGRADED_REGISTRY_TTL_MS : REGISTRY_TTL_MS),
        registry,
    };
    return registry;
}

export async function resetGenerationModelRegistryCache(
    env: CommunityModelEnv,
): Promise<void> {
    cachedRegistry = null;
    await resetCommunityModelRegistryCache(env);
}
