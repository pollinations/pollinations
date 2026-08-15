import type { CommunityEndpointRuntime } from "@shared/community-endpoints.ts";
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
    type ModelDefinition,
} from "@shared/registry/registry.ts";
import { DEFAULT_TEXT_MODEL } from "@shared/registry/text.ts";
import type { EventType } from "@shared/schemas/generation-event.ts";
import {
    type AgentCatalogConfig,
    type CommunityModelRegistryEntry,
    communityImageSupportedEndpoints,
    communityTextSupportedEndpoints,
    getCommunityModelRegistryEntries,
} from "./community-models.ts";
import { linkFallbackEntries } from "./fallback.ts";

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
                      entry.definition.inputModalities,
                  )
                : communityTextSupportedEndpoints(),
        definition: entry.definition,
        info: entry.info,
        communityEndpoint: entry.communityEndpoint,
        agentConfig: entry.agentConfig,
        // Public endpoints appear for everyone. Private endpoints are added
        // back for their owner by visibleEntries().
        visible:
            entry.communityEndpoint.disabledAt === null &&
            entry.communityEndpoint.visibility === "public",
    };
}

function applyAgentBaseModelMetadata(
    entry: GenerationModelEntry,
    baseEntry: GenerationModelEntry | undefined,
): void {
    const config = entry.agentConfig;
    if (!config) return;
    const agentCapabilities = config.pollinationsTools
        ? (["pollinations_models"] as const)
        : [];

    entry.info = {
        ...entry.info,
        base_model: config.baseModel,
        capabilities: [...entry.info.capabilities, ...agentCapabilities],
    };
    if (
        !baseEntry ||
        baseEntry.info.agent ||
        baseEntry.eventType !== "generate.text"
    ) {
        return;
    }

    const base = baseEntry.info;
    entry.info = {
        ...entry.info,
        pricing: base.pricing,
        pricing_variants: base.pricing_variants,
        pricing_default_label: base.pricing_default_label,
        pricing_adjustments: base.pricing_adjustments,
        input_modalities: base.input_modalities,
        output_modalities: base.output_modalities,
        capabilities: [...base.capabilities, ...agentCapabilities],
        tools: base.tools,
        reasoning: base.reasoning,
        context_length: base.context_length,
        paid_only: base.paid_only,
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

function buildRegistry(
    sourceEntries: GenerationModelEntry[],
): GenerationModelRegistry {
    // Link on copies: STATIC_ENTRIES is module-level and shared across registry
    // rebuilds, so resolution must never mutate the originals.
    const entries = sourceEntries.map((entry) => ({ ...entry }));
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
    for (const entry of entries) {
        const baseModel = entry.agentConfig?.baseModel;
        if (baseModel) {
            applyAgentBaseModelMetadata(entry, byIdOrAlias.get(baseModel));
        }
    }
    linkFallbackEntries(entries, byIdOrAlias);
    entries.sort(compareModelEntries);

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
    env: Pick<CloudflareBindings, "DB" | "AGENT_RUNTIME_BASE_URL">,
): Promise<GenerationModelRegistry> {
    const communityEntries = (
        await getCommunityModelRegistryEntries(
            env.DB,
            env.AGENT_RUNTIME_BASE_URL,
        )
    ).map(communityEntryToGenerationEntry);
    return buildRegistry([...STATIC_ENTRIES, ...communityEntries]);
}

export async function getGenerationModelRegistry(
    env: Pick<CloudflareBindings, "DB" | "AGENT_RUNTIME_BASE_URL">,
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
    const registry = await loadGenerationModelRegistry(env);
    cachedRegistry = {
        dbBinding,
        expiresAt: Date.now() + REGISTRY_TTL_MS,
        registry,
    };
    return registry;
}

export function resetGenerationModelRegistryCache(): void {
    cachedRegistry = null;
}
