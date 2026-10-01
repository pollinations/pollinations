import {
    isModelReliable,
    type ModelHealth,
    modelHealthLookup,
} from "@shared/model-health.ts";
import type { Context } from "hono";
import type { Env } from "@/env.ts";
import type {
    ModelListHeaders,
    ModelListQueryParams,
} from "@/schemas/models.ts";
import type { GenerationModelEntry } from "../model-registry.ts";
import {
    fetchCatalogHealthRows,
    fetchModelHealthRows,
} from "./model-status.ts";

type HealthLookup = (entry: GenerationModelEntry) => ModelHealth;
const isCommunityProxy = (entry: GenerationModelEntry) =>
    entry.info.community && !entry.info.agent;

// A missing feed must not turn discovery into a 502 or label a model
// healthy; an empty row set makes every lookup resolve to "unknown".
export async function getModelHealthLookup(
    entries: GenerationModelEntry[],
): Promise<HealthLookup> {
    const community = entries.some(isCommunityProxy);
    const official = entries.some((entry) => !isCommunityProxy(entry));
    const [catalogRows, officialRows] = await Promise.all([
        (community ? fetchCatalogHealthRows() : Promise.resolve([])).catch(
            (error) => {
                console.warn("Community catalog health unavailable", error);
                return [];
            },
        ),
        (official ? fetchModelHealthRows() : Promise.resolve([])).catch(
            (error) => {
                console.warn("Official model health unavailable", error);
                return [];
            },
        ),
    ]);
    const communityHealth = modelHealthLookup(catalogRows);
    const officialHealth = modelHealthLookup(officialRows);
    return (entry) =>
        (isCommunityProxy(entry) ? communityHealth : officialHealth)(
            entry.id,
            entry.eventType.replace("generate.", ""),
        );
}

// Shared by the list and single-model routes so both return identical shapes.
export function attachModelHealth(
    entry: GenerationModelEntry,
    lookup: HealthLookup,
): GenerationModelEntry {
    const health = lookup(entry);
    return {
        ...entry,
        info: {
            ...entry.info,
            health: {
                status: health.status,
                success_rate: health.successRate,
                requests: health.requests,
            },
        },
    };
}

// Case-insensitive substring match across the catalog text a caller is
// likely to search by.
function matchesSearchQuery(
    entry: GenerationModelEntry,
    search: string,
): boolean {
    const haystack = [
        entry.info.name,
        entry.info.title,
        entry.info.description,
        entry.info.publisher,
        ...entry.info.aliases,
    ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
    return haystack.includes(search.toLowerCase());
}

// Discovery only: callers apply access checks before entering this function.
export async function filterCatalogEntries(
    c: Context<Env>,
    entries: GenerationModelEntry[],
): Promise<GenerationModelEntry[]> {
    const params = c.req.valid("query" as never) as ModelListQueryParams;
    const headers = c.req.valid("header" as never) as ModelListHeaders;
    const communitySource =
        params.community === undefined
            ? undefined
            : params.community === "true" || params.community === "1"
              ? "community"
              : "official";
    const source =
        params.source ??
        communitySource ??
        headers["pollinations-model-source"];
    const filtered = entries.filter(
        (entry) =>
            source === undefined ||
            entry.info.community === (source === "community"),
    );

    const lookup = await getModelHealthLookup(filtered);
    const reliability =
        params.reliability ??
        headers["pollinations-model-reliability"] ??
        "reliable";
    const matched = filtered
        .map((entry) => attachModelHealth(entry, lookup))
        .filter(
            (entry) =>
                reliability === "all" ||
                !isCommunityProxy(entry) ||
                entry.communityEndpoint?.visibility === "private" ||
                isModelReliable(entry.info.health?.success_rate),
        )
        .filter(
            (entry) =>
                (params.query === undefined ||
                    matchesSearchQuery(entry, params.query)) &&
                (params.capabilities === undefined ||
                    params.capabilities.every((capability) =>
                        entry.info.capabilities.includes(capability),
                    )) &&
                (params.agent === undefined ||
                    (entry.info.agent ?? false) === params.agent),
        );
    return params.limit === undefined
        ? matched
        : matched.slice(0, params.limit);
}
