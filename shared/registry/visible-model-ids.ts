import { and, eq, isNotNull, isNull, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import type { ModelPermissionEntry } from "../auth/api-key.ts";
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
 * Canonicalize model permission entries, handling both string and {id, pollenType} formats.
 */
export function canonicalizeModelPermissionEntries(
    entries: readonly ModelPermissionEntry[],
): ModelPermissionEntry[] {
    const seen = new Set<string>();
    const canonical: ModelPermissionEntry[] = [];
    for (const entry of entries) {
        if (typeof entry === "string") {
            let canonicalId = entry;
            try {
                canonicalId = resolveModelName(entry);
            } catch {
                // Preserve unknown and community model IDs.
            }
            if (!seen.has(canonicalId)) {
                seen.add(canonicalId);
                canonical.push(canonicalId);
            }
        } else {
            let canonicalId = entry.id;
            try {
                canonicalId = resolveModelName(entry.id);
            } catch {
                // Preserve unknown and community model IDs.
            }
            if (!seen.has(canonicalId)) {
                seen.add(canonicalId);
                canonical.push({
                    id: canonicalId,
                    pollenType: entry.pollenType,
                });
            }
        }
    }
    return canonical;
}

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
        })
        .from(schema.communityEndpoint)
        .innerJoin(
            schema.user,
            eq(schema.communityEndpoint.ownerUserId, schema.user.id),
        )
        .where(
            and(
                isNull(schema.communityEndpoint.hiddenAt),
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
    permissions: Record<string, string[] | ModelPermissionEntry[]> | null,
    visibleModelIds: ReadonlySet<string>,
): Record<string, string[] | ModelPermissionEntry[]> | null {
    if (!permissions?.models) return permissions;

    const models = permissions.models;
    if (!Array.isArray(models)) return permissions;

    return {
        ...permissions,
        models: models.filter((entry) => {
            const modelId = typeof entry === "string" ? entry : entry.id;
            return visibleModelIds.has(modelId);
        }),
    };
}
