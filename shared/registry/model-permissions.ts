import { and, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { HTTPException } from "hono/http-exception";
import {
    COMMUNITY_MODALITY_SPEC,
    parseCommunityModelId,
    parseListingPayload,
} from "../community-endpoints.ts";
import * as schema from "../db/better-auth.ts";
import {
    type Category,
    getRegistryModelDefinition,
    MODEL_CATEGORIES,
    resolveModelName,
} from "./registry.ts";

/**
 * A key's `permissions.models` lists the model categories it may call: null
 * allows every model and [] none. Membership comes from each model's registry
 * `category`, so models join and leave a key's reach as the registry changes.
 */
export function keyAllowsCategory(
    models: readonly string[] | null | undefined,
    category: Category,
): boolean {
    return !models || models.includes(category);
}

/**
 * Normalizes requested key model permissions to categories. Accepts category
 * names and model IDs or aliases; a model ID widens to its model's category.
 */
export async function toModelCategories(
    dbBinding: D1Database,
    values: readonly string[],
): Promise<Category[]> {
    const categories = new Set<Category>();
    const communityIds: string[] = [];
    for (const value of values) {
        const category = registryCategory(value);
        if (category) categories.add(category);
        else communityIds.push(value);
    }
    const found = await communityCategories(dbBinding, communityIds);
    const unknown = communityIds.find((id) => !found.has(id));
    if (unknown !== undefined) {
        throw new HTTPException(400, {
            message: `Model permission '${unknown}' is not a model category (${MODEL_CATEGORIES.join(", ")}) or a model ID from /models.`,
        });
    }
    for (const category of found.values()) categories.add(category);
    return MODEL_CATEGORIES.filter((category) => categories.has(category));
}

function registryCategory(value: string): Category | undefined {
    if ((MODEL_CATEGORIES as readonly string[]).includes(value)) {
        return value as Category;
    }
    try {
        const definition = getRegistryModelDefinition(resolveModelName(value));
        // Provider routes are internal; callers select the public model.
        return definition.fallbackOnly ? undefined : definition.category;
    } catch {
        return undefined;
    }
}

/** Categories of the requested community model IDs that exist. */
async function communityCategories(
    dbBinding: D1Database,
    ids: readonly string[],
): Promise<Map<string, Category>> {
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
    const categories = new Map<string, Category>();
    for (const { id, ownerGithubUsername, modelName } of parsed) {
        const row = rows.find(
            (row) =>
                row.owner === ownerGithubUsername && row.name === modelName,
        );
        if (!row) continue;
        // Agents are text models; a proxy publishes its modality's category.
        const modality =
            row.type === "proxy"
                ? (parseListingPayload("proxy", row.payload)?.modality ??
                  "text")
                : "text";
        categories.set(id, COMMUNITY_MODALITY_SPEC[modality].category);
    }
    return categories;
}
