import { and, eq, isNotNull, isNull, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { communityModelId } from "../community-endpoints.ts";
import * as schema from "../db/better-auth.ts";
import { getModels, getRegistryModelDefinition } from "./registry.ts";

export async function getVisibleModelIdsForUser(
    dbBinding: D1Database,
    userId: string,
): Promise<Set<string>> {
    const modelIds = new Set<string>(
        getModels().filter(
            (modelId) => !getRegistryModelDefinition(modelId).hidden,
        ),
    );
    const db = drizzle(dbBinding, { schema });
    const communityModels = await db
        .select({
            ownerGithubUsername: schema.user.githubUsername,
            name: schema.communityEndpoint.name,
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
