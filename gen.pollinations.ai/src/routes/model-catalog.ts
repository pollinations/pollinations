import {
    isModelReliable,
    type ModelHealth,
    modelHealthLookup,
} from "@shared/model-health.ts";
import type { Context } from "hono";
import type { Env } from "@/env.ts";
import {
    type ModelListHeaders,
    type ModelListQueryParams,
    splitList,
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

// Every field the discovery `query` filter searches, joined so a term can
// match any one of them. `name` is the canonical id and `aliases` keeps the
// older `owner/model` ids reachable; `title`, `description` and `publisher`
// cover the human-readable catalog text. A missing `description` contributes
// nothing instead of the string "undefined".
function catalogSearchText(entry: GenerationModelEntry): string {
    return [
        entry.info.name,
        ...entry.info.aliases,
        entry.info.title,
        entry.info.description ?? "",
        entry.info.publisher,
    ]
        .join("\n")
        .toLowerCase();
}

function matchesSearchQuery(
    entry: GenerationModelEntry,
    terms: readonly string[],
): boolean {
    if (terms.length === 0) return true;
    const text = catalogSearchText(entry);
    return terms.every((term) => text.includes(term));
}

function matchesCapabilities(
    entry: GenerationModelEntry,
    capabilities: readonly string[],
): boolean {
    if (capabilities.length === 0) return true;
    const declared = new Set<string>(entry.info.capabilities);
    return capabilities.every((capability) => declared.has(capability));
}

function matchesAgent(
    entry: GenerationModelEntry,
    agent: boolean | undefined,
): boolean {
    return agent === undefined || (entry.info.agent === true) === agent;
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
    const words = query.query?.toLowerCase().split(/\s+/).filter(Boolean) ?? [];
    const capabilities = splitList(query.capabilities ?? "");
    const agent = query.agent === "true" || query.agent === "1";
    const filtered = entries.filter(({ info }) => {
        if (source !== undefined && info.community !== (source === "community"))
            return false;
        if (query.agent !== undefined && Boolean(info.agent) !== agent)
            return false;
        const have: string[] = info.capabilities ?? [];
        if (!capabilities.every((item) => have.includes(item))) return false;
        const text = [
            info.name,
            ...info.aliases,
            info.title,
            info.description,
            info.publisher,
        ]
            .join(" ")
            .toLowerCase();
        return words.every((word) => text.includes(word));
    });

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

    // Text, capability and agent filters narrow the catalog the caller is
    // already allowed to see: visibility, API-key permissions, source and
    // reliability have all run above, so these can only remove entries.
    const terms = (query.query ?? "")
        .trim()
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean);
    const capabilities = query.capabilities ?? [];
    const agent =
        query.agent === undefined
            ? undefined
            : query.agent === "true" || query.agent === "1";
    const matches = reliable.filter(
        (entry) =>
            matchesSearchQuery(entry, terms) &&
            matchesCapabilities(entry, capabilities) &&
            matchesAgent(entry, agent),
    );

    // `limit` is applied last, so catalog ordering decides which of the
    // matching models fit and no filter can surface a hidden one.
    return query.limit === undefined
        ? matches
        : matches.slice(0, query.limit);
}
