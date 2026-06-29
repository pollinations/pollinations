import {
    type CommunityEndpointRuntime,
    communityEndpointPrices,
    communityModelDefinition,
    communityModelId,
    parseCommunityModelId,
} from "@shared/community-endpoints.ts";
import * as schema from "@shared/db/better-auth.ts";
import {
    type ModelInfo,
    modelInfoFromDefinition,
} from "@shared/registry/model-info.ts";
import { and, eq, isNotNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";

const COMMUNITY_TEXT_ENDPOINTS = [
    "/v1/chat/completions",
    "/text",
    "/text/{prompt}",
];

export async function getCommunityTextModelsInfo(
    dbBinding: CloudflareBindings["DB"] | undefined,
): Promise<ModelInfo[]> {
    if (!dbBinding) return [];

    const db = drizzle(dbBinding, { schema });
    const rows = await db
        .select({
            ownerGithubUsername: schema.user.githubUsername,
            name: schema.communityEndpoint.name,
            description: schema.communityEndpoint.description,
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
        })
        .from(schema.communityEndpoint)
        .innerJoin(
            schema.user,
            eq(schema.communityEndpoint.ownerUserId, schema.user.id),
        )
        .where(isNotNull(schema.user.githubUsername));

    return rows.flatMap((row): ModelInfo[] => {
        if (!row.ownerGithubUsername) return [];
        const modelId = communityModelId(row.ownerGithubUsername, row.name);

        return [
            modelInfoFromDefinition(
                modelId,
                communityModelDefinition({
                    modelId,
                    description: row.description,
                    ...communityEndpointPrices(row),
                }),
                { community: true },
            ),
        ];
    });
}

export function communityTextSupportedEndpoints(): string[] {
    return COMMUNITY_TEXT_ENDPOINTS;
}

export async function getCommunityEndpointRuntime(
    dbBinding: CloudflareBindings["DB"] | undefined,
    model: string,
): Promise<CommunityEndpointRuntime | null> {
    const communityModel = parseCommunityModelId(model);
    if (!communityModel || !dbBinding) return null;

    const db = drizzle(dbBinding, { schema });
    const row = await db
        .select({
            id: schema.communityEndpoint.id,
            ownerUserId: schema.communityEndpoint.ownerUserId,
            name: schema.communityEndpoint.name,
            description: schema.communityEndpoint.description,
            baseUrl: schema.communityEndpoint.baseUrl,
            upstreamModel: schema.communityEndpoint.upstreamModel,
            bearerTokenCiphertext:
                schema.communityEndpoint.bearerTokenCiphertext,
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
        })
        .from(schema.communityEndpoint)
        .innerJoin(
            schema.user,
            eq(schema.communityEndpoint.ownerUserId, schema.user.id),
        )
        .where(
            and(
                eq(
                    schema.user.githubUsername,
                    communityModel.ownerGithubUsername,
                ),
                eq(schema.communityEndpoint.name, communityModel.modelName),
            ),
        )
        .limit(1);

    const endpoint = row[0];
    if (!endpoint) return null;
    return {
        id: endpoint.id,
        ownerUserId: endpoint.ownerUserId,
        modelId: model,
        name: endpoint.name,
        description: endpoint.description,
        baseUrl: endpoint.baseUrl,
        upstreamModel: endpoint.upstreamModel,
        bearerTokenCiphertext: endpoint.bearerTokenCiphertext,
        ...communityEndpointPrices(endpoint),
    };
}
