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

function searchableText(entry: GenerationModelEntry): string {
    return [
        entry.info.name,
        ...(entry.info.aliases ?? []),
        entry.info.title,
        entry.info.description,
        entry.info.publisher,
    ]
        .filter((part): part is string => Boolean(part))
        .join("\n")
        .toLowerCase();
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
    const tokens =
        query.query?.toLowerCase().split(/\s+/).filter(Boolean) ?? [];
    const capabilities = query.capabilities;
    const agent =
        query.agent === undefined
            ? undefined
            : query.agent === "true" || query.agent === "1";
    const filtered = entries
        .filter(
            (entry) =>
                source === undefined ||
                entry.info.community === (source === "community"),
        )
        .filter((entry) => {
            if (tokens.length === 0) return true;
            const text = searchableText(entry);
            return tokens.every((token) => text.includes(token));
        })
        .filter(
            (entry) =>
                capabilities === undefined ||
                capabilities.length === 0 ||
                capabilities.every((capability) =>
                    entry.info.capabilities?.includes(capability),
                ),
        )
        .filter(
            (entry) =>
                agent === undefined || (entry.info.agent === true) === agent,
        );

    const lookup = await getModelHealthLookup(filtered);
    const reliability =
        query.reliability ??
        headers["pollinations-model-reliability"] ??
        "reliable";
    const reliable = filtered
        .map((entry) => attachModelHealth(entry, lookup))
        .filter(
            (entry) =>
                reliability === "all" ||
                !isCommunityProxy(entry) ||
                entry.communityEndpoint?.visibility === "private" ||
                isModelReliable(entry.info.health?.success_rate),
        );
    // Limit last: every other filter must apply before truncation, and the
    // catalog order is preserved.
    return query.limit === undefined
        ? reliable
        : reliable.slice(0, query.limit);
}
