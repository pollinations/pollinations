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

// Everything a `query` search may match: canonical id, aliases, and the human
// readable catalog text. Kept in one place so list and single-model routes agree.
function catalogSearchText(entry: GenerationModelEntry): string {
    return [
        entry.id,
        ...entry.aliases,
        entry.info.title,
        entry.info.description,
        entry.info.publisher,
    ]
        .filter((value): value is string => Boolean(value))
        .join("\n")
        .toLowerCase();
}

function matchesQuery(
    entry: GenerationModelEntry,
    query: string | undefined,
): boolean {
    return query === undefined || catalogSearchText(entry).includes(query);
}

function matchesCapabilities(
    entry: GenerationModelEntry,
    capabilities: string[] | undefined,
): boolean {
    if (capabilities === undefined) return true;
    const available = new Set<string>(entry.info.capabilities);
    return capabilities.every((capability) => available.has(capability));
}

function matchesAgent(
    entry: GenerationModelEntry,
    agent: boolean | undefined,
): boolean {
    return agent === undefined || (entry.info.agent === true) === agent;
}

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

// Discovery only: callers apply access checks before entering this function.
export async function filterCatalogEntries(
    c: Context<Env>,
    entries: GenerationModelEntry[],
): Promise<GenerationModelEntry[]> {
    const query = c.req.valid("query" as never) as ModelListQueryParams;
    const headers = c.req.valid("header" as never) as ModelListHeaders;
    const communitySource =
        query.community === undefined
            ? undefined
            : query.community === "true" || query.community === "1"
              ? "community"
              : "official";
    const source =
        query.source ?? communitySource ?? headers["pollinations-model-source"];
    const filtered = entries.filter(
        (entry) =>
            source === undefined ||
            entry.info.community === (source === "community"),
    );

    const lookup = await getModelHealthLookup(filtered);
    const reliability =
        query.reliability ??
        headers["pollinations-model-reliability"] ??
        "reliable";
    return (
        filtered
            .map((entry) => attachModelHealth(entry, lookup))
            .filter(
                (entry) =>
                    reliability === "all" ||
                    !isCommunityProxy(entry) ||
                    entry.communityEndpoint?.visibility === "private" ||
                    isModelReliable(entry.info.health?.success_rate),
            )
            // Text/capability/agent filters narrow the already-permission- and
            // visibility-filtered catalog; `limit` is applied last so it can only
            // ever return fewer of the models the caller is allowed to see.
            .filter((entry) => matchesQuery(entry, query.query))
            .filter((entry) => matchesCapabilities(entry, query.capabilities))
            .filter((entry) => matchesAgent(entry, query.agent))
            .slice(0, query.limit)
    );
}
