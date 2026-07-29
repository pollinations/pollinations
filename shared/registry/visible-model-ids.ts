import { and, eq, isNotNull, isNull, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import {
    communityEndpointPrices,
    communityGroupBuckets,
    communityGroupModelId,
    communityModelId,
    normalizeCommunityEndpointImagePricing,
    normalizeCommunityEndpointModality,
} from "../community-endpoints.ts";
import * as schema from "../db/better-auth.ts";
import { getModels } from "./registry.ts";

export async function getVisibleModelIdsForUser(
    dbBinding: D1Database,
    userId: string,
): Promise<Set<string>> {
    const modelIds = new Set<string>(getModels());
    const db = drizzle(dbBinding, { schema });
    const communityModels = await db
        .select({
            ownerGithubUsername: schema.user.githubUsername,
            name: schema.communityEndpoint.name,
            modality: schema.communityEndpoint.modality,
            imagePricing: schema.communityEndpoint.imagePricing,
            visibility: schema.communityEndpoint.visibility,
            disabledAt: schema.communityEndpoint.disabledAt,
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
        })
        .from(schema.communityEndpoint)
        .innerJoin(
            schema.user,
            eq(schema.communityEndpoint.ownerUserId, schema.user.id),
        )
        .where(
            and(
                isNull(schema.communityEndpoint.disabledAt),
                isNotNull(schema.user.githubUsername),
                or(
                    eq(schema.communityEndpoint.visibility, "public"),
                    eq(schema.communityEndpoint.ownerUserId, userId),
                ),
            ),
        );

    for (const model of communityModels) {
        if (model.ownerGithubUsername) {
            modelIds.add(
                communityModelId(model.ownerGithubUsername, model.name),
            );
        }
    }

    // A pooled `group/<name>` is a real callable model, so a key restricted to
    // one has to survive this filter. Otherwise the dashboard reads the key
    // back with an empty model list and saves that empty list, locking the key
    // out of every model.
    const groups = communityGroupBuckets(
        communityModels.map((model) => ({
            name: model.name,
            modality: normalizeCommunityEndpointModality(model.modality),
            imagePricing: normalizeCommunityEndpointImagePricing(
                model.imagePricing,
            ),
            visibility: model.visibility,
            disabledAt: model.disabledAt ? model.disabledAt.getTime() : null,
            delegatesGeneration: model.delegatesGeneration,
            ...communityEndpointPrices(model),
        })),
    );
    for (const members of groups) {
        modelIds.add(communityGroupModelId(members[0].name));
    }

    return modelIds;
}

export function filterPermissionsToVisibleModels(
    permissions: Record<string, string[]> | null,
    visibleModelIds: ReadonlySet<string>,
): Record<string, string[]> | null {
    if (!Array.isArray(permissions?.models)) return permissions;

    return {
        ...permissions,
        models: permissions.models.filter((modelId) =>
            visibleModelIds.has(modelId),
        ),
    };
}
