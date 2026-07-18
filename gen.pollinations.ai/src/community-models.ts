import {
    type CommunityEndpointModality,
    type CommunityEndpointRuntime,
    communityEndpointPrices,
    communityModelDefinition,
    communityModelId,
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
const COMMUNITY_IMAGE_ENDPOINTS = ["/v1/images/generations", "/image/{prompt}"];
const COMMUNITY_EMBEDDING_ENDPOINTS = ["/v1/embeddings"];
const COMMUNITY_SPEECH_ENDPOINTS = ["/v1/audio/speech", "/audio/{text}"];
const COMMUNITY_TRANSCRIPTION_ENDPOINTS = ["/v1/audio/transcriptions"];

export function communitySupportedEndpoints(
    modality: CommunityEndpointModality,
): string[] {
    if (modality === "image") return COMMUNITY_IMAGE_ENDPOINTS;
    if (modality === "embedding") return COMMUNITY_EMBEDDING_ENDPOINTS;
    if (modality === "speech") return COMMUNITY_SPEECH_ENDPOINTS;
    if (modality === "transcription") {
        return COMMUNITY_TRANSCRIPTION_ENDPOINTS;
    }
    return COMMUNITY_TEXT_ENDPOINTS;
}

export type CommunityModelRegistryEntry = {
    id: string;
    aliases: string[];
    info: ModelInfo;
    definition: ModelDefinition<string>;
    communityEndpoint: CommunityEndpointRuntime;
};

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
            description: schema.communityEndpoint.description,
            modality: schema.communityEndpoint.modality,
            baseUrl: schema.communityEndpoint.baseUrl,
            upstreamModel: schema.communityEndpoint.upstreamModel,
            bearerTokenCiphertext:
                schema.communityEndpoint.bearerTokenCiphertext,
            visibility: schema.communityEndpoint.visibility,
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
            description: row.description,
            modality: normalizeCommunityEndpointModality(row.modality),
            baseUrl: row.baseUrl,
            upstreamModel: row.upstreamModel,
            bearerTokenCiphertext: row.bearerTokenCiphertext,
            visibility: row.visibility,
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
