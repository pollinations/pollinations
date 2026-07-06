import {
    type CommunityEndpointRuntime,
    communityEndpointPrices,
    communityModelDefinition,
    communityModelId,
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
            baseUrl: schema.communityEndpoint.baseUrl,
            upstreamModel: schema.communityEndpoint.upstreamModel,
            bearerTokenCiphertext:
                schema.communityEndpoint.bearerTokenCiphertext,
            kind: schema.communityEndpoint.kind,
            tools: schema.communityEndpoint.tools,
            search: schema.communityEndpoint.search,
            reasoning: schema.communityEndpoint.reasoning,
            maxRequestPrice: schema.communityEndpoint.maxRequestPrice,
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
            baseUrl: row.baseUrl,
            upstreamModel: row.upstreamModel,
            bearerTokenCiphertext: row.bearerTokenCiphertext,
            kind: row.kind,
            tools: row.tools,
            search: row.search,
            reasoning: row.reasoning,
            maxRequestPrice: row.maxRequestPrice,
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
