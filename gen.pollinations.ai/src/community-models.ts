import {
    type CommunityEndpointRuntime,
    communityEndpointPrices,
    communityGroupKey,
    communityGroupModelDefinition,
    communityGroupModelId,
    communityModelDefinition,
    communityModelId,
    MIN_COMMUNITY_GROUP_MEMBERS,
    normalizeCommunityEndpointImagePricing,
    normalizeCommunityEndpointModality,
} from "@shared/community-endpoints.ts";
import * as schema from "@shared/db/better-auth.ts";
import {
    type ModelInfo,
    modelInfoFromDefinition,
} from "@shared/registry/model-info.ts";
import type { ModelDefinition } from "@shared/registry/registry.ts";
import { eq, isNotNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";

const COMMUNITY_TEXT_ENDPOINTS = [
    "/v1/chat/completions",
    "/text",
    "/text/{prompt}",
];
export function communityTextSupportedEndpoints(): string[] {
    return COMMUNITY_TEXT_ENDPOINTS;
}

export function communityImageSupportedEndpoints(
    supportsImageEdits = false,
): string[] {
    return [
        "/v1/images/generations",
        ...(supportsImageEdits ? ["/v1/images/edits"] : []),
        "/image/{prompt}",
    ];
}

export type CommunityModelRegistryEntry = {
    id: string;
    aliases: string[];
    info: ModelInfo;
    definition: ModelDefinition;
    communityEndpoint: CommunityEndpointRuntime;
};

export type CommunityGroupRegistryEntry = {
    id: string;
    info: ModelInfo;
    definition: ModelDefinition;
    members: CommunityEndpointRuntime[];
};

/**
 * Pools every set of two or more interchangeable endpoints (same callable name,
 * same modality, identical prices) into one `group/<name>` model. Publishing
 * under that name at those prices is the only way to join: no membership state
 * is stored anywhere.
 */
export function communityGroupEntries(
    endpoints: readonly CommunityEndpointRuntime[],
): CommunityGroupRegistryEntry[] {
    const buckets = new Map<string, CommunityEndpointRuntime[]>();
    for (const endpoint of endpoints) {
        // A private endpoint is owner-only and a disabled one is broken, so
        // neither can take its turn serving a pooled request.
        if (endpoint.visibility !== "public" || endpoint.disabledAt !== null) {
            continue;
        }
        const key = communityGroupKey(endpoint);
        const bucket = buckets.get(key);
        if (bucket) bucket.push(endpoint);
        else buckets.set(key, [endpoint]);
    }

    return [...buckets.values()]
        .filter((members) => members.length >= MIN_COMMUNITY_GROUP_MEMBERS)
        .map((members) => {
            // Deterministic member order keeps the derived config stable across
            // registry rebuilds.
            members.sort((a, b) => a.modelId.localeCompare(b.modelId));
            const definition = communityGroupModelDefinition(members);
            const id = communityGroupModelId(members[0].name);
            return {
                id,
                info: modelInfoFromDefinition(id, definition, {
                    community: true,
                }),
                definition,
                members,
            };
        });
}

export async function getCommunityModelRegistryEntries(
    dbBinding: CloudflareBindings["DB"] | undefined,
): Promise<CommunityModelRegistryEntry[]> {
    if (!dbBinding) return [];
    const db = drizzle(dbBinding, { schema });
    const rows = await db
        .select({
            id: schema.communityEndpoint.id,
            ownerUserId: schema.communityEndpoint.ownerUserId,
            ownerGithubUsername: schema.user.githubUsername,
            name: schema.communityEndpoint.name,
            title: schema.communityEndpoint.title,
            description: schema.communityEndpoint.description,
            modality: schema.communityEndpoint.modality,
            imagePricing: schema.communityEndpoint.imagePricing,
            supportsImageEdits: schema.communityEndpoint.supportsImageEdits,
            baseUrl: schema.communityEndpoint.baseUrl,
            upstreamModel: schema.communityEndpoint.upstreamModel,
            bearerTokenCiphertext:
                schema.communityEndpoint.bearerTokenCiphertext,
            visibility: schema.communityEndpoint.visibility,
            delegatesGeneration: schema.communityEndpoint.delegatesGeneration,
            promptTextPrice: schema.communityEndpoint.promptTextPrice,
            promptCachedPrice: schema.communityEndpoint.promptCachedPrice,
            promptCacheWritePrice:
                schema.communityEndpoint.promptCacheWritePrice,
            promptAudioPrice: schema.communityEndpoint.promptAudioPrice,
            promptImagePrice: schema.communityEndpoint.promptImagePrice,
            completionTextPrice: schema.communityEndpoint.completionTextPrice,
            completionReasoningPrice:
                schema.communityEndpoint.completionReasoningPrice,
            completionAudioPrice: schema.communityEndpoint.completionAudioPrice,
            completionImagePrice: schema.communityEndpoint.completionImagePrice,
            disabledAt: schema.communityEndpoint.disabledAt,
            disabledReason: schema.communityEndpoint.disabledReason,
        })
        .from(schema.communityEndpoint)
        .innerJoin(
            schema.user,
            eq(schema.communityEndpoint.ownerUserId, schema.user.id),
        )
        .where(isNotNull(schema.user.githubUsername));

    return rows.flatMap((row): CommunityModelRegistryEntry[] => {
        if (!row.ownerGithubUsername) return [];
        const modelId = communityModelId(row.ownerGithubUsername, row.name);
        const communityEndpoint: CommunityEndpointRuntime = {
            id: row.id,
            ownerUserId: row.ownerUserId,
            modelId,
            name: row.name,
            title: row.title,
            description: row.description,
            modality: normalizeCommunityEndpointModality(row.modality),
            imagePricing: normalizeCommunityEndpointImagePricing(
                row.imagePricing,
            ),
            supportsImageEdits: row.supportsImageEdits,
            baseUrl: row.baseUrl,
            upstreamModel: row.upstreamModel,
            bearerTokenCiphertext: row.bearerTokenCiphertext,
            visibility: row.visibility,
            delegatesGeneration: row.delegatesGeneration,
            disabledAt: row.disabledAt ? row.disabledAt.getTime() : null,
            disabledReason: row.disabledReason,
            ...communityEndpointPrices(row),
        };
        const definition = communityModelDefinition(communityEndpoint);
        return [
            {
                id: modelId,
                aliases: definition.aliases,
                info: modelInfoFromDefinition(modelId, definition, {
                    community: true,
                }),
                definition,
                communityEndpoint,
            },
        ];
    });
}
