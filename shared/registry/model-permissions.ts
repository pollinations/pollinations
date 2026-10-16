import { and, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { HTTPException } from "hono/http-exception";
import {
    communityModelId,
    parseCommunityModelId,
} from "../community-endpoints.ts";
import * as schema from "../db/better-auth.ts";
import {
    type Category,
    getRegistryModelDefinition,
    MODEL_CATEGORIES,
    type ModelDefinition,
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

/**
 * Normalizes requested key model permissions. Category names stay as they are
 * and model IDs or aliases become canonical model IDs.
 */
export async function toModelPermissions(
    dbBinding: D1Database,
    values: readonly string[],
): Promise<string[]> {
    const registry = values.flatMap((value) => registryPermission(value) ?? []);
    const communityIds = values.filter((value) => !registryPermission(value));
    const community = await communityModelIds(dbBinding, communityIds);
    const unknown = communityIds.find((id) => !community.has(id));
    if (unknown !== undefined) {
        throw new HTTPException(400, {
            message: `Model permission '${unknown}' is not a model category (${MODEL_CATEGORIES.join(", ")}) or a model ID from /models.`,
        });
    }
    const permissions = new Set([...registry, ...community.values()]);
    return [
        ...MODEL_CATEGORIES.filter((category) => permissions.has(category)),
        ...[...permissions].filter((value) => !isModelCategory(value)),
    ];
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

/** Canonical IDs of the requested community model IDs that exist. */
async function communityModelIds(
    dbBinding: D1Database,
    ids: readonly string[],
): Promise<Map<string, string>> {
    const parsed = ids.flatMap((id) => {
        const model = parseCommunityModelId(id);
        return model ? [{ id, ...model }] : [];
    });
    if (parsed.length === 0) return new Map();
    const rows = await drizzle(dbBinding)
        .select({
            owner: schema.user.githubUsername,
            name: schema.communityEndpoint.name,
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
    const canonical = new Map<string, string>();
    for (const { id, ownerGithubUsername, modelName } of parsed) {
        if (
            rows.some(
                (row) =>
                    row.owner === ownerGithubUsername && row.name === modelName,
            )
        ) {
            canonical.set(id, communityModelId(ownerGithubUsername, modelName));
        }
    }
    return canonical;
}
