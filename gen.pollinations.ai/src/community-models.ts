import {
    type CommunityEndpointRuntime,
    communityEndpointPrices,
    communityModelDefinition,
    communityModelId,
    normalizeCommunityEndpointImagePricing,
    normalizeCommunityEndpointModality,
} from "@shared/community-endpoints.ts";
import * as schema from "@shared/db/better-auth.ts";
import {
    type ModelInfo,
    modelInfoFromDefinition,
} from "@shared/registry/model-info.ts";
import type {
    ModelDefinition,
    ModelInputModality,
} from "@shared/registry/registry.ts";
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
    inputModalities: readonly ModelInputModality[] = ["text"],
): string[] {
    return [
        "/v1/images/generations",
        ...(inputModalities.includes("image") ? ["/v1/images/edits"] : []),
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

export async function getCommunityModelRegistryEntries(
    dbBinding: CloudflareBindings["DB"] | undefined,
    agentRuntimeBaseUrl: string,
): Promise<CommunityModelRegistryEntry[]> {
    if (!dbBinding) return [];
    const db = drizzle(dbBinding, { schema });
    const rows = await db
        .select({
            id: schema.communityEndpoint.id,
            ownerUserId: schema.communityEndpoint.ownerUserId,
            ownerGithubUsername: schema.user.githubUsername,
            providerName: schema.user.communityProviderName,
            providerUrl: schema.user.communityProviderUrl,
            name: schema.communityEndpoint.name,
            title: schema.communityEndpoint.title,
            description: schema.communityEndpoint.description,
            modality: schema.communityEndpoint.modality,
            imagePricing: schema.communityEndpoint.imagePricing,
            inputModalities: schema.communityEndpoint.inputModalities,
            agentId: schema.communityEndpoint.agentId,
            endpointBaseUrl: schema.communityEndpoint.baseUrl,
            upstreamModel: schema.communityEndpoint.upstreamModel,
            endpointBearerTokenCiphertext:
                schema.communityEndpoint.bearerTokenCiphertext,
            visibility: schema.communityEndpoint.visibility,
            perUserRpm: schema.communityEndpoint.perUserRpm,
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
            fallbackModelIds: schema.communityEndpoint.fallbackModelIds,
            disabledAt: schema.communityEndpoint.disabledAt,
            disabledReason: schema.communityEndpoint.disabledReason,
            createdAt: schema.communityEndpoint.createdAt,
        })
        .from(schema.communityEndpoint)
        .innerJoin(
            schema.user,
            eq(schema.communityEndpoint.ownerUserId, schema.user.id),
        )
        .where(isNotNull(schema.user.githubUsername));

    return rows.flatMap((row): CommunityModelRegistryEntry[] => {
        if (!row.ownerGithubUsername) return [];
        const baseUrl =
            row.endpointBaseUrl ??
            (row.agentId === null ? null : agentRuntimeBaseUrl);
        if (
            !baseUrl ||
            (row.agentId === null && !row.endpointBearerTokenCiphertext)
        ) {
            return [];
        }
        const modelId = communityModelId(row.ownerGithubUsername, row.name);
        const communityEndpoint: CommunityEndpointRuntime = {
            id: row.id,
            ownerUserId: row.ownerUserId,
            modelId,
            name: row.name,
            title: row.title,
            description: row.description,
            providerName: row.providerName,
            providerUrl: row.providerUrl,
            modality: normalizeCommunityEndpointModality(row.modality),
            imagePricing: normalizeCommunityEndpointImagePricing(
                row.imagePricing,
            ),
            inputModalities: row.inputModalities,
            baseUrl,
            agentId: row.agentId,
            upstreamModel: row.agentId ?? row.upstreamModel,
            bearerTokenCiphertext: row.endpointBearerTokenCiphertext,
            visibility: row.visibility,
            perUserRpm: row.perUserRpm,
            delegatesGeneration: row.delegatesGeneration,
            fallbackModelIds: row.fallbackModelIds ?? [],
            disabledAt: row.disabledAt ? row.disabledAt.getTime() : null,
            disabledReason: row.disabledReason,
            ...communityEndpointPrices(row),
        };
        const definition = communityModelDefinition({
            ...communityEndpoint,
            addedDate: row.createdAt.getTime(),
        });
        return [
            {
                id: modelId,
                aliases: definition.aliases,
                info: modelInfoFromDefinition(modelId, definition, {
                    community: true,
                    agent:
                        communityEndpoint.agentId !== null ||
                        communityEndpoint.delegatesGeneration,
                    perUserRpm: communityEndpoint.perUserRpm,
                }),
                definition,
                communityEndpoint,
            },
        ];
    });
}
