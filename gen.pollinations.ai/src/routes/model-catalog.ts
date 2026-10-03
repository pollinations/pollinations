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

// Every field a caller can reach with the discovery `query` filter. Aliases are
// included because callers often know the old `owner/model` id, not the
// canonical one.
function catalogSearchText(entry: GenerationModelEntry): string {
    return [
        entry.info.name,
        entry.info.title,
        entry.info.description ?? "",
        entry.info.publisher,
        ...entry.info.aliases,
    ]
        .join(" ")
        .toLowerCase();
}

function matchesAgentFilter(
    entry: GenerationModelEntry,
    agent: string | undefined,
): boolean {
    if (agent === undefined) return true;
    return (entry.info.agent === true) === (agent === "true" || agent === "1");
}

function matchesCapabilityFilter(
    entry: GenerationModelEntry,
    capabilities: readonly string[] | undefined,
): boolean {
    if (capabilities === undefined) return true;
    const declared: readonly string[] = entry.info.capabilities;
    return capabilities.every((capability) => declared.includes(capability));
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
    const visible = filtered
        .map((entry) => attachModelHealth(entry, lookup))
        .filter(
            (entry) =>
                reliability === "all" ||
                !isCommunityProxy(entry) ||
                entry.communityEndpoint?.visibility === "private" ||
                isModelReliable(entry.info.health?.success_rate),
        );

    // Discovery filters run after access, source, and reliability, so they can
    // only remove entries the caller already sees. `limit` runs last, which
    // preserves catalog ordering and never surfaces a hidden model.
    const searchTokens = (query.query ?? "")
        .trim()
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean);
    const narrowed = visible.filter((entry) => {
        if (!matchesAgentFilter(entry, query.agent)) return false;
        if (!matchesCapabilityFilter(entry, query.capabilities)) return false;
        if (searchTokens.length === 0) return true;
        const text = catalogSearchText(entry);
        return searchTokens.every((token) => text.includes(token));
    });

    return query.limit === undefined
        ? narrowed
        : narrowed.slice(0, query.limit);
}
