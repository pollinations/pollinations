import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { HTTPException } from "hono/http-exception";
import {
    communityModelId,
    effectiveCommunityEndpointVisibility,
    legacyCommunityModelId,
} from "../community-endpoints.ts";
import * as schema from "../db/better-auth.ts";
import {
    getModels,
    getRegistryModelDefinition,
    isVisibleModelDefinition,
    resolveModelName,
} from "./registry.ts";

/** Resolve known aliases on write; never silently drop a restriction. */
export async function normalizeModelPermissionIds(
    dbBinding: D1Database,
    modelIds: readonly string[],
): Promise<string[]> {
    if (modelIds.length === 0) return [];
    const canonicalIds = new Set<string>(
        getModels().filter(
            (id) => getRegistryModelDefinition(id).fallbackOnly !== true,
        ),
    );
    const rows = await drizzle(dbBinding)
        .select({
            owner: schema.user.githubUsername,
            name: schema.communityEndpoint.name,
        })
        .from(schema.communityEndpoint)
        .innerJoin(
            schema.user,
            eq(schema.communityEndpoint.ownerUserId, schema.user.id),
        );
    const communityAliases = new Map<string, string>();
    for (const row of rows) {
        if (!row.owner) continue;
        const canonical = communityModelId(row.owner, row.name);
        canonicalIds.add(canonical);
        communityAliases.set(
            legacyCommunityModelId(row.owner, row.name),
            canonical,
        );
    }
    const normalized = canonicalizeModelPermissionIds(modelIds).map((id) => {
        const canonical = canonicalIds.has(id) ? id : communityAliases.get(id);
        if (!canonical) {
            throw new HTTPException(400, {
                message: `Unknown model permission '${id}'. Use model IDs or aliases from /models.`,
            });
        }
        return canonical;
    });
    return [...new Set(normalized)];
}

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

export async function getVisibleModelIdsForUser(
    dbBinding: D1Database,
    userId: string,
): Promise<Set<string>> {
    const modelIds = new Set<string>(
        getModels().filter((model) =>
            isVisibleModelDefinition(getRegistryModelDefinition(model)),
        ),
    );
    const db = drizzle(dbBinding, { schema });
    const communityModels = await db
        .select({
            ownerGithubUsername: schema.user.githubUsername,
            ownerUserId: schema.communityEndpoint.ownerUserId,
            name: schema.communityEndpoint.name,
            visibility: schema.communityEndpoint.visibility,
            pendingVisibility: schema.communityEndpoint.pendingVisibility,
            pendingAt: schema.communityEndpoint.pendingAt,
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
            ),
        );

    for (const model of communityModels) {
        if (
            model.ownerUserId !== userId &&
            effectiveCommunityEndpointVisibility(
                model.visibility,
                model.pendingVisibility,
                model.pendingAt,
            ) !== "public"
        ) {
            continue;
        }
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
        models: canonicalizeModelPermissionIds(permissions.models).filter(
            (modelId) => visibleModelIds.has(modelId),
        ),
    };
}
