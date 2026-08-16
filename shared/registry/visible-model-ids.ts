import { and, eq, inArray, isNotNull, isNull, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { alias } from "drizzle-orm/sqlite-core";
import { communityModelId } from "../community-endpoints.ts";
import * as schema from "../db/better-auth.ts";
import { getModels, resolveModelName } from "./registry.ts";

export function canonicalizeModelPermissionIds(
    modelIds: readonly string[],
): string[] {
    const seen = new Set<string>();
    const canonicalIds: string[] = [];
    for (const modelId of modelIds) {
        let canonicalId = modelId;
        try {
            canonicalId = resolveModelName(modelId);
        } catch {
            // Preserve unknown and community model IDs.
        }
        if (!seen.has(canonicalId)) {
            seen.add(canonicalId);
            canonicalIds.push(canonicalId);
        }
    }
    return canonicalIds;
}

/**
 * Model ids this user may legitimately hold on an API key: the built-in
 * registry, every public community model, their own community models at any
 * visibility, and "app" models owned by an app that minted one of their keys.
 *
 * Used only to intersect stored key permissions for display — never to grant
 * access — so over-inclusion here cannot widen what a key can call.
 */
export async function getVisibleModelIdsForUser(
    dbBinding: D1Database,
    userId: string,
): Promise<Set<string>> {
    const modelIds = new Set<string>(getModels());
    const db = drizzle(dbBinding, { schema });
    const userKey = alias(schema.apikey, "user_key");
    const appKey = alias(schema.apikey, "app_key");
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
                    // App models of every app that issued this user a key:
                    // without this branch an unrelated key edit would round-trip
                    // through the filtered list and silently drop them.
                    and(
                        eq(schema.communityEndpoint.visibility, "app"),
                        inArray(
                            schema.communityEndpoint.ownerUserId,
                            db
                                .select({ ownerId: appKey.userId })
                                .from(userKey)
                                .innerJoin(
                                    appKey,
                                    eq(appKey.id, userKey.byopClientKeyId),
                                )
                                .where(eq(userKey.userId, userId)),
                        ),
                    ),
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
