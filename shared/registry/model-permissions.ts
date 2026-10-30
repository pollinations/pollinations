import { and, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { HTTPException } from "hono/http-exception";
import {
    COMMUNITY_MODALITY_SPEC,
    communityModelId,
    legacyCommunityModelId,
    normalizeCommunityEndpointModality,
    parseCommunityModelId,
    parseListingPayload,
} from "../community-endpoints.ts";
import * as schema from "../db/better-auth.ts";
import {
    type Category,
    getRegistryModelDefinition,
    MODEL_CATEGORIES,
    type ModelDefinition,
    type ModelName,
    resolveModelName,
} from "./registry.ts";

/**
 * A key's `permissions.models` lists the model categories and model IDs it may
 * call: null allows every model and [] none. A category allows every model
 * whose registry `category` matches, so models join and leave a key's reach as
 * the registry changes; a model ID allows exactly that model. Matching aliases
 * keeps a stored ID working after its model is renamed.
 *
 * `endpoint` is the generation endpoint being called. Decision models also
 * answer on chat endpoints, where `text` still allows them; only
 * `/alpha/decisions` needs `decision`. Catalog listings pass no endpoint and
 * show each model under its own category only.
 */
export function keyAllowsModel(
    models: readonly string[] | null | undefined,
    id: string,
    { category, aliases }: Pick<ModelDefinition, "category" | "aliases">,
    endpoint?: string,
): boolean {
    if (!models) return true;
    const categories =
        category === "decision" &&
        endpoint !== undefined &&
        endpoint !== "/alpha/decisions"
            ? [category, "text"]
            : [category];
    return [...categories, id, ...aliases].some((value) =>
        models.includes(value),
    );
}

type ModelMatch = Pick<ModelDefinition, "category" | "aliases">;

/**
 * Normalizes requested key model permissions. Category names stay as they are
 * and model IDs or aliases become canonical model IDs.
 */
export async function toModelPermissions(
    dbBinding: D1Database,
    values: readonly string[],
): Promise<string[]> {
    const permissions = await resolveModelPermissions(dbBinding, values);
    return [
        ...MODEL_CATEGORIES.filter((category) => permissions.has(category)),
        ...[...permissions.keys()].filter((value) => !isModelCategory(value)),
    ];
}

/**
 * Whether a key limited to `models` may call everything the model permissions
 * `values` allow, each model matched as gen matches a call to it.
 */
export async function keyAllowsModelPermissions(
    dbBinding: D1Database,
    models: readonly string[],
    values: readonly string[],
): Promise<boolean> {
    const permissions = await resolveModelPermissions(dbBinding, values);
    return [...permissions].every(([value, model]) =>
        model ? keyAllowsModel(models, value, model) : models.includes(value),
    );
}

export function isModelCategory(value: string): value is Category {
    return (MODEL_CATEGORIES as readonly string[]).includes(value);
}

function registryPermission(value: string): string | undefined {
    if (isModelCategory(value)) return value;
    try {
        const modelName = resolveModelName(value);
        // Provider routes are internal; callers select the public model.
        return getRegistryModelDefinition(modelName).fallbackOnly
            ? undefined
            : modelName;
    } catch {
        return undefined;
    }
}

/**
 * The canonical permissions for the requested values. Each model comes with
 * the category and aliases a key's permissions match it by; a category maps
 * to null.
 */
async function resolveModelPermissions(
    dbBinding: D1Database,
    values: readonly string[],
): Promise<Map<string, ModelMatch | null>> {
    const permissions = new Map<string, ModelMatch | null>();
    const communityIds: string[] = [];
    for (const value of values) {
        const permission = registryPermission(value);
        if (!permission) communityIds.push(value);
        else {
            permissions.set(
                permission,
                isModelCategory(permission)
                    ? null
                    : getRegistryModelDefinition(permission as ModelName),
            );
        }
    }
    const community = await communityModels(dbBinding, communityIds);
    const unknown = communityIds.find((id) => !community.has(id));
    if (unknown !== undefined) {
        throw new HTTPException(400, {
            message: `Model permission '${unknown}' is not a model category (${MODEL_CATEGORIES.join(", ")}) or a model ID from /models.`,
        });
    }
    for (const { id, ...model } of community.values()) {
        permissions.set(id, model);
    }
    return permissions;
}

/** The requested community model IDs that exist, by their canonical ID. */
async function communityModels(
    dbBinding: D1Database,
    ids: readonly string[],
): Promise<Map<string, ModelMatch & { id: string }>> {
    const parsed = ids.flatMap((id) => {
        const model = parseCommunityModelId(id);
        return model ? [{ id, ...model }] : [];
    });
    if (parsed.length === 0) return new Map();
    const rows = await drizzle(dbBinding)
        .select({
            owner: schema.user.githubUsername,
            name: schema.communityEndpoint.name,
            type: schema.communityEndpoint.type,
            payload: schema.communityEndpoint.payload,
        })
        .from(schema.communityEndpoint)
        .innerJoin(
            schema.user,
            eq(schema.communityEndpoint.ownerUserId, schema.user.id),
        )
        .where(
            and(
                inArray(
                    schema.communityEndpoint.name,
                    parsed.map(({ modelName }) => modelName),
                ),
                inArray(
                    schema.user.githubUsername,
                    parsed.map(
                        ({ ownerGithubUsername }) => ownerGithubUsername,
                    ),
                ),
            ),
        );
    const models = new Map<string, ModelMatch & { id: string }>();
    for (const { id, ownerGithubUsername, modelName } of parsed) {
        const row = rows.find(
            (row) =>
                row.owner === ownerGithubUsername && row.name === modelName,
        );
        if (!row) continue;
        // As in gen's catalog: agents are text models and a proxy's modality
        // sets its category.
        const modality =
            row.type === "proxy"
                ? parseListingPayload("proxy", row.payload)?.modality
                : undefined;
        models.set(id, {
            id: communityModelId(ownerGithubUsername, modelName),
            category:
                COMMUNITY_MODALITY_SPEC[
                    normalizeCommunityEndpointModality(modality)
                ].category,
            aliases: [legacyCommunityModelId(ownerGithubUsername, modelName)],
        });
    }
    return models;
}
